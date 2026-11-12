import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExportResponse, GoalView, Leftover } from '@goal-tracker/shared/api'
import { seedDevData } from '../src/dev-seed.ts'
import { createTestApp, TODAY } from './helpers.ts'

test('the dev seed goes through the API and gives realistic goals and a leftover to try', async () => {
  const app = createTestApp()
  await seedDevData(async (method, path, body) => {
    const result = await app.call(method, path, body)
    assert.ok(result.status < 300, `${method} ${path}: ${JSON.stringify(result.body)}`)
    return result.body
  }, TODAY)

  const [mac, emergency, airpods] = (await app.call<GoalView[]>('GET', '/api/goals')).body
  assert.ok(mac && emergency && airpods)
  assert.equal(mac.goal.name, 'Mac mini M6')
  assert.equal(mac.stats.is_on_track, true)
  assert.equal(emergency.stats.is_on_track, false)
  assert.equal(airpods.goal.status, 'completed')

  const { buckets } = (await app.call<ExportResponse>('GET', '/api/export')).body
  assert.deepEqual(
    buckets.map((bucket) => bucket.status),
    ['in_use', 'in_use', 'available'],
  )
  const capitalOne = buckets.find((bucket) => bucket.name === 'Capital One 360')
  const leftover = await app.call<Leftover>('GET', `/api/buckets/${capitalOne?.bucket_id}/leftover`)
  assert.equal(leftover.body.amount, 4_200)
})
