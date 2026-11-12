import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHandler } from '../src/app.ts'
import type { ApiEvent } from '../src/app.ts'
import { MemoryStore } from '../src/memory-store.ts'
import { Repository } from '../src/repository.ts'
import { createTestApp, errorCode, makeId, OTHER_USER, START_TIME, USER } from './helpers.ts'

test('every response sends Cache-Control: no-store, errors and 204s included', async () => {
  const app = createTestApp()
  const ok = await app.call('GET', '/api/buckets')
  const missing = await app.call('GET', '/api/nope')
  const empty = await app.call('GET', '/api/settings')
  assert.equal(ok.headers['Cache-Control'], 'no-store')
  assert.equal(missing.headers['Cache-Control'], 'no-store')
  assert.equal(empty.headers['Cache-Control'], 'no-store')

  await app.setUpSettings()
  const bucket = await app.addBucket()
  const goal = await app.addGoal(bucket.bucket_id)
  const entry = await app.addEntry(goal.goal.goal_id)
  const deleted = await app.call('DELETE', `/api/goals/${goal.goal.goal_id}/entries/${entry.entry_id}`)
  assert.equal(deleted.status, 204)
  assert.equal(deleted.headers['Cache-Control'], 'no-store')
  assert.equal(deleted.body, undefined)
})

test('an unknown path or method is 404 not_found in the ApiError shape', async () => {
  const app = createTestApp()
  const unknownPath = await app.call('GET', '/api/nope')
  assert.equal(unknownPath.status, 404)
  assert.deepEqual(Object.keys(unknownPath.body as object), ['error'])
  assert.equal(errorCode(unknownPath), 'not_found')
  assert.equal((await app.call('DELETE', '/api/buckets')).status, 404)
  assert.equal((await app.call('GET', '/buckets')).status, 404)
})

test('a trailing slash still routes', async () => {
  const app = createTestApp()
  assert.equal((await app.call('GET', '/api/buckets/')).status, 200)
})

test('a malformed ID in the path is 400 invalid_input', async () => {
  const app = createTestApp()
  const result = await app.call('GET', '/api/goals/not-an-id')
  assert.equal(result.status, 400)
  assert.equal(errorCode(result), 'invalid_input')
  assert.equal(errorCode(await app.call('PATCH', '/api/buckets/a%23b', { name: 'x' })), 'invalid_input')
})

test('a request with no authenticated user never reaches a handler and returns 500 internal', async (t) => {
  t.mock.method(console, 'error', () => undefined)
  const handler = createHandler({
    repo: new Repository(new MemoryStore()),
    clock: () => new Date(START_TIME),
    newId: () => makeId(1),
  })
  const noClaims: ApiEvent = { rawPath: '/api/buckets', requestContext: { http: { method: 'GET' } } }
  const noSub: ApiEvent = {
    rawPath: '/api/buckets',
    requestContext: { http: { method: 'GET' }, authorizer: { jwt: { claims: {} } } },
  }
  for (const event of [noClaims, noSub]) {
    const response = await handler(event)
    assert.equal(response.statusCode, 500)
    assert.equal(response.headers['Cache-Control'], 'no-store')
  }
})

test('an unexpected failure is 500 internal with no details sent', async (t) => {
  const logged = t.mock.method(console, 'error', () => undefined)
  const store = new MemoryStore()
  store.query = () => Promise.reject(new Error('table internals exploded'))
  const app = createTestApp({ store })
  const result = await app.call('GET', '/api/buckets')
  assert.equal(result.status, 500)
  assert.deepEqual(result.body, { error: { code: 'internal', message: 'Something went wrong.' } })
  assert.equal(logged.mock.callCount(), 1)
})

test('a user ID in the body or query is ignored: records belong to the token subject', async () => {
  const app = createTestApp()
  const rejected = await app.call('POST', '/api/buckets', { name: 'x', user_id: OTHER_USER })
  assert.equal(rejected.status, 400)
  const bucket = await app.addBucket()
  assert.equal(bucket.user_id, USER)
  assert.deepEqual((await app.call('GET', '/api/buckets', undefined, OTHER_USER)).body, [])
})

test('a base64 body is decoded', async () => {
  const store = new MemoryStore()
  const handler = createHandler({
    repo: new Repository(store),
    clock: () => new Date(START_TIME),
    newId: () => makeId(1),
  })
  const response = await handler({
    rawPath: '/api/buckets',
    body: Buffer.from(JSON.stringify({ name: 'Encoded' })).toString('base64'),
    isBase64Encoded: true,
    requestContext: { http: { method: 'POST' }, authorizer: { jwt: { claims: { sub: USER } } } },
  })
  assert.equal(response.statusCode, 201)
  assert.equal((JSON.parse(response.body ?? '{}') as { name: string }).name, 'Encoded')
})

test('a body that is missing, not JSON, or not an object is 400', async () => {
  const app = createTestApp()
  assert.equal(errorCode(await app.call('POST', '/api/buckets')), 'invalid_input')
  assert.equal(errorCode(await app.call('POST', '/api/buckets', '{nope')), 'invalid_input')
  assert.equal(errorCode(await app.call('POST', '/api/buckets', '[]')), 'invalid_input')
  assert.equal(errorCode(await app.call('POST', '/api/buckets', 'null')), 'invalid_input')
})
