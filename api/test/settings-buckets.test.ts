import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Bucket, Settings } from '@goal-tracker/shared/types'
import type { Leftover } from '@goal-tracker/shared/api'
import { ANCHOR_PAYDAY, createTestApp, errorCode, OTHER_USER, START_TIME } from './helpers.ts'

test('GET /settings is 404 settings_not_found before first-run setup', async () => {
  const app = createTestApp()
  const result = await app.call('GET', '/api/settings')
  assert.equal(result.status, 404)
  assert.equal(errorCode(result), 'settings_not_found')
})

test('PUT /settings sets cadence and currency itself and can be repeated', async () => {
  const app = createTestApp()
  const put = await app.call<Settings>('PUT', '/api/settings', {
    anchor_payday: ANCHOR_PAYDAY,
    timezone: 'America/Los_Angeles',
  })
  assert.equal(put.status, 200)
  assert.deepEqual(put.body, {
    user_id: 'user-a',
    pay_cadence: 'biweekly',
    anchor_payday: ANCHOR_PAYDAY,
    timezone: 'America/Los_Angeles',
    currency: 'USD',
  })
  await app.call('PUT', '/api/settings', { anchor_payday: '2026-11-06', timezone: 'america/los_angeles' })
  const got = await app.call<Settings>('GET', '/api/settings')
  assert.equal(got.body.anchor_payday, '2026-11-06')
  assert.equal(got.body.timezone, 'America/Los_Angeles')
})

test('PUT /settings rejects bad input, and cadence or currency from the client', async () => {
  const app = createTestApp()
  const bad = [
    {},
    { anchor_payday: ANCHOR_PAYDAY },
    { timezone: 'America/Los_Angeles' },
    { anchor_payday: '2026-02-30', timezone: 'America/Los_Angeles' },
    { anchor_payday: ANCHOR_PAYDAY, timezone: 'Mars/Base' },
    { anchor_payday: ANCHOR_PAYDAY, timezone: 5 },
    { anchor_payday: ANCHOR_PAYDAY, timezone: 'America/Los_Angeles', currency: 'EUR' },
    { anchor_payday: ANCHOR_PAYDAY, timezone: 'America/Los_Angeles', pay_cadence: 'weekly' },
  ]
  for (const body of bad) {
    const result = await app.call('PUT', '/api/settings', body)
    assert.equal(result.status, 400, JSON.stringify(body))
    assert.equal(errorCode(result), 'invalid_input')
  }
})

test('POST /buckets creates an available bucket with server-set fields', async () => {
  const app = createTestApp()
  const result = await app.call<Bucket>('POST', '/api/buckets', {
    name: '  Apple Savings  ',
    institution: 'Apple',
    notes: 'Computer',
  })
  assert.equal(result.status, 201)
  assert.deepEqual(result.body, {
    bucket_id: '00000000-0000-4000-8000-000000000001',
    user_id: 'user-a',
    name: 'Apple Savings',
    institution: 'Apple',
    notes: 'Computer',
    status: 'available',
    created_at: START_TIME,
    updated_at: START_TIME,
  })
})

test('POST /buckets rejects bad input, null, and client-supplied IDs, status and timestamps', async () => {
  const app = createTestApp()
  const bad = [
    {},
    { name: '' },
    { name: '   ' },
    { name: 'x'.repeat(101) },
    { name: 5 },
    { name: 'ok', institution: null },
    { name: 'ok', notes: 'x'.repeat(1001) },
    { name: 'ok', bucket_id: '00000000-0000-4000-8000-000000000009' },
    { name: 'ok', status: 'retired' },
    { name: 'ok', created_at: START_TIME },
    { name: 'ok', extra: true },
  ]
  for (const body of bad) {
    const result = await app.call('POST', '/api/buckets', body)
    assert.equal(result.status, 400, JSON.stringify(body))
  }
  assert.deepEqual((await app.call('GET', '/api/buckets')).body, [])
})

test('GET /buckets lists only the caller buckets, oldest first', async () => {
  const app = createTestApp()
  const first = await app.addBucket('First')
  app.setNow('2026-11-12T20:00:00.000Z')
  const second = await app.addBucket('Second')
  await app.addBucket('Theirs', OTHER_USER)
  const result = await app.call<Bucket[]>('GET', '/api/buckets')
  assert.deepEqual(
    result.body.map((bucket) => bucket.bucket_id),
    [first.bucket_id, second.bucket_id],
  )
})

test('PATCH /buckets: omitted is unchanged and null clears an optional field', async () => {
  const app = createTestApp()
  const created = await app.call<Bucket>('POST', '/api/buckets', { name: 'Old', institution: 'Apple', notes: 'Keep' })
  app.setNow('2026-11-12T20:00:00.000Z')
  const path = `/api/buckets/${created.body.bucket_id}`

  const renamed = await app.call<Bucket>('PATCH', path, { name: 'New', institution: null })
  assert.equal(renamed.status, 200)
  assert.equal(renamed.body.name, 'New')
  assert.equal('institution' in renamed.body, false)
  assert.equal(renamed.body.notes, 'Keep')
  assert.equal(renamed.body.updated_at, '2026-11-12T20:00:00.000Z')
  assert.equal(renamed.body.created_at, START_TIME)

  const stored = (await app.call<Bucket[]>('GET', '/api/buckets')).body[0]
  assert.deepEqual(stored, renamed.body)
})

test('PATCH /buckets rejects bad input, unknown fields (status), null name and an empty body', async () => {
  const app = createTestApp()
  const bucket = await app.addBucket()
  const path = `/api/buckets/${bucket.bucket_id}`
  for (const body of [{}, { name: null }, { name: '' }, { status: 'retired' }, { notes: 5 }]) {
    assert.equal((await app.call('PATCH', path, body)).status, 400, JSON.stringify(body))
  }
})

test('PATCH, retire and leftover on another user bucket are 404', async () => {
  const app = createTestApp()
  const theirs = await app.addBucket('Theirs', OTHER_USER)
  const path = `/api/buckets/${theirs.bucket_id}`
  assert.equal((await app.call('PATCH', path, { name: 'Mine now' })).status, 404)
  assert.equal((await app.call('POST', `${path}/retire`)).status, 404)
  assert.equal((await app.call('GET', `${path}/leftover`)).status, 404)
  const unknown = await app.call('PATCH', '/api/buckets/00000000-0000-4000-8000-0000000000ff', { name: 'x' })
  assert.equal(errorCode(unknown), 'not_found')
})

test('retire works from available only', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const path = `/api/buckets/${bucket.bucket_id}/retire`
  const retired = await app.call<Bucket>('POST', path)
  assert.equal(retired.status, 200)
  assert.equal(retired.body.status, 'retired')

  const again = await app.call('POST', path)
  assert.equal(again.status, 409)
  assert.equal(errorCode(again), 'bucket_not_available')

  const inUse = await app.addBucket('In use')
  await app.addGoal(inUse.bucket_id)
  assert.equal(errorCode(await app.call('POST', `/api/buckets/${inUse.bucket_id}/retire`)), 'bucket_not_available')
})

test('leftover is 0 with nulls when the bucket has none', async () => {
  const app = createTestApp()
  const bucket = await app.addBucket()
  const result = await app.call<Leftover>('GET', `/api/buckets/${bucket.bucket_id}/leftover`)
  assert.deepEqual(result.body, { amount: 0, from_goal_id: null, from_goal_name: null })
})
