import type {
  ApiError,
  CreateBucketRequest,
  CreateEntryRequest,
  CreateGoalRequest,
  ErrorCode,
  ExportResponse,
  GoalDetail,
  GoalView,
  Leftover,
  PutSettingsRequest,
  UpdateBucketRequest,
  UpdateEntryRequest,
  UpdateGoalRequest,
} from '@goal-tracker/shared/api'
import type { Bucket, Entry, Settings } from '@goal-tracker/shared/types'

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: ErrorCode | 'network'

  constructor(status: number, code: ErrorCode | 'network', message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

function isApiError(body: unknown): body is ApiError {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false
  const error: unknown = body.error
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    })
  } catch {
    throw new ApiRequestError(0, 'network', 'Could not reach the server. Check your connection and try again.')
  }
  if (response.status === 204) return undefined as T
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (isApiError(payload)) throw new ApiRequestError(response.status, payload.error.code, payload.error.message)
    throw new ApiRequestError(response.status, 'internal', 'Something went wrong. Please try again.')
  }
  return payload as T
}

export const api = {
  getSettings: () => request<Settings>('GET', '/settings'),
  putSettings: (body: PutSettingsRequest) => request<Settings>('PUT', '/settings', body),

  listBuckets: () => request<Bucket[]>('GET', '/buckets'),
  createBucket: (body: CreateBucketRequest) => request<Bucket>('POST', '/buckets', body),
  updateBucket: (bucketId: string, body: UpdateBucketRequest) => request<Bucket>('PATCH', `/buckets/${bucketId}`, body),
  retireBucket: (bucketId: string) => request<Bucket>('POST', `/buckets/${bucketId}/retire`),
  getLeftover: (bucketId: string) => request<Leftover>('GET', `/buckets/${bucketId}/leftover`),

  listGoals: () => request<GoalView[]>('GET', '/goals'),
  createGoal: (body: CreateGoalRequest) => request<GoalView>('POST', '/goals', body),
  getGoal: (goalId: string) => request<GoalDetail>('GET', `/goals/${goalId}`),
  updateGoal: (goalId: string, body: UpdateGoalRequest) => request<GoalView>('PATCH', `/goals/${goalId}`, body),
  completeGoal: (goalId: string) => request<GoalView>('POST', `/goals/${goalId}/complete`),
  cancelGoal: (goalId: string) => request<GoalView>('POST', `/goals/${goalId}/cancel`),
  reopenGoal: (goalId: string) => request<GoalView>('POST', `/goals/${goalId}/reopen`),

  createEntry: (goalId: string, body: CreateEntryRequest) => request<Entry>('POST', `/goals/${goalId}/entries`, body),
  updateEntry: (goalId: string, entryId: string, body: UpdateEntryRequest) =>
    request<Entry>('PATCH', `/goals/${goalId}/entries/${entryId}`, body),
  deleteEntry: (goalId: string, entryId: string) => request<undefined>('DELETE', `/goals/${goalId}/entries/${entryId}`),

  exportAll: () => request<ExportResponse>('GET', '/export'),
}

export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  return 'Something went wrong. Please try again.'
}
