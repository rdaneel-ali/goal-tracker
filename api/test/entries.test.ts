import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExportResponse, GoalDetail, GoalView } from '@goal-tracker/shared/api'
import type { Entry } from '@goal-tracker/shared/types'
import { goalKey } from '../src/repository.ts'
import { createTestApp, errorCode, OTHER_USER, START_TIME, TODAY, USER } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { RacingStore } from './racing-store.ts'

async function setUpGoal(app: TestApp) {
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const view = await app.addGoal(bucket.bucket_id)
  const goalId = view.goal.goal_id
  return { bucket, goalId, entriesPath: `/api/goals/${goalId}/entries`, goalPath: `/api/goals/${goalId}` }
}

async function getDetail(app: TestApp, goalPath: string): Promise<GoalDetail> {
  return (await app.call<GoalDetail>('GET', goalPath)).body
}

// A completed goal with 20000 left and a carryover withdrawal on it.
async function setUpLockedGoalWithCarryover(app: TestApp) {
  const { bucket, goalId, goalPath, entriesPath } = await setUpGoal(app)
  await app.addEntry(goalId, { amount: 30_000 })
  await app.call('POST', `${goalPath}/complete`)
  await app.addGoal(bucket.bucket_id, { name: 'Next', opening_balance: 10_000 })
  const carryover = (await getDetail(app, goalPath)).entries.find((entry) => entry.source === 'carryover')
  assert.ok(carryover)
  return { goalId, goalPath, entriesPath, carryover }
}

test('POST entries creates a manual entry with server-set fields', async () => {
  const app = createTestApp()
  const { goalId, entriesPath } = await setUpGoal(app)
  const result = await app.call<Entry>('POST', entriesPath, {
    type: 'deposit',
    amount: 12_345,
    date: '2026-11-05',
    note: ' Paycheck ',
  })
  assert.equal(result.status, 201)
  assert.deepEqual(result.body, {
    entry_id: '00000000-0000-4000-8000-000000000003',
    user_id: USER,
    goal_id: goalId,
    type: 'deposit',
    amount: 12_345,
    date: '2026-11-05',
    note: 'Paycheck',
    source: 'manual',
    created_at: START_TIME,
    updated_at: START_TIME,
  })
  const detail = await getDetail(app, `/api/goals/${goalId}`)
  assert.equal(detail.stats.balance, 12_345)
})

test('POST entries rejects bad input and any client-supplied ID, source or timestamp', async () => {
  const app = createTestApp()
  const { entriesPath } = await setUpGoal(app)
  const valid = { type: 'deposit', amount: 100, date: TODAY }
  const bad: Record<string, unknown>[] = [
    {},
    { ...valid, type: undefined },
    { ...valid, type: 'transfer' },
    { ...valid, type: 5 },
    { ...valid, amount: 0 },
    { ...valid, amount: -1 },
    { ...valid, amount: 1.5 },
    { ...valid, amount: '100' },
    { ...valid, amount: Number.MAX_SAFE_INTEGER },
    { ...valid, date: '2026-02-30' },
    { ...valid, date: undefined },
    { ...valid, date: '2300-01-01' },
    { ...valid, note: null },
    { ...valid, note: 'x'.repeat(501) },
    { ...valid, entry_id: '00000000-0000-4000-8000-000000000009' },
    { ...valid, source: 'carryover' },
    { ...valid, goal_id: '00000000-0000-4000-8000-000000000009' },
    { ...valid, user_id: OTHER_USER },
    { ...valid, created_at: START_TIME },
  ]
  for (const body of bad) {
    const result = await app.call('POST', entriesPath, body)
    assert.equal(result.status, 400, JSON.stringify(body))
    assert.equal(errorCode(result), 'invalid_input')
  }
})

test('a withdrawal larger than the balance is allowed', async () => {
  const app = createTestApp()
  const { entriesPath, goalPath } = await setUpGoal(app)
  const result = await app.call('POST', entriesPath, { type: 'withdrawal', amount: 5_000, date: TODAY })
  assert.equal(result.status, 201)
  assert.equal((await getDetail(app, goalPath)).stats.balance, -5_000)
})

test('an unknown goal is 404', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const path = '/api/goals/00000000-0000-4000-8000-0000000000aa/entries'
  assert.equal(errorCode(await app.call('POST', path, { type: 'deposit', amount: 1, date: TODAY })), 'not_found')
})

test('a locked goal accepts withdrawals but not deposits', async () => {
  const app = createTestApp()
  const { goalPath, entriesPath } = await setUpGoal(app)
  await app.call('POST', `${goalPath}/cancel`)
  const deposit = await app.call('POST', entriesPath, { type: 'deposit', amount: 100, date: TODAY })
  assert.equal(deposit.status, 409)
  assert.equal(errorCode(deposit), 'goal_locked')
  const withdrawal = await app.call('POST', entriesPath, { type: 'withdrawal', amount: 100, date: TODAY })
  assert.equal(withdrawal.status, 201)
})

test('a deposit is rejected if the goal was locked after it was read', async () => {
  const store = new RacingStore()
  const app = createTestApp({ store })
  const { goalId, entriesPath } = await setUpGoal(app)
  store.beforeTransact = async () => {
    const stored = await store.get(goalKey(USER, goalId))
    await store.put(goalKey(USER, goalId), { ...stored, status: 'completed' })
  }
  const result = await app.call('POST', entriesPath, { type: 'deposit', amount: 100, date: TODAY })
  assert.equal(result.status, 409)
  assert.equal(errorCode(result), 'goal_locked')
  const exported = (await app.call<ExportResponse>('GET', '/api/export')).body
  assert.deepEqual(exported.entries, [])
})

test('PATCH an entry: omitted fields stay, null clears the note, the balance follows', async () => {
  const app = createTestApp()
  const { goalId, goalPath, entriesPath } = await setUpGoal(app)
  const created = (
    await app.call<Entry>('POST', entriesPath, { type: 'deposit', amount: 10_000, date: '2026-11-05', note: 'Old' })
  ).body
  app.setNow('2026-11-12T20:00:00.000Z')
  const path = `${entriesPath}/${created.entry_id}`

  const edited = await app.call<Entry>('PATCH', path, { amount: 25_000, note: null })
  assert.equal(edited.status, 200)
  assert.equal(edited.body.amount, 25_000)
  assert.equal(edited.body.date, '2026-11-05')
  assert.equal('note' in edited.body, false)
  assert.equal(edited.body.updated_at, '2026-11-12T20:00:00.000Z')
  assert.equal(edited.body.created_at, START_TIME)
  assert.equal(edited.body.goal_id, goalId)

  const flipped = await app.call<Entry>('PATCH', path, { type: 'withdrawal' })
  assert.equal(flipped.body.type, 'withdrawal')
  assert.equal((await getDetail(app, goalPath)).stats.balance, -25_000)
})

test('changing an entry date moves it: one entry remains, under the new date', async () => {
  const app = createTestApp()
  const { goalId, goalPath, entriesPath } = await setUpGoal(app)
  const created = await app.addEntry(goalId, { date: '2026-11-05' })
  const moved = await app.call<Entry>('PATCH', `${entriesPath}/${created.entry_id}`, { date: '2026-11-09' })
  assert.equal(moved.status, 200)
  const detail = await getDetail(app, goalPath)
  assert.equal(detail.entries.length, 1)
  const [only] = detail.entries
  assert.ok(only)
  assert.equal(only.date, '2026-11-09')
  assert.equal(only.entry_id, created.entry_id)
  const exported = (await app.call<ExportResponse>('GET', '/api/export')).body
  assert.equal(exported.entries.length, 1)
})

test('PATCH an entry rejects bad input, an empty body, and IDs or source from the client', async () => {
  const app = createTestApp()
  const { goalId, entriesPath } = await setUpGoal(app)
  const entry = await app.addEntry(goalId)
  const path = `${entriesPath}/${entry.entry_id}`
  const bad = [
    {},
    { type: 'x' },
    { amount: 0 },
    { date: '2026-13-01' },
    { type: null },
    { amount: null },
    { source: 'carryover' },
    { entry_id: entry.entry_id },
    { goal_id: goalId },
  ]
  for (const body of bad) {
    assert.equal((await app.call('PATCH', path, body)).status, 400, JSON.stringify(body))
  }
})

test('an entry that does not exist, or belongs to another goal or user, is 404', async () => {
  const app = createTestApp()
  const { goalId, entriesPath } = await setUpGoal(app)
  const entry = await app.addEntry(goalId)
  const bucket = await app.addBucket('Other bucket')
  const other = await app.addGoal(bucket.bucket_id)
  const unknown = '00000000-0000-4000-8000-0000000000aa'
  assert.equal((await app.call('PATCH', `${entriesPath}/${unknown}`, { amount: 5 })).status, 404)
  assert.equal((await app.call('DELETE', `${entriesPath}/${unknown}`)).status, 404)
  // Right entry ID, wrong goal.
  const wrongGoal = `/api/goals/${other.goal.goal_id}/entries/${entry.entry_id}`
  assert.equal((await app.call('PATCH', wrongGoal, { amount: 5 })).status, 404)
  assert.equal((await app.call('DELETE', wrongGoal)).status, 404)
  // Another user.
  assert.equal((await app.call('DELETE', `${entriesPath}/${entry.entry_id}`, undefined, OTHER_USER)).status, 404)
})

test('DELETE removes the entry and the balance follows', async () => {
  const app = createTestApp()
  const { goalId, goalPath, entriesPath } = await setUpGoal(app)
  const keep = await app.addEntry(goalId, { amount: 1_000 })
  const drop = await app.addEntry(goalId, { amount: 5_000 })
  const result = await app.call('DELETE', `${entriesPath}/${drop.entry_id}`)
  assert.equal(result.status, 204)
  const detail = await getDetail(app, goalPath)
  assert.deepEqual(
    detail.entries.map((entry) => entry.entry_id),
    [keep.entry_id],
  )
  assert.equal(detail.stats.balance, 1_000)
  assert.equal((await app.call('DELETE', `${entriesPath}/${drop.entry_id}`)).status, 404)
})

test('edits and deletes are allowed on a locked goal', async () => {
  const app = createTestApp()
  const { goalId, goalPath, entriesPath } = await setUpGoal(app)
  const deposit = await app.addEntry(goalId, { amount: 1_000 })
  const withdrawal = await app.addEntry(goalId, { type: 'withdrawal', amount: 200 })
  await app.call('POST', `${goalPath}/complete`)
  assert.equal(
    (await app.call('PATCH', `${entriesPath}/${deposit.entry_id}`, { amount: 2_000, note: 'fixed' })).status,
    200,
  )
  assert.equal((await app.call('PATCH', `${entriesPath}/${withdrawal.entry_id}`, { date: '2026-11-01' })).status, 200)
  assert.equal((await app.call('DELETE', `${entriesPath}/${withdrawal.entry_id}`)).status, 204)
})

test('on a locked goal an edit cannot change an entry type to deposit', async () => {
  const app = createTestApp()
  const { goalId, goalPath, entriesPath } = await setUpGoal(app)
  const withdrawal = await app.addEntry(goalId, { type: 'withdrawal', amount: 200 })
  await app.call('POST', `${goalPath}/complete`)
  const result = await app.call('PATCH', `${entriesPath}/${withdrawal.entry_id}`, { type: 'deposit' })
  assert.equal(result.status, 409)
  assert.equal(errorCode(result), 'goal_locked')
  const stored = (await getDetail(app, goalPath)).entries[0]
  assert.equal(stored?.type, 'withdrawal')
})

test('turning an entry into a deposit is rejected if the goal was locked after it was read', async () => {
  const store = new RacingStore()
  const app = createTestApp({ store })
  const { goalId, entriesPath } = await setUpGoal(app)
  const withdrawal = await app.addEntry(goalId, { type: 'withdrawal', amount: 200 })
  store.beforeTransact = async () => {
    const stored = await store.get(goalKey(USER, goalId))
    await store.put(goalKey(USER, goalId), { ...stored, status: 'cancelled' })
  }
  const result = await app.call('PATCH', `${entriesPath}/${withdrawal.entry_id}`, { type: 'deposit' })
  assert.equal(errorCode(result), 'goal_locked')
})

test('an edit that deletes the entry first is 404 rather than a silent re-create', async () => {
  const store = new RacingStore()
  const app = createTestApp({ store })
  const { goalId, entriesPath } = await setUpGoal(app)
  const entry = await app.addEntry(goalId)
  store.beforeTransact = async () => {
    await app.call('DELETE', `${entriesPath}/${entry.entry_id}`)
  }
  const result = await app.call('PATCH', `${entriesPath}/${entry.entry_id}`, { amount: 5 })
  assert.equal(result.status, 404)
  assert.deepEqual((await app.call<ExportResponse>('GET', '/api/export')).body.entries, [])
})

test('carryover entries are read-only: edit and delete are 409 carryover_read_only', async () => {
  const app = createTestApp()
  const { goalPath, entriesPath, carryover } = await setUpLockedGoalWithCarryover(app)
  const path = `${entriesPath}/${carryover.entry_id}`
  for (const result of [await app.call('PATCH', path, { amount: 1 }), await app.call('DELETE', path)]) {
    assert.equal(result.status, 409)
    assert.equal(errorCode(result), 'carryover_read_only')
  }
  const detail = await getDetail(app, goalPath)
  assert.equal(detail.entries.find((entry) => entry.entry_id === carryover.entry_id)?.amount, 10_000)
})

test('goal views include entries across goals only through their own query', async () => {
  const app = createTestApp()
  const { goalId } = await setUpGoal(app)
  const bucket = await app.addBucket('Two')
  const other = await app.addGoal(bucket.bucket_id)
  await app.addEntry(goalId, { amount: 700 })
  await app.addEntry(other.goal.goal_id, { amount: 300 })
  const views = (await app.call<GoalView[]>('GET', '/api/goals')).body
  assert.deepEqual(
    views.map((view) => view.stats.balance),
    [700, 300],
  )
})
