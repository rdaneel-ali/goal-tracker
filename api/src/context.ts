import type { Bucket, Goal, IsoDate, Settings } from '@goal-tracker/shared/types'
import { conflict, notFound } from './errors.ts'
import type { HttpError } from './errors.ts'
import type { Repository } from './repository.ts'
import { ConditionFailedError } from './store.ts'
import type { WriteOperation } from './store.ts'
import { findDateInTimeZone } from './time.ts'

// The side effects the handlers need, injected so tests can control them.
export interface Deps {
  repo: Repository
  clock: () => Date
  newId: () => string
}

export interface RequestContext {
  deps: Deps
  userId: string
  now: Date
  params: Readonly<Record<string, string>>
  body: string | undefined
}

export interface HandlerResult {
  status: number
  body?: unknown
}

export type RouteHandler = (ctx: RequestContext) => Promise<HandlerResult>

// Runs a transaction and turns a failed condition into the caller's API error.
// `toError` gets the index of the failing operation, or null when the store can't tell.
export async function commitOrConflict(
  ctx: RequestContext,
  operations: readonly WriteOperation[],
  toError: (operationIndex: number | null) => HttpError,
): Promise<void> {
  try {
    await ctx.deps.repo.commit(operations)
  } catch (e) {
    if (e instanceof ConditionFailedError) throw toError(e.operationIndex)
    throw e
  }
}

export function param(ctx: RequestContext, name: string): string {
  const value = ctx.params[name]
  if (value === undefined) throw new RangeError(`Route has no ${name} parameter`)
  return value
}

// Goal endpoints need the user's pay schedule and time zone, so they wait for first-run setup.
export async function requireSettings(ctx: RequestContext): Promise<Settings> {
  const settings = await ctx.deps.repo.getSettings(ctx.userId)
  if (settings === null) throw conflict('settings_required', 'Set up your pay schedule in Settings first.')
  return settings
}

export function findToday(ctx: RequestContext, settings: Settings): IsoDate {
  return findDateInTimeZone(ctx.now, settings.timezone)
}

export async function requireBucket(ctx: RequestContext, bucketId: string): Promise<Bucket> {
  const bucket = await ctx.deps.repo.getBucket(ctx.userId, bucketId)
  if (bucket === null) throw notFound('Bucket not found.')
  return bucket
}

export async function requireGoal(ctx: RequestContext, goalId: string): Promise<Goal> {
  const goal = await ctx.deps.repo.getGoal(ctx.userId, goalId)
  if (goal === null) throw notFound('Goal not found.')
  return goal
}
