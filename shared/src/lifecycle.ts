import { countDaysBetweenDates, isIsoDate } from './dates.ts'
import { assertCents } from './money.ts'
import { ENTRY_TYPES } from './types.ts'
import type { Bucket, Cents, CompletionReason, Entry, EntryType, Goal, IsoDate, IsoTimestamp } from './types.ts'

export interface GoalWithBucket {
  goal: Goal
  bucket: Bucket
}

export interface CarryoverInput {
  previousGoal: Goal
  newGoal: Goal
  previousBalance: Cents
  entryId: string
  date: IsoDate
  now: IsoTimestamp
}

function assertBucketMatchesGoal(goal: Goal, bucket: Bucket): void {
  if (bucket.bucket_id !== goal.bucket_id) throw new RangeError('Bucket does not belong to the goal')
  if (bucket.user_id !== goal.user_id) throw new RangeError('Bucket belongs to a different user')
}

function assertGoalCanTransition(goal: Goal, bucket: Bucket): void {
  assertBucketMatchesGoal(goal, bucket)
  if (goal.status !== 'active') throw new RangeError(`Goal is not active: ${goal.status}`)
}

function releaseBucket(bucket: Bucket, now: IsoTimestamp): Bucket {
  if (bucket.status !== 'in_use') throw new RangeError(`Bucket is not in use: ${bucket.status}`)
  return { ...bucket, status: 'available', updated_at: now }
}

export function isGoalLocked(goal: Goal): boolean {
  return goal.status !== 'active'
}

export function canAddEntry(goal: Goal, entryType: EntryType): boolean {
  if (!ENTRY_TYPES.includes(entryType)) throw new RangeError(`Invalid entry type: ${entryType}`)
  return entryType === 'withdrawal' || !isGoalLocked(goal)
}

export function isAmountReached(goal: Goal, balance: Cents): boolean {
  assertCents(balance, 'balance')
  assertCents(goal.target_amount, 'target amount', 1)
  return !isGoalLocked(goal) && balance >= goal.target_amount
}

export function isDateReached(goal: Goal, today: IsoDate): boolean {
  const daysUntilTarget = countDaysBetweenDates(today, goal.target_date)
  return !isGoalLocked(goal) && daysUntilTarget <= 0
}

// Returns why the goal can't be reopened, or null when it can. Mismatched input throws instead.
function findReopenBlocker(goal: Goal, bucket: Bucket, goals: readonly Goal[]): string | null {
  assertBucketMatchesGoal(goal, bucket)
  if (goals.some((other) => other.user_id !== goal.user_id)) throw new RangeError('Goals belong to different users')
  if (!isGoalLocked(goal)) return 'Goal is already active'
  const bucketHasActiveGoal = goals.some(
    (other) => other.goal_id !== goal.goal_id && other.bucket_id === goal.bucket_id && other.status === 'active',
  )
  if (bucketHasActiveGoal) return 'Bucket already holds another active goal'
  if (bucket.status !== 'available') return `Bucket is not available: ${bucket.status}`
  return null
}

export function canReopenGoal(goal: Goal, bucket: Bucket, goals: readonly Goal[]): boolean {
  return findReopenBlocker(goal, bucket, goals) === null
}

export function claimBucket(bucket: Bucket, now: IsoTimestamp): Bucket {
  if (bucket.status !== 'available') throw new RangeError(`Bucket is not available: ${bucket.status}`)
  return { ...bucket, status: 'in_use', updated_at: now }
}

function determineCompletionReason(goal: Goal, balance: Cents, today: IsoDate): CompletionReason {
  // Both are checked first, so a bad value throws even when the other one decides the reason.
  const amountReached = isAmountReached(goal, balance)
  const dateReached = isDateReached(goal, today)
  if (amountReached) return 'amount_reached'
  return dateReached ? 'date_reached' : 'manual'
}

export function completeGoal(
  goal: Goal,
  bucket: Bucket,
  balance: Cents,
  today: IsoDate,
  now: IsoTimestamp,
): GoalWithBucket {
  assertGoalCanTransition(goal, bucket)
  const completionReason = determineCompletionReason(goal, balance, today)
  return {
    goal: { ...goal, status: 'completed', completion_reason: completionReason, completed_at: now, updated_at: now },
    bucket: releaseBucket(bucket, now),
  }
}

export function cancelGoal(goal: Goal, bucket: Bucket, now: IsoTimestamp): GoalWithBucket {
  assertGoalCanTransition(goal, bucket)
  return {
    goal: { ...goal, status: 'cancelled', updated_at: now },
    bucket: releaseBucket(bucket, now),
  }
}

export function reopenGoal(goal: Goal, bucket: Bucket, goals: readonly Goal[], now: IsoTimestamp): GoalWithBucket {
  const reopenBlocker = findReopenBlocker(goal, bucket, goals)
  if (reopenBlocker !== null) throw new RangeError(reopenBlocker)
  const reopenedGoal: Goal = { ...goal, status: 'active', updated_at: now }
  // exactOptionalPropertyTypes forbids setting these to undefined, so they must be removed.
  delete reopenedGoal.completed_at
  delete reopenedGoal.completion_reason
  return { goal: reopenedGoal, bucket: claimBucket(bucket, now) }
}

export function calculateSeedMoney(balance: Cents): Cents {
  assertCents(balance, 'balance')
  return balance > 0 ? balance : 0
}

export function createCarryoverEntry(input: CarryoverInput): Entry {
  const { previousGoal, newGoal, previousBalance, entryId, date, now } = input
  const amount = newGoal.opening_balance
  assertCents(amount, 'carryover amount', 1)
  assertCents(previousBalance, 'previous balance')
  if (amount > previousBalance) throw new RangeError('Carryover exceeds the previous goal balance')
  if (!isGoalLocked(previousGoal)) throw new RangeError('Previous goal is still active')
  if (isGoalLocked(newGoal)) throw new RangeError('New goal is locked')
  if (previousGoal.goal_id === newGoal.goal_id) throw new RangeError('Carryover needs two different goals')
  if (previousGoal.bucket_id !== newGoal.bucket_id) throw new RangeError('Goals are in different buckets')
  if (previousGoal.user_id !== newGoal.user_id) throw new RangeError('Goals belong to different users')
  if (!isIsoDate(date)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(date)}`)
  return {
    entry_id: entryId,
    user_id: previousGoal.user_id,
    goal_id: previousGoal.goal_id,
    type: 'withdrawal',
    amount,
    date,
    note: `Carried to ${newGoal.name}`,
    source: 'carryover',
    created_at: now,
    updated_at: now,
  }
}
