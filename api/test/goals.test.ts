import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExportResponse, GoalDetail, GoalView, Leftover } from '@goal-tracker/shared/api'
import type { Bucket } from '@goal-tracker/shared/types'
import { bucketKey } from '../src/repository.ts'
import { createTestApp, errorCode, OTHER_USER, START_TIME, TODAY, USER } from './helpers.ts'
import type { TestApp } from './helpers.ts'
import { RacingStore } from './racing-store.ts'

const OTHER_BUCKET_ID = '00000000-0000-4000-8000-0000000000ff'

async function setUpGoal(app: TestApp, extra: Record<string, unknown> = {}) {
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const view = await app.addGoal(bucket.bucket_id, extra)
  return { bucket, view, goalId: view.goal.goal_id, path: `/api/goals/${view.goal.goal_id}` }
}

async function getBucket(app: TestApp, bucketId: string): Promise<Bucket> {
  const buckets = (await app.call<Bucket[]>('GET', '/api/buckets')).body
  const bucket = buckets.find((candidate) => candidate.bucket_id === bucketId)
  assert.ok(bucket)
  return bucket
}

test('every goal endpoint answers 409 settings_required until settings exist', async () => {
  const app = createTestApp()
  const bucket = await app.addBucket()
  const goalId = '00000000-0000-4000-8000-0000000000aa'
  const body = { bucket_id: bucket.bucket_id, name: 'Mac', target_amount: 100, target_date: '2026-12-31' }
  const requests: [string, string, unknown][] = [
    ['GET', '/api/goals', undefined],
    ['POST', '/api/goals', body],
    ['GET', `/api/goals/${goalId}`, undefined],
    ['PATCH', `/api/goals/${goalId}`, { name: 'x' }],
    ['POST', `/api/goals/${goalId}/complete`, undefined],
    ['POST', `/api/goals/${goalId}/cancel`, undefined],
    ['POST', `/api/goals/${goalId}/reopen`, undefined],
  ]
  for (const [method, path, requestBody] of requests) {
    const result = await app.call(method, path, requestBody)
    assert.equal(result.status, 409, `${method} ${path}`)
    assert.equal(errorCode(result), 'settings_required')
  }
})

test('input is checked before settings: a bad body is 400 even without settings', async () => {
  const app = createTestApp()
  assert.equal((await app.call('POST', '/api/goals', { name: 'x' })).status, 400)
})

test('POST /goals creates an active goal, claims the bucket and returns server-computed stats', async () => {
  const app = createTestApp()
  const { bucket, view } = await setUpGoal(app, { linked_item: { label: 'Apple', url: 'https://apple.com/mac' } })
  assert.deepEqual(view.goal, {
    goal_id: '00000000-0000-4000-8000-000000000002',
    user_id: USER,
    bucket_id: bucket.bucket_id,
    name: 'Mac mini',
    target_amount: 100_000,
    target_date: '2026-12-31',
    start_date: TODAY,
    opening_balance: 0,
    status: 'active',
    linked_item: { label: 'Apple', url: 'https://apple.com/mac' },
    created_at: START_TIME,
    updated_at: START_TIME,
  })
  assert.deepEqual(view.stats, {
    balance: 0,
    remaining: 100_000,
    progress: 0,
    paydays_remaining: 3,
    paydays_elapsed: 0,
    pace: null,
    needed_per_paycheck: 33_334,
    projected_finish_date: null,
    is_on_track: false,
    is_amount_reached: false,
    is_date_reached: false,
  })
  assert.equal((await getBucket(app, bucket.bucket_id)).status, 'in_use')
})

test('stats are recomputed from entries on every request', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const view = await app.addGoal(bucket.bucket_id, { start_date: '2026-10-23', opening_balance: 5_000 })
  await app.addEntry(view.goal.goal_id, { amount: 20_000 })
  await app.addEntry(view.goal.goal_id, { type: 'withdrawal', amount: 5_000 })
  const { stats } = (await app.call<GoalDetail>('GET', `/api/goals/${view.goal.goal_id}`)).body
  assert.equal(stats.balance, 20_000)
  assert.equal(stats.remaining, 80_000)
  assert.equal(stats.progress, 0.2)
  assert.equal(stats.paydays_elapsed, 2)
  assert.equal(stats.pace, 7_500)
  assert.equal(stats.needed_per_paycheck, 26_667)
  assert.equal(stats.projected_finish_date, '2027-04-09')
  assert.equal(stats.is_on_track, false)
})

test('"today" is the date in the settings time zone, not UTC', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const bucket = await app.addBucket()
  app.setNow('2026-11-12T05:00:00.000Z') // 21:00 on 11-11 in Los Angeles, already 11-12 in UTC
  const first = await app.addGoal(bucket.bucket_id)
  assert.equal(first.goal.start_date, '2026-11-11')
})

test('POST /goals rejects bad input and client-supplied IDs, status and timestamps', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const valid = { bucket_id: bucket.bucket_id, name: 'Mac', target_amount: 100_000, target_date: '2026-12-31' }
  const bad: Record<string, unknown>[] = [
    {},
    { ...valid, bucket_id: undefined },
    { ...valid, bucket_id: 'abc' },
    { ...valid, name: '' },
    { ...valid, target_amount: 0 },
    { ...valid, target_amount: -5 },
    { ...valid, target_amount: 10.5 },
    { ...valid, target_amount: '1000' },
    { ...valid, target_amount: 10_000_000_001 },
    { ...valid, target_date: '2026-13-01' },
    { ...valid, target_date: '2026-12-31T00:00:00Z' },
    { ...valid, target_date: '1999-12-31' },
    { ...valid, start_date: 'tomorrow' },
    { ...valid, opening_balance: -1 },
    { ...valid, opening_balance: 1.5 },
    { ...valid, linked_item: null },
    { ...valid, linked_item: { label: 'x', url: 'javascript:alert(1)' } },
    { ...valid, linked_item: { label: 'x', url: 'https://a.example', extra: 1 } },
    { ...valid, linked_item: { label: '', url: 'https://a.example' } },
    { ...valid, goal_id: '00000000-0000-4000-8000-000000000009' },
    { ...valid, user_id: OTHER_USER },
    { ...valid, status: 'completed' },
    { ...valid, created_at: START_TIME },
  ]
  for (const body of bad) {
    const result = await app.call('POST', '/api/goals', body)
    assert.equal(result.status, 400, JSON.stringify(body))
    assert.equal(errorCode(result), 'invalid_input')
  }
  assert.deepEqual((await app.call('GET', '/api/goals')).body, [])
})

test('POST /goals: unknown bucket (or another user bucket) is 404; taken or retired bucket is 409', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const body = { name: 'Mac', target_amount: 100_000, target_date: '2026-12-31' }
  assert.equal((await app.call('POST', '/api/goals', { ...body, bucket_id: OTHER_BUCKET_ID })).status, 404)

  const theirs = await app.addBucket('Theirs', OTHER_USER)
  assert.equal((await app.call('POST', '/api/goals', { ...body, bucket_id: theirs.bucket_id })).status, 404)

  const taken = await app.addBucket('Taken')
  await app.addGoal(taken.bucket_id)
  const second = await app.call('POST', '/api/goals', { ...body, bucket_id: taken.bucket_id })
  assert.equal(second.status, 409)
  assert.equal(errorCode(second), 'bucket_not_available')

  const retired = await app.addBucket('Retired')
  await app.call('POST', `/api/buckets/${retired.bucket_id}/retire`)
  const third = await app.call('POST', '/api/goals', { ...body, bucket_id: retired.bucket_id })
  assert.equal(errorCode(third), 'bucket_not_available')
})

test('a bucket with no leftover accepts any opening balance and writes no carryover', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const view = await app.addGoal(bucket.bucket_id, { opening_balance: 250_000 })
  assert.equal(view.stats.balance, 250_000)
  const exported = (await app.call<ExportResponse>('GET', '/api/export')).body
  assert.deepEqual(exported.entries, [])
})

async function completeFirstGoalWithLeftover(app: TestApp) {
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const first = await app.addGoal(bucket.bucket_id, { name: 'Mac mini' })
  await app.addEntry(first.goal.goal_id, { amount: 60_000 })
  await app.addEntry(first.goal.goal_id, { type: 'withdrawal', amount: 40_000, note: 'Bought it' })
  await app.call('POST', `/api/goals/${first.goal.goal_id}/complete`)
  return { bucket, first }
}

test('leftover is the balance of the most recent completed or cancelled goal in the bucket', async () => {
  const app = createTestApp()
  const { bucket, first } = await completeFirstGoalWithLeftover(app)
  const leftover = await app.call<Leftover>('GET', `/api/buckets/${bucket.bucket_id}/leftover`)
  assert.deepEqual(leftover.body, { amount: 20_000, from_goal_id: first.goal.goal_id, from_goal_name: 'Mac mini' })
})

test('creating a goal with leftover rejects a too-high opening balance with opening_balance_too_high', async () => {
  const app = createTestApp()
  const { bucket } = await completeFirstGoalWithLeftover(app)
  const body = {
    bucket_id: bucket.bucket_id,
    name: 'Next',
    target_amount: 50_000,
    target_date: '2026-12-31',
    opening_balance: 30_000,
  }
  const result = await app.call<{ error: { message: string } }>('POST', '/api/goals', body)
  assert.equal(result.status, 409)
  assert.equal(errorCode(result), 'opening_balance_too_high')
  assert.equal(result.body.error.message, 'Only $200.00 is left in this bucket. Add the rest as a deposit.')
  assert.equal((await getBucket(app, bucket.bucket_id)).status, 'available')
})

test('creating a goal from leftover writes the goal, the bucket claim and a carryover withdrawal together', async () => {
  const app = createTestApp()
  const { bucket, first } = await completeFirstGoalWithLeftover(app)
  app.setNow('2026-11-12T05:00:00.000Z') // 11-11 in Los Angeles
  const second = await app.addGoal(bucket.bucket_id, { name: 'Next', opening_balance: 15_000 })
  assert.equal(second.stats.balance, 15_000)
  assert.equal((await getBucket(app, bucket.bucket_id)).status, 'in_use')

  const previous = (await app.call<GoalDetail>('GET', `/api/goals/${first.goal.goal_id}`)).body
  assert.equal(previous.stats.balance, 5_000)
  const [carryover] = previous.entries
  assert.ok(carryover)
  assert.equal(carryover.source, 'carryover')
  assert.equal(carryover.type, 'withdrawal')
  assert.equal(carryover.amount, 15_000)
  assert.equal(carryover.date, '2026-11-11')
  assert.equal(carryover.note, 'Carried to Next')
  assert.equal(carryover.goal_id, first.goal.goal_id)
})

test('an opening balance of 0 on a bucket with leftover writes no carryover', async () => {
  const app = createTestApp()
  const { bucket, first } = await completeFirstGoalWithLeftover(app)
  await app.addGoal(bucket.bucket_id, { name: 'Next' })
  const previous = (await app.call<GoalDetail>('GET', `/api/goals/${first.goal.goal_id}`)).body
  assert.equal(previous.entries.length, 2)
  assert.equal(previous.stats.balance, 20_000)
})

test('a cancelled goal also leaves its balance as leftover', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const first = await app.addGoal(bucket.bucket_id, { opening_balance: 12_300 })
  await app.call('POST', `/api/goals/${first.goal.goal_id}/cancel`)
  app.setNow('2026-11-13T20:00:00.000Z')
  const leftover = (await app.call<Leftover>('GET', `/api/buckets/${bucket.bucket_id}/leftover`)).body
  assert.equal(leftover.amount, 12_300)
})

test('a failed bucket condition at create time is 409 and nothing is written', async () => {
  const store = new RacingStore()
  const app = createTestApp({ store })
  const { bucket } = await completeFirstGoalWithLeftover(app)
  store.beforeTransact = async () => {
    // Another request claims the bucket after this one has read it.
    const current = await store.get(bucketKey(USER, bucket.bucket_id))
    await store.put(bucketKey(USER, bucket.bucket_id), { ...current, status: 'in_use' })
  }
  const body = {
    bucket_id: bucket.bucket_id,
    name: 'Next',
    target_amount: 50_000,
    target_date: '2026-12-31',
    opening_balance: 10_000,
  }
  const result = await app.call('POST', '/api/goals', body)
  assert.equal(result.status, 409)
  assert.equal(errorCode(result), 'bucket_not_available')
  const exported = (await app.call<ExportResponse>('GET', '/api/export')).body
  assert.equal(exported.goals.length, 1)
  assert.equal(exported.entries.length, 2)
})

test('GET /goals lists the caller goals with their own balances only', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const bucketA = await app.addBucket('A')
  const bucketB = await app.addBucket('B')
  const goalA = await app.addGoal(bucketA.bucket_id, { name: 'A' })
  app.setNow('2026-11-12T20:00:00.000Z')
  const goalB = await app.addGoal(bucketB.bucket_id, { name: 'B' })
  await app.addEntry(goalA.goal.goal_id, { amount: 1_000 })
  await app.addEntry(goalB.goal.goal_id, { amount: 2_000 })
  await app.setUpSettings(OTHER_USER)
  const theirBucket = await app.addBucket('Theirs', OTHER_USER)
  await app.addGoal(theirBucket.bucket_id, { name: 'Theirs' }, OTHER_USER)

  const views = (await app.call<GoalView[]>('GET', '/api/goals')).body
  assert.deepEqual(
    views.map((view) => [view.goal.name, view.stats.balance]),
    [
      ['A', 1_000],
      ['B', 2_000],
    ],
  )
})

test('GET /goals/:id returns entries newest first: date, then created_at', async () => {
  const app = createTestApp()
  const { goalId, path } = await setUpGoal(app)
  const older = await app.addEntry(goalId, { date: '2026-11-01' })
  const newestDate = await app.addEntry(goalId, { date: '2026-11-10' })
  app.setNow('2026-11-11T21:00:00.000Z')
  const sameDateLater = await app.addEntry(goalId, { date: '2026-11-10' })
  const detail = (await app.call<GoalDetail>('GET', path)).body
  assert.deepEqual(
    detail.entries.map((entry) => entry.entry_id),
    [sameDateLater.entry_id, newestDate.entry_id, older.entry_id],
  )
})

test('GET and every write on another user goal is 404', async () => {
  const app = createTestApp()
  await app.setUpSettings(OTHER_USER)
  await app.setUpSettings()
  const theirBucket = await app.addBucket('Theirs', OTHER_USER)
  const theirs = await app.addGoal(theirBucket.bucket_id, {}, OTHER_USER)
  const path = `/api/goals/${theirs.goal.goal_id}`
  for (const [method, suffix, body] of [
    ['GET', '', undefined],
    ['PATCH', '', { name: 'Mine' }],
    ['POST', '/complete', undefined],
    ['POST', '/cancel', undefined],
    ['POST', '/reopen', undefined],
    ['POST', '/entries', { type: 'deposit', amount: 100, date: TODAY }],
  ] as const) {
    assert.equal((await app.call(method, path + suffix, body)).status, 404, `${method} ${suffix}`)
  }
})

test('PATCH /goals edits name, target amount, target date and linked item', async () => {
  const app = createTestApp()
  const { path } = await setUpGoal(app, {
    linked_item: { label: 'Old', url: 'https://old.example', price_watch_id: 'w1' },
  })
  app.setNow('2026-11-12T20:00:00.000Z')

  const edited = await app.call<GoalView>('PATCH', path, {
    name: 'Mac mini M6',
    target_amount: 120_000,
    target_date: '2027-01-15',
    linked_item: { label: 'New', url: 'https://new.example' },
  })
  assert.equal(edited.status, 200)
  assert.equal(edited.body.goal.name, 'Mac mini M6')
  assert.equal(edited.body.goal.target_amount, 120_000)
  assert.equal(edited.body.goal.target_date, '2027-01-15')
  // linked_item is replaced whole: the old price_watch_id does not survive.
  assert.deepEqual(edited.body.goal.linked_item, { label: 'New', url: 'https://new.example' })
  assert.equal(edited.body.goal.updated_at, '2026-11-12T20:00:00.000Z')
  assert.equal(edited.body.stats.remaining, 120_000)

  const unchanged = await app.call<GoalView>('PATCH', path, { name: 'Renamed' })
  assert.equal(unchanged.body.goal.target_amount, 120_000)
  assert.deepEqual(unchanged.body.goal.linked_item, { label: 'New', url: 'https://new.example' })

  const cleared = await app.call<GoalView>('PATCH', path, { linked_item: null })
  assert.equal('linked_item' in cleared.body.goal, false)
  const stored = (await app.call<GoalDetail>('GET', path)).body
  assert.deepEqual(stored.goal, cleared.body.goal)
})

test('PATCH /goals rejects fixed fields, bad values, null for required fields and an empty body', async () => {
  const app = createTestApp()
  const { path } = await setUpGoal(app)
  const bad = [
    {},
    { opening_balance: 5 },
    { bucket_id: '00000000-0000-4000-8000-0000000000aa' },
    { start_date: '2026-01-01' },
    { status: 'completed' },
    { name: null },
    { target_amount: null },
    { target_amount: 0 },
    { target_date: 'soon' },
  ]
  for (const body of bad) {
    assert.equal((await app.call('PATCH', path, body)).status, 400, JSON.stringify(body))
  }
})

test('a locked goal accepts no edits', async () => {
  const app = createTestApp()
  const { path } = await setUpGoal(app)
  await app.call('POST', `${path}/cancel`)
  const result = await app.call('PATCH', path, { name: 'Late' })
  assert.equal(result.status, 409)
  assert.equal(errorCode(result), 'goal_locked')
})

test('complete: the server sets the reason, releases the bucket and writes both together', async () => {
  const app = createTestApp()
  const { bucket, path, goalId } = await setUpGoal(app)
  app.setNow('2026-11-12T20:00:00.000Z')
  const manual = await app.call<GoalView>('POST', `${path}/complete`)
  assert.equal(manual.status, 200)
  assert.equal(manual.body.goal.status, 'completed')
  assert.equal(manual.body.goal.completion_reason, 'manual')
  assert.equal(manual.body.goal.completed_at, '2026-11-12T20:00:00.000Z')
  assert.equal(manual.body.stats.is_amount_reached, false)
  const released = await getBucket(app, bucket.bucket_id)
  assert.equal(released.status, 'available')
  assert.equal(released.updated_at, '2026-11-12T20:00:00.000Z')

  const again = await app.call('POST', `${path}/complete`)
  assert.equal(again.status, 409)
  assert.equal(errorCode(again), 'goal_locked')
  assert.ok(goalId)
})

test('complete picks amount_reached, then date_reached, from the server numbers', async () => {
  const app = createTestApp()
  const funded = await setUpGoal(app, { target_amount: 10_000 })
  await app.addEntry(funded.goalId, { amount: 10_000 })
  const reached = await app.call<GoalView>('POST', `${funded.path}/complete`)
  assert.equal(reached.body.goal.completion_reason, 'amount_reached')

  const bucket = await app.addBucket('Second')
  const late = await app.addGoal(bucket.bucket_id, { target_date: '2026-11-20' })
  app.setNow('2026-11-21T20:00:00.000Z')
  const overdue = await app.call<GoalView>('POST', `/api/goals/${late.goal.goal_id}/complete`)
  assert.equal(overdue.body.goal.completion_reason, 'date_reached')
})

test('cancel locks the goal without a reason and releases the bucket', async () => {
  const app = createTestApp()
  const { bucket, path } = await setUpGoal(app)
  const result = await app.call<GoalView>('POST', `${path}/cancel`)
  assert.equal(result.status, 200)
  assert.equal(result.body.goal.status, 'cancelled')
  assert.equal('completion_reason' in result.body.goal, false)
  assert.equal((await getBucket(app, bucket.bucket_id)).status, 'available')
  assert.equal(errorCode(await app.call('POST', `${path}/cancel`)), 'goal_locked')
  assert.equal(errorCode(await app.call('POST', `${path}/complete`)), 'goal_locked')
})

test('reopen: clears the completion fields and claims the bucket again', async () => {
  const app = createTestApp()
  const { bucket, path } = await setUpGoal(app)
  await app.call('POST', `${path}/complete`)
  const result = await app.call<GoalView>('POST', `${path}/reopen`)
  assert.equal(result.status, 200)
  assert.equal(result.body.goal.status, 'active')
  assert.equal('completed_at' in result.body.goal, false)
  assert.equal('completion_reason' in result.body.goal, false)
  assert.equal((await getBucket(app, bucket.bucket_id)).status, 'in_use')
})

test('reopen is 409 while the bucket holds another active goal, and 400 for an active goal', async () => {
  const app = createTestApp()
  const { bucket, path } = await setUpGoal(app)
  assert.equal(errorCode(await app.call('POST', `${path}/reopen`)), 'invalid_input')
  await app.call('POST', `${path}/complete`)
  const second = await app.addGoal(bucket.bucket_id, { name: 'Second' })
  const blocked = await app.call<{ error: { message: string } }>('POST', `${path}/reopen`)
  assert.equal(blocked.status, 409)
  assert.equal(errorCode(blocked), 'bucket_not_available')
  assert.equal(blocked.body.error.message, 'This bucket already holds another active goal.')
  await app.call('POST', `/api/goals/${second.goal.goal_id}/cancel`)
  assert.equal((await app.call('POST', `${path}/reopen`)).status, 200)
})

test('reopen: a stale goals list is caught by the bucket condition and nothing is written', async () => {
  const store = new RacingStore()
  const app = createTestApp({ store })
  const { bucket, path } = await setUpGoal(app)
  await app.call('POST', `${path}/complete`)
  store.beforeTransact = async () => {
    const current = await store.get(bucketKey(USER, bucket.bucket_id))
    await store.put(bucketKey(USER, bucket.bucket_id), { ...current, status: 'in_use' })
  }
  const result = await app.call('POST', `${path}/reopen`)
  assert.equal(result.status, 409)
  assert.equal(errorCode(result), 'bucket_not_available')
  const stored = (await app.call<GoalDetail>('GET', path)).body
  assert.equal(stored.goal.status, 'completed')
})

test('complete: a goal locked after it was read is rejected by the transaction', async () => {
  const store = new RacingStore()
  const app = createTestApp({ store })
  const { path, goalId } = await setUpGoal(app)
  store.beforeTransact = async () => {
    const stored = (await app.call<GoalDetail>('GET', path)).body.goal
    const goalKeyForTest = { pk: `USER#${USER}`, sk: `GOAL#${goalId}` }
    await store.put(goalKeyForTest, { ...stored, status: 'cancelled' })
  }
  const result = await app.call('POST', `${path}/complete`)
  assert.equal(result.status, 409)
  assert.equal(errorCode(result), 'goal_locked')
})
