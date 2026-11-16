import { countDaysBetweenDates, isIsoDate } from './dates.ts'
import { assertCents } from './money.ts'
import { canAffordNow } from './price-watch.ts'
import type { BestResponse } from './price-watch.ts'
import type { Bucket, Cents, CompletionReason, Goal, GoalStatus, IsoDate, IsoTimestamp } from './types.ts'

export interface GoalWithBucket {
  goal: Goal
  bucket: Bucket
}

function assertToday(today: IsoDate): void {
  if (!isIsoDate(today)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(today)}`)
}

function assertSameUser(goal: Goal, bucket: Bucket): void {
  if (bucket.user_id !== goal.user_id) throw new RangeError('Bucket belongs to a different user')
}

function assertBucketBacksGoal(goal: Goal, bucket: Bucket): void {
  assertSameUser(goal, bucket)
  if (bucket.bucket_id !== goal.bucket_id) throw new RangeError('Bucket does not belong to the goal')
  if (bucket.active_goal_id !== goal.goal_id) throw new RangeError('Bucket is not held by the goal')
}

function assertStatus(goal: Goal, status: GoalStatus): void {
  if (goal.status !== status) throw new RangeError(`Goal is not ${status}: ${goal.status}`)
}

export function isGoalClosed(goal: Goal): boolean {
  return goal.status === 'completed' || goal.status === 'cancelled'
}

// The reached flags prompt an active goal to close, so they're false for planned and closed goals.
export function isAmountReached(goal: Goal, balance: Cents): boolean {
  assertCents(balance, 'balance')
  assertCents(goal.target_amount, 'target amount', 1)
  return goal.status === 'active' && balance >= goal.target_amount
}

export function isDateReached(goal: Goal, today: IsoDate): boolean {
  assertToday(today)
  // A goal with no target date has nothing more to validate and is never date-reached.
  if (goal.target_date === undefined) return false
  const daysUntilTarget = countDaysBetweenDates(today, goal.target_date)
  return goal.status === 'active' && daysUntilTarget <= 0
}

export function connectGoal(
  goal: Goal,
  bucket: Bucket,
  balance: Cents,
  today: IsoDate,
  now: IsoTimestamp,
): GoalWithBucket {
  assertSameUser(goal, bucket)
  assertCents(balance, 'balance')
  assertCents(goal.target_amount, 'target amount', 1)
  assertToday(today)
  assertStatus(goal, 'planned')
  if (goal.bucket_id !== undefined) throw new RangeError('Goal already has a bucket')
  if (bucket.active_goal_id !== undefined) throw new RangeError('Bucket already backs a goal')
  return {
    goal: {
      ...goal,
      status: 'active',
      bucket_id: bucket.bucket_id,
      start_date: today,
      start_balance: balance,
      updated_at: now,
    },
    bucket: { ...bucket, active_goal_id: goal.goal_id, updated_at: now },
  }
}

// The price answer, not a caller's flag, decides price_covered, so it applies only while the badge is on.
function determineCompletionReason(
  goal: Goal,
  balance: Cents,
  today: IsoDate,
  price: BestResponse | null,
  now: IsoTimestamp,
): CompletionReason {
  // All three are checked first, so a bad value throws even when another reason decides.
  const amountReached = isAmountReached(goal, balance)
  const dateReached = isDateReached(goal, today)
  const priceCovered = price !== null && canAffordNow(price, balance, now)
  if (amountReached) return 'amount_reached'
  if (priceCovered) return 'price_covered'
  return dateReached ? 'date_reached' : 'manual'
}

function closeActiveGoal(
  goal: Goal,
  bucket: Bucket,
  balance: Cents,
  status: 'completed' | 'cancelled',
  reason: CompletionReason,
  now: IsoTimestamp,
): GoalWithBucket {
  const closedBucket: Bucket = { ...bucket, updated_at: now }
  // exactOptionalPropertyTypes forbids setting this to undefined, so it must be removed.
  delete closedBucket.active_goal_id
  return {
    goal: { ...goal, status, completion_reason: reason, final_balance: balance, closed_at: now, updated_at: now },
    bucket: closedBucket,
  }
}

export function completeGoal(
  goal: Goal,
  bucket: Bucket,
  balance: Cents,
  today: IsoDate,
  price: BestResponse | null,
  now: IsoTimestamp,
): GoalWithBucket {
  assertBucketBacksGoal(goal, bucket)
  // A price from another watch would give a plausible but wrong price_covered.
  const goalWatchId = goal.linked_item?.price_watch_id
  if (price !== null && price.watch_id !== goalWatchId) {
    const goalWatch = goalWatchId === undefined ? 'no watch' : `watch ${JSON.stringify(goalWatchId)}`
    throw new RangeError(`Price answer is for watch ${JSON.stringify(price.watch_id)}, but the goal has ${goalWatch}`)
  }
  assertCents(balance, 'balance')
  assertCents(goal.target_amount, 'target amount', 1)
  assertToday(today)
  assertStatus(goal, 'active')
  const reason = determineCompletionReason(goal, balance, today, price, now)
  return closeActiveGoal(goal, bucket, balance, 'completed', reason, now)
}

export function cancelPlannedGoal(goal: Goal, now: IsoTimestamp): Goal {
  assertStatus(goal, 'planned')
  if (goal.bucket_id !== undefined) throw new RangeError('Planned goal already has a bucket')
  return { ...goal, status: 'cancelled', completion_reason: 'manual', closed_at: now, updated_at: now }
}

export function cancelActiveGoal(goal: Goal, bucket: Bucket, balance: Cents, now: IsoTimestamp): GoalWithBucket {
  assertBucketBacksGoal(goal, bucket)
  assertCents(balance, 'balance')
  assertStatus(goal, 'active')
  return closeActiveGoal(goal, bucket, balance, 'cancelled', 'manual', now)
}
