import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExportResponse } from '@goal-tracker/shared/api'
import { createTestApp, OTHER_USER, USER } from './helpers.ts'

test('export works before settings exist, with settings null', async () => {
  const app = createTestApp()
  await app.addBucket()
  const result = await app.call<ExportResponse>('GET', '/api/export')
  assert.equal(result.status, 200)
  assert.equal(result.body.settings, null)
  assert.equal(result.body.buckets.length, 1)
  assert.deepEqual(result.body.goals, [])
  assert.deepEqual(result.body.entries, [])
})

test('export returns everything the caller owns, and nothing else', async () => {
  const app = createTestApp()
  await app.setUpSettings()
  const bucket = await app.addBucket()
  const goal = await app.addGoal(bucket.bucket_id)
  const entry = await app.addEntry(goal.goal.goal_id)
  await app.setUpSettings(OTHER_USER)
  const theirBucket = await app.addBucket('Theirs', OTHER_USER)
  const theirGoal = await app.addGoal(theirBucket.bucket_id, {}, OTHER_USER)
  await app.addEntry(theirGoal.goal.goal_id, {}, OTHER_USER)

  const { body } = await app.call<ExportResponse>('GET', '/api/export')
  assert.equal(body.settings?.user_id, USER)
  assert.deepEqual(
    body.buckets.map((item) => item.bucket_id),
    [bucket.bucket_id],
  )
  assert.deepEqual(
    body.goals.map((item) => item.goal_id),
    [goal.goal.goal_id],
  )
  assert.deepEqual(
    body.entries.map((item) => item.entry_id),
    [entry.entry_id],
  )
})
