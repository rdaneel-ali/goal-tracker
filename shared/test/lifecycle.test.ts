import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculateSeedMoney,
  canAddEntry,
  canReopenGoal,
  cancelGoal,
  claimBucket,
  completeGoal,
  createCarryoverEntry,
  isAmountReached,
  isDateReached,
  isGoalLocked,
  reopenGoal,
} from '../src/lifecycle.ts'
import type { Bucket, EntryType, Goal, GoalStatus } from '../src/types.ts'

const NOW = '2026-11-01T12:00:00.000Z'
const TODAY = '2026-11-01'
const CREATED = '2026-01-01T00:00:00.000Z'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    goal_id: 'goal-1',
    user_id: 'user-1',
    bucket_id: 'bucket-1',
    name: 'Laptop',
    target_amount: 100_000,
    target_date: '2026-12-01',
    start_date: '2026-01-01',
    opening_balance: 0,
    status: 'active',
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  }
}

function makeBucket(overrides: Partial<Bucket> = {}): Bucket {
  return {
    bucket_id: 'bucket-1',
    user_id: 'user-1',
    name: 'Savings',
    status: 'in_use',
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  }
}

function makeLockedGoal(overrides: Partial<Goal> = {}): Goal {
  return makeGoal({
    status: 'completed',
    completion_reason: 'manual',
    completed_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  })
}

test('isGoalLocked is true for every status except active', () => {
  assert.equal(isGoalLocked(makeGoal({ status: 'active' })), false)
  assert.equal(isGoalLocked(makeGoal({ status: 'completed' })), true)
  assert.equal(isGoalLocked(makeGoal({ status: 'cancelled' })), true)
})

test('canAddEntry allows withdrawals always and deposits only when not locked', () => {
  const statuses: GoalStatus[] = ['active', 'completed', 'cancelled']
  const expected: Record<GoalStatus, Record<EntryType, boolean>> = {
    active: { deposit: true, withdrawal: true },
    completed: { deposit: false, withdrawal: true },
    cancelled: { deposit: false, withdrawal: true },
  }
  for (const status of statuses) {
    for (const entryType of ['deposit', 'withdrawal'] as const) {
      assert.equal(canAddEntry(makeGoal({ status }), entryType), expected[status][entryType], `${status} ${entryType}`)
    }
  }
})

test('canAddEntry throws on an unknown entry type', () => {
  assert.throws(() => canAddEntry(makeGoal(), 'refund' as EntryType), RangeError)
})

test('isAmountReached is true at the target and above, false one cent under', () => {
  const goal = makeGoal({ target_amount: 100_000 })
  assert.equal(isAmountReached(goal, 100_000), true)
  assert.equal(isAmountReached(goal, 100_001), true)
  assert.equal(isAmountReached(goal, 99_999), false)
})

test('isAmountReached is false on a locked goal but still validates', () => {
  const goal = makeLockedGoal()
  assert.equal(isAmountReached(goal, 200_000), false)
  assert.throws(() => isAmountReached(goal, 1.5), RangeError)
})

test('isAmountReached throws on a bad balance or target', () => {
  assert.throws(() => isAmountReached(makeGoal(), 10.5), RangeError)
  assert.throws(() => isAmountReached(makeGoal(), Number.NaN), RangeError)
  assert.throws(() => isAmountReached(makeGoal({ target_amount: 1.5 }), 0), RangeError)
})

test('isAmountReached throws on a target that is not above 0', () => {
  assert.throws(() => isAmountReached(makeGoal({ target_amount: 0 }), 0), RangeError)
  assert.throws(() => isAmountReached(makeGoal({ target_amount: -5 }), 0), RangeError)
})

test('isDateReached is true on the target date and after, false the day before', () => {
  const goal = makeGoal({ target_date: '2026-12-01' })
  assert.equal(isDateReached(goal, '2026-12-01'), true)
  assert.equal(isDateReached(goal, '2026-12-02'), true)
  assert.equal(isDateReached(goal, '2026-11-30'), false)
})

test('isDateReached is false on a locked goal but still validates both dates', () => {
  const goal = makeLockedGoal({ target_date: '2026-12-01' })
  assert.equal(isDateReached(goal, '2027-01-01'), false)
  assert.throws(() => isDateReached(goal, '2027-02-30'), RangeError)
  assert.throws(() => isDateReached(makeLockedGoal({ target_date: 'soon' }), '2027-01-01'), RangeError)
})

test('canReopenGoal is true with no goals, or only itself, in the bucket', () => {
  const goal = makeLockedGoal()
  const bucket = makeBucket({ status: 'available' })
  assert.equal(canReopenGoal(goal, bucket, []), true)
  assert.equal(canReopenGoal(goal, bucket, [goal]), true)
})

test('canReopenGoal ignores other goals that are not active', () => {
  const goal = makeLockedGoal()
  const other = makeLockedGoal({ goal_id: 'goal-2' })
  assert.equal(canReopenGoal(goal, makeBucket({ status: 'available' }), [goal, other]), true)
})

test('canReopenGoal is false when another goal in the bucket is active', () => {
  const goal = makeLockedGoal()
  const other = makeGoal({ goal_id: 'goal-2' })
  assert.equal(canReopenGoal(goal, makeBucket({ status: 'available' }), [goal, other]), false)
})

test('canReopenGoal ignores an active goal in another bucket', () => {
  const goal = makeLockedGoal()
  const other = makeGoal({ goal_id: 'goal-2', bucket_id: 'bucket-2' })
  assert.equal(canReopenGoal(goal, makeBucket({ status: 'available' }), [goal, other]), true)
})

test('canReopenGoal is false for a bucket that is not available or an active goal', () => {
  const goal = makeLockedGoal()
  assert.equal(canReopenGoal(goal, makeBucket({ status: 'retired' }), []), false)
  assert.equal(canReopenGoal(goal, makeBucket({ status: 'in_use' }), []), false)
  assert.equal(canReopenGoal(makeGoal(), makeBucket({ status: 'available' }), []), false)
})

test('canReopenGoal throws for a mismatched bucket or goals from another user', () => {
  const goal = makeLockedGoal()
  const available = makeBucket({ status: 'available' })
  const otherUserGoal = makeLockedGoal({ goal_id: 'goal-2', user_id: 'user-2' })
  assert.throws(() => canReopenGoal(goal, makeBucket({ bucket_id: 'bucket-2', status: 'available' }), []), RangeError)
  assert.throws(() => canReopenGoal(goal, makeBucket({ user_id: 'user-2', status: 'available' }), []), RangeError)
  assert.throws(() => canReopenGoal(goal, available, [goal, otherUserGoal]), RangeError)
})

test('a mismatched bucket is reported before the goal status on every transition', () => {
  const otherBucket = makeBucket({ bucket_id: 'bucket-2', status: 'available' })
  assert.throws(() => canReopenGoal(makeGoal(), otherBucket, []), /does not belong/)
  assert.throws(() => completeGoal(makeLockedGoal(), otherBucket, 0, TODAY, NOW), /does not belong/)
  assert.throws(() => cancelGoal(makeLockedGoal(), otherBucket, NOW), /does not belong/)
})

test('claimBucket moves an available bucket to in_use', () => {
  const bucket = makeBucket({ status: 'available' })
  const claimed = claimBucket(bucket, NOW)
  assert.deepEqual(claimed, makeBucket({ status: 'in_use', updated_at: NOW }))
  assert.equal(bucket.status, 'available')
  assert.equal(bucket.updated_at, CREATED)
})

test('claimBucket throws unless the bucket is available', () => {
  assert.throws(() => claimBucket(makeBucket({ status: 'in_use' }), NOW), RangeError)
  assert.throws(() => claimBucket(makeBucket({ status: 'retired' }), NOW), RangeError)
})

test('completeGoal completes the goal and releases the bucket', () => {
  const goal = makeGoal()
  const bucket = makeBucket()
  const result = completeGoal(goal, bucket, 100_000, TODAY, NOW)
  assert.deepEqual(result, {
    goal: makeGoal({
      status: 'completed',
      completion_reason: 'amount_reached',
      completed_at: NOW,
      updated_at: NOW,
    }),
    bucket: makeBucket({ status: 'available', updated_at: NOW }),
  })
  assert.deepEqual(goal, makeGoal())
  assert.deepEqual(bucket, makeBucket())
})

test('completeGoal works out the reason from the balance and today', () => {
  const completeWith = (balance: number, today: string) =>
    completeGoal(makeGoal(), makeBucket(), balance, today, NOW).goal.completion_reason
  assert.equal(completeWith(100_000, TODAY), 'amount_reached')
  assert.equal(completeWith(99_999, '2026-12-01'), 'date_reached')
  assert.equal(completeWith(99_999, TODAY), 'manual')
})

test('completeGoal prefers amount_reached when the amount and the date are both reached', () => {
  const result = completeGoal(makeGoal(), makeBucket(), 100_000, '2026-12-01', NOW)
  assert.equal(result.goal.completion_reason, 'amount_reached')
})

test('completeGoal validates both the balance and today, whichever one decides the reason', () => {
  assert.throws(() => completeGoal(makeGoal(), makeBucket(), 100_000, '2026-02-30', NOW), RangeError)
  assert.throws(() => completeGoal(makeGoal(), makeBucket(), 10.5, '2026-12-01', NOW), RangeError)
})

test('completeGoal throws for a locked goal, a mismatched bucket, or a bucket not in use', () => {
  assert.throws(() => completeGoal(makeLockedGoal(), makeBucket(), 0, TODAY, NOW), RangeError)
  assert.throws(() => completeGoal(makeGoal(), makeBucket({ bucket_id: 'bucket-2' }), 0, TODAY, NOW), RangeError)
  assert.throws(() => completeGoal(makeGoal(), makeBucket({ user_id: 'user-2' }), 0, TODAY, NOW), RangeError)
  assert.throws(() => completeGoal(makeGoal(), makeBucket({ status: 'available' }), 0, TODAY, NOW), RangeError)
})

test('cancelGoal cancels the goal without completion fields and releases the bucket', () => {
  const goal = makeGoal()
  const bucket = makeBucket()
  const result = cancelGoal(goal, bucket, NOW)
  assert.deepEqual(result, {
    goal: makeGoal({ status: 'cancelled', updated_at: NOW }),
    bucket: makeBucket({ status: 'available', updated_at: NOW }),
  })
  assert.equal('completed_at' in result.goal, false)
  assert.equal('completion_reason' in result.goal, false)
  assert.deepEqual(goal, makeGoal())
  assert.deepEqual(bucket, makeBucket())
})

test('cancelGoal throws for a locked goal, a mismatched bucket, or a bucket not in use', () => {
  assert.throws(() => cancelGoal(makeLockedGoal(), makeBucket(), NOW), RangeError)
  assert.throws(() => cancelGoal(makeGoal(), makeBucket({ bucket_id: 'bucket-2' }), NOW), RangeError)
  assert.throws(() => cancelGoal(makeGoal(), makeBucket({ user_id: 'user-2' }), NOW), RangeError)
  assert.throws(() => cancelGoal(makeGoal(), makeBucket({ status: 'retired' }), NOW), RangeError)
})

test('reopenGoal reactivates a completed goal, omits completion fields and claims the bucket', () => {
  const goal = makeLockedGoal()
  const bucket = makeBucket({ status: 'available' })
  const result = reopenGoal(goal, bucket, [goal], NOW)
  assert.deepEqual(result, {
    goal: makeGoal({ status: 'active', updated_at: NOW }),
    bucket: makeBucket({ status: 'in_use', updated_at: NOW }),
  })
  assert.equal('completed_at' in result.goal, false)
  assert.equal('completion_reason' in result.goal, false)
  assert.equal(goal.status, 'completed')
  assert.equal(goal.completed_at, '2026-06-01T00:00:00.000Z')
  assert.equal(bucket.status, 'available')
})

test('reopenGoal reactivates a cancelled goal', () => {
  const goal = makeGoal({ status: 'cancelled' })
  const result = reopenGoal(goal, makeBucket({ status: 'available' }), [], NOW)
  assert.deepEqual(result.goal, makeGoal({ status: 'active', updated_at: NOW }))
})

test('reopenGoal throws with the reason the goal cannot be reopened', () => {
  const goal = makeLockedGoal()
  const available = makeBucket({ status: 'available' })
  const other = makeGoal({ goal_id: 'goal-2' })
  const inUse = makeBucket({ status: 'in_use' })
  assert.throws(
    () => reopenGoal(goal, inUse, [goal, other], NOW),
    /^RangeError: Bucket already holds another active goal$/,
  )
  assert.throws(
    () => reopenGoal(goal, makeBucket({ status: 'retired' }), [], NOW),
    /^RangeError: Bucket is not available: retired$/,
  )
  assert.throws(() => reopenGoal(makeGoal(), available, [], NOW), /^RangeError: Goal is already active$/)
})

test('reopenGoal throws when the bucket is in use with no active goal listed', () => {
  assert.throws(() => reopenGoal(makeLockedGoal(), makeBucket({ status: 'in_use' }), [], NOW), /not available: in_use/)
})

test('reopenGoal throws for a mismatched bucket or goals from another user', () => {
  const goal = makeLockedGoal()
  const available = makeBucket({ status: 'available' })
  const otherUserGoal = makeLockedGoal({ goal_id: 'goal-2', user_id: 'user-2' })
  assert.throws(
    () => reopenGoal(goal, makeBucket({ bucket_id: 'bucket-2', status: 'available' }), [], NOW),
    /does not belong/,
  )
  assert.throws(
    () => reopenGoal(goal, makeBucket({ user_id: 'user-2', status: 'available' }), [], NOW),
    /different user/,
  )
  assert.throws(() => reopenGoal(goal, available, [goal, otherUserGoal], NOW), /different users/)
})

test('calculateSeedMoney returns the balance, or 0 when it is zero or negative', () => {
  assert.equal(calculateSeedMoney(2_500), 2_500)
  assert.equal(calculateSeedMoney(0), 0)
  assert.equal(calculateSeedMoney(-1), 0)
  assert.equal(Object.is(calculateSeedMoney(-0), 0), true)
})

test('calculateSeedMoney throws on a non-integer balance', () => {
  assert.throws(() => calculateSeedMoney(10.5), RangeError)
  assert.throws(() => calculateSeedMoney(Number.NaN), RangeError)
  assert.throws(() => calculateSeedMoney(Number.POSITIVE_INFINITY), RangeError)
})

function makeCarryoverInput() {
  return {
    previousGoal: makeLockedGoal(),
    newGoal: makeGoal({ goal_id: 'goal-2', name: 'Desk', opening_balance: 5_000 }),
    previousBalance: 5_000,
    entryId: 'entry-1',
    date: '2026-11-01',
    now: NOW,
  }
}

test('createCarryoverEntry records a carryover withdrawal on the previous goal', () => {
  const input = makeCarryoverInput()
  const entry = createCarryoverEntry(input)
  assert.deepEqual(entry, {
    entry_id: 'entry-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    type: 'withdrawal',
    amount: 5_000,
    date: '2026-11-01',
    note: 'Carried to Desk',
    source: 'carryover',
    created_at: NOW,
    updated_at: NOW,
  })
  assert.deepEqual(input, makeCarryoverInput())
})

test('createCarryoverEntry accepts an amount below previousBalance and a cancelled previous goal', () => {
  const input = makeCarryoverInput()
  const entry = createCarryoverEntry({
    ...input,
    previousGoal: makeGoal({ status: 'cancelled' }),
    previousBalance: 9_000,
  })
  assert.equal(entry.amount, 5_000)
})

test('createCarryoverEntry throws when the amount is not above 0', () => {
  const input = makeCarryoverInput()
  for (const openingBalance of [0, -100]) {
    const newGoal = makeGoal({ goal_id: 'goal-2', opening_balance: openingBalance })
    assert.throws(() => createCarryoverEntry({ ...input, newGoal }), RangeError)
  }
})

test('createCarryoverEntry throws when the amount exceeds previousBalance', () => {
  const input = makeCarryoverInput()
  assert.throws(() => createCarryoverEntry({ ...input, previousBalance: 4_999 }), RangeError)
})

test('createCarryoverEntry throws on non-integer amounts and balances', () => {
  const input = makeCarryoverInput()
  const newGoal = makeGoal({ goal_id: 'goal-2', opening_balance: 50.5 })
  assert.throws(() => createCarryoverEntry({ ...input, newGoal }), RangeError)
  assert.throws(() => createCarryoverEntry({ ...input, previousBalance: 5_000.5 }), RangeError)
})

test('createCarryoverEntry throws when the previous goal is still active', () => {
  const input = makeCarryoverInput()
  assert.throws(() => createCarryoverEntry({ ...input, previousGoal: makeGoal() }), RangeError)
})

test('createCarryoverEntry throws when the new goal is locked', () => {
  const input = makeCarryoverInput()
  for (const status of ['completed', 'cancelled'] as const) {
    const newGoal = makeGoal({ goal_id: 'goal-2', opening_balance: 5_000, status })
    assert.throws(() => createCarryoverEntry({ ...input, newGoal }), RangeError, status)
  }
})

test('createCarryoverEntry throws when both goals are the same goal', () => {
  const input = makeCarryoverInput()
  const newGoal = makeGoal({ goal_id: 'goal-1', opening_balance: 5_000 })
  assert.throws(() => createCarryoverEntry({ ...input, newGoal }), RangeError)
})

test('createCarryoverEntry throws when the buckets or users differ', () => {
  const input = makeCarryoverInput()
  const otherBucket = makeGoal({ goal_id: 'goal-2', bucket_id: 'bucket-2', opening_balance: 5_000 })
  const otherUser = makeGoal({ goal_id: 'goal-2', user_id: 'user-2', opening_balance: 5_000 })
  assert.throws(() => createCarryoverEntry({ ...input, newGoal: otherBucket }), RangeError)
  assert.throws(() => createCarryoverEntry({ ...input, newGoal: otherUser }), RangeError)
})

test('createCarryoverEntry throws on an invalid date', () => {
  const input = makeCarryoverInput()
  assert.throws(() => createCarryoverEntry({ ...input, date: '2026-02-30' }), RangeError)
  assert.throws(() => createCarryoverEntry({ ...input, date: '' }), RangeError)
})
