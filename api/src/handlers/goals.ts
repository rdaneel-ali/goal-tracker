import type { GoalDetail, GoalView } from '@goal-tracker/shared/api'
import { calculateBalance } from '@goal-tracker/shared/balance'
import {
  cancelGoal,
  canReopenGoal,
  claimBucket,
  completeGoal,
  createCarryoverEntry,
  isGoalLocked,
  reopenGoal,
} from '@goal-tracker/shared/lifecycle'
import { formatCents } from '@goal-tracker/shared/money'
import type { Bucket, Entry, Goal, Settings } from '@goal-tracker/shared/types'
import { commitOrConflict, findToday, param, requireBucket, requireGoal, requireSettings } from '../context.ts'
import type { RequestContext, RouteHandler } from '../context.ts'
import { conflict, invalidInput } from '../errors.ts'
import { applyChanges, sortOldestFirst } from '../patch.ts'
import { bucketKey, entryKey, goalKey, putOperation } from '../repository.ts'
import { buildGoalView } from '../stats.ts'
import { formatTimestamp } from '../time.ts'
import { parseCreateGoal, parseUpdateGoal } from '../validation.ts'
import { findLeftover } from './leftover.ts'

const GOAL_LOCKED_MESSAGE = 'This goal is completed or cancelled, so it is locked.'

function compareNewestFirst(a: Entry, b: Entry): number {
  return (
    b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at) || b.entry_id.localeCompare(a.entry_id)
  )
}

function groupEntriesByGoal(entries: readonly Entry[]): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) groups.set(entry.goal_id, [...(groups.get(entry.goal_id) ?? []), entry])
  return groups
}

export const listGoals: RouteHandler = async (ctx) => {
  const settings = await requireSettings(ctx)
  const today = findToday(ctx, settings)
  const [goals, entries] = await Promise.all([
    ctx.deps.repo.listGoals(ctx.userId),
    ctx.deps.repo.listAllEntries(ctx.userId),
  ])
  const entriesByGoal = groupEntriesByGoal(entries)
  const views = sortOldestFirst(goals, (goal) => goal.goal_id).map((goal) =>
    buildGoalView(goal, entriesByGoal.get(goal.goal_id) ?? [], settings, today),
  )
  return { status: 200, body: views }
}

export const getGoal: RouteHandler = async (ctx) => {
  const settings = await requireSettings(ctx)
  const goal = await requireGoal(ctx, param(ctx, 'goal_id'))
  const entries = await ctx.deps.repo.listGoalEntries(ctx.userId, goal.goal_id)
  const detail: GoalDetail = {
    ...buildGoalView(goal, entries, settings, findToday(ctx, settings)),
    entries: [...entries].sort(compareNewestFirst),
  }
  return { status: 200, body: detail }
}

export const createGoal: RouteHandler = async (ctx) => {
  const request = parseCreateGoal(ctx.body)
  const settings = await requireSettings(ctx)
  const today = findToday(ctx, settings)
  const bucket = await requireBucket(ctx, request.bucket_id)
  const bucketTaken = () => conflict('bucket_not_available', 'This bucket already holds an active goal.')
  if (bucket.status !== 'available') throw bucketTaken()

  const leftover = await findLeftover(ctx, bucket.bucket_id)
  const openingBalance = request.opening_balance ?? 0
  if (leftover.summary.amount > 0 && openingBalance > leftover.summary.amount) {
    throw conflict(
      'opening_balance_too_high',
      `Only ${formatCents(leftover.summary.amount)} is left in this bucket. Add the rest as a deposit.`,
    )
  }

  const timestamp = formatTimestamp(ctx.now)
  const goal: Goal = {
    goal_id: ctx.deps.newId(),
    user_id: ctx.userId,
    bucket_id: bucket.bucket_id,
    name: request.name,
    target_amount: request.target_amount,
    target_date: request.target_date,
    start_date: request.start_date ?? today,
    opening_balance: openingBalance,
    status: 'active',
    created_at: timestamp,
    updated_at: timestamp,
  }
  if (request.linked_item !== undefined) goal.linked_item = request.linked_item

  // The goal, the bucket claim and the carryover withdrawal are written together or not at all.
  const operations = [
    putOperation(goalKey(ctx.userId, goal.goal_id), goal, { type: 'not_exists' }),
    putOperation(bucketKey(ctx.userId, bucket.bucket_id), claimBucket(bucket, timestamp), {
      type: 'status_is',
      status: 'available',
    }),
  ]
  if (openingBalance > 0 && leftover.previousGoal !== null) {
    const carryover = createCarryoverEntry({
      previousGoal: leftover.previousGoal,
      newGoal: goal,
      previousBalance: leftover.previousBalance,
      entryId: ctx.deps.newId(),
      date: today,
      now: timestamp,
    })
    operations.push(putOperation(entryKey(carryover), carryover, { type: 'not_exists' }))
  }
  await commitOrConflict(ctx, operations, bucketTaken)

  const view: GoalView = buildGoalView(goal, [], settings, today)
  return { status: 201, body: view }
}

export const updateGoal: RouteHandler = async (ctx) => {
  const changes = parseUpdateGoal(ctx.body)
  const settings = await requireSettings(ctx)
  const goal = await requireGoal(ctx, param(ctx, 'goal_id'))
  if (isGoalLocked(goal)) throw conflict('goal_locked', GOAL_LOCKED_MESSAGE)
  const updated = applyChanges(goal, { ...changes, updated_at: formatTimestamp(ctx.now) })
  await commitOrConflict(
    ctx,
    [putOperation(goalKey(ctx.userId, goal.goal_id), updated, { type: 'status_is', status: 'active' })],
    () => conflict('goal_locked', GOAL_LOCKED_MESSAGE),
  )
  return { status: 200, body: await viewGoal(ctx, updated, settings) }
}

export const completeGoalHandler: RouteHandler = async (ctx) => {
  const settings = await requireSettings(ctx)
  const today = findToday(ctx, settings)
  const goal = await requireGoal(ctx, param(ctx, 'goal_id'))
  if (isGoalLocked(goal)) throw conflict('goal_locked', GOAL_LOCKED_MESSAGE)
  const bucket = await requireBucket(ctx, goal.bucket_id)
  const entries = await ctx.deps.repo.listGoalEntries(ctx.userId, goal.goal_id)
  const result = completeGoal(goal, bucket, calculateBalance(goal, entries), today, formatTimestamp(ctx.now))
  await commitReleasedBucket(ctx, result.goal, result.bucket)
  return { status: 200, body: buildGoalView(result.goal, entries, settings, today) }
}

export const cancelGoalHandler: RouteHandler = async (ctx) => {
  const settings = await requireSettings(ctx)
  const today = findToday(ctx, settings)
  const goal = await requireGoal(ctx, param(ctx, 'goal_id'))
  if (isGoalLocked(goal)) throw conflict('goal_locked', GOAL_LOCKED_MESSAGE)
  const bucket = await requireBucket(ctx, goal.bucket_id)
  const entries = await ctx.deps.repo.listGoalEntries(ctx.userId, goal.goal_id)
  const result = cancelGoal(goal, bucket, formatTimestamp(ctx.now))
  await commitReleasedBucket(ctx, result.goal, result.bucket)
  return { status: 200, body: buildGoalView(result.goal, entries, settings, today) }
}

export const reopenGoalHandler: RouteHandler = async (ctx) => {
  const settings = await requireSettings(ctx)
  const goal = await requireGoal(ctx, param(ctx, 'goal_id'))
  if (!isGoalLocked(goal)) throw invalidInput('This goal is not completed or cancelled, so there is nothing to reopen.')
  const bucket = await requireBucket(ctx, goal.bucket_id)
  const goals = await ctx.deps.repo.listGoals(ctx.userId)
  if (!canReopenGoal(goal, bucket, goals)) {
    const bucketHasActiveGoal = goals.some((other) => other.bucket_id === goal.bucket_id && other.status === 'active')
    throw conflict(
      'bucket_not_available',
      bucketHasActiveGoal ? 'This bucket already holds another active goal.' : 'This bucket is not available.',
    )
  }
  const result = reopenGoal(goal, bucket, goals, formatTimestamp(ctx.now))
  // A stale goals list can pass canReopenGoal. The bucket condition is what catches it.
  await commitOrConflict(
    ctx,
    [
      putOperation(goalKey(ctx.userId, goal.goal_id), result.goal),
      putOperation(bucketKey(ctx.userId, bucket.bucket_id), result.bucket, { type: 'status_is', status: 'available' }),
    ],
    () => conflict('bucket_not_available', 'This bucket already holds another active goal.'),
  )
  return { status: 200, body: await viewGoal(ctx, result.goal, settings) }
}

async function commitReleasedBucket(ctx: RequestContext, after: Goal, releasedBucket: Bucket): Promise<void> {
  await commitOrConflict(
    ctx,
    [
      putOperation(goalKey(ctx.userId, after.goal_id), after, { type: 'status_is', status: 'active' }),
      putOperation(bucketKey(ctx.userId, releasedBucket.bucket_id), releasedBucket, {
        type: 'status_is',
        status: 'in_use',
      }),
    ],
    () => conflict('goal_locked', GOAL_LOCKED_MESSAGE),
  )
}

async function viewGoal(ctx: RequestContext, goal: Goal, settings: Settings): Promise<GoalView> {
  const entries = await ctx.deps.repo.listGoalEntries(ctx.userId, goal.goal_id)
  return buildGoalView(goal, entries, settings, findToday(ctx, settings))
}
