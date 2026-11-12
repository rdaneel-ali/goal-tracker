import type { ApiEvent } from '../src/app.ts'
import { createHandler } from '../src/app.ts'
import { MemoryStore } from '../src/memory-store.ts'
import { Repository } from '../src/repository.ts'
import type { Bucket, Entry } from '@goal-tracker/shared/types'
import type { GoalView } from '@goal-tracker/shared/api'

export const USER = 'user-a'
export const OTHER_USER = 'user-b'
// 12:00 in Los Angeles (PST). Paydays fall every 14 days from ANCHOR_PAYDAY: 11-06, 11-20, 12-04, 12-18.
export const START_TIME = '2026-11-11T20:00:00.000Z'
export const TODAY = '2026-11-11'
export const ANCHOR_PAYDAY = '2026-10-23'

export interface CallResult<T = unknown> {
  status: number
  headers: Record<string, string>
  body: T
}

export interface TestApp {
  store: MemoryStore
  call: <T = unknown>(method: string, path: string, body?: unknown, userId?: string) => Promise<CallResult<T>>
  setNow: (iso: string) => void
  // Fixture shortcuts that go through the API like the web would.
  setUpSettings: (userId?: string) => Promise<void>
  addBucket: (name?: string, userId?: string) => Promise<Bucket>
  addGoal: (bucketId: string, extra?: Record<string, unknown>, userId?: string) => Promise<GoalView>
  addEntry: (goalId: string, extra?: Record<string, unknown>, userId?: string) => Promise<Entry>
}

export function makeId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

export function createTestApp(options: { store?: MemoryStore } = {}): TestApp {
  const store = options.store ?? new MemoryStore()
  let current = new Date(START_TIME)
  let counter = 0
  const handler = createHandler({
    repo: new Repository(store),
    clock: () => current,
    newId: () => makeId(++counter),
  })

  async function call<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    userId: string = USER,
  ): Promise<CallResult<T>> {
    const event: ApiEvent = {
      rawPath: path,
      requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: userId } } } },
    }
    if (body !== undefined) event.body = typeof body === 'string' ? body : JSON.stringify(body)
    const response = await handler(event)
    return {
      status: response.statusCode,
      headers: response.headers,
      body: (response.body === undefined ? undefined : JSON.parse(response.body)) as T,
    }
  }

  return {
    store,
    call,
    setNow(iso) {
      current = new Date(iso)
    },
    async setUpSettings(userId = USER) {
      await call('PUT', '/api/settings', { anchor_payday: ANCHOR_PAYDAY, timezone: 'America/Los_Angeles' }, userId)
    },
    async addBucket(name = 'Apple Savings', userId = USER) {
      return (await call<Bucket>('POST', '/api/buckets', { name }, userId)).body
    },
    async addGoal(bucketId, extra = {}, userId = USER) {
      const request = {
        bucket_id: bucketId,
        name: 'Mac mini',
        target_amount: 100_000,
        target_date: '2026-12-31',
        ...extra,
      }
      const result = await call<GoalView>('POST', '/api/goals', request, userId)
      if (result.status !== 201) throw new Error(`Goal fixture failed: ${JSON.stringify(result.body)}`)
      return result.body
    },
    async addEntry(goalId, extra = {}, userId = USER) {
      const request = { type: 'deposit', amount: 10_000, date: TODAY, ...extra }
      const result = await call<Entry>('POST', `/api/goals/${goalId}/entries`, request, userId)
      if (result.status !== 201) throw new Error(`Entry fixture failed: ${JSON.stringify(result.body)}`)
      return result.body
    },
  }
}

export function errorCode(result: CallResult): string {
  return (result.body as { error: { code: string } }).error.code
}
