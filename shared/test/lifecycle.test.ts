import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cancelActiveGoal,
  cancelPlannedGoal,
  completeGoal,
  connectGoal,
  isAmountReached,
  isDateReached,
  isGoalClosed,
} from '../src/lifecycle.ts'
import type { BestResponse } from '../src/price-watch.ts'
import type { Bucket, Goal } from '../src/types.ts'

const NOW = '2026-11-01T12:00:00.000Z'
const TODAY = '2026-11-01'
const CREATED = '2026-01-01T00:00:00.000Z'

function makePlannedGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    goal_id: 'goal-1',
    user_id: 'user-1',
    name: 'Laptop',
    target_amount: 100_000,
    linked_item: { label: 'Laptop', price_watch_id: 'w_01' },
    target_date: '2026-12-01',
    status: 'planned',
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  }
}

function makeActiveGoal(overrides: Partial<Goal> = {}): Goal {
  return makePlannedGoal({
    status: 'active',
    bucket_id: 'bucket-1',
    start_date: '2026-01-01',
    start_balance: 0,
    ...overrides,
  })
}

function makeClosedGoal(overrides: Partial<Goal> = {}): Goal {
  return makeActiveGoal({
    status: 'completed',
    completion_reason: 'manual',
    final_balance: 5_000,
    closed_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  })
}

function makeFreeBucket(overrides: Partial<Bucket> = {}): Bucket {
  return {
    bucket_id: 'bucket-1',
    user_id: 'user-1',
    name: 'Savings',
    created_at: CREATED,
    updated_at: CREATED,
    ...overrides,
  }
}

function makeHeldBucket(overrides: Partial<Bucket> = {}): Bucket {
  return makeFreeBucket({ active_goal_id: 'goal-1', ...overrides })
}

// A fresh, in-target, unsuspicious $400 price: the badge is on once the balance covers it.
function makePrice(overrides: Partial<BestResponse> = {}): BestResponse {
  return {
    watch_id: 'w_01',
    name: 'Laptop',
    target_price: 60_000,
    checked_at: '2026-11-01T06:00:00Z',
    check_ok: true,
    best: {
      title: 'Refurbished laptop',
      price: 40_000,
      condition: 'refurbished',
      url: 'https://example.com/listing',
      source_name: 'Example store',
      meets_target: true,
      suspicious: false,
      suspicious_reason: null,
      status: 'found',
      seen_at: '2026-11-01T06:00:00Z',
    },
    ...overrides,
  }
}

test('isGoalClosed is true only for completed and cancelled', () => {
  assert.equal(isGoalClosed(makePlannedGoal()), false)
  assert.equal(isGoalClosed(makeActiveGoal()), false)
  assert.equal(isGoalClosed(makeActiveGoal({ status: 'completed' })), true)
  assert.equal(isGoalClosed(makeActiveGoal({ status: 'cancelled' })), true)
})

test('isAmountReached is true at the target and above, false one cent under', () => {
  const goal = makeActiveGoal({ target_amount: 100_000 })
  assert.equal(isAmountReached(goal, 100_000), true)
  assert.equal(isAmountReached(goal, 100_001), true)
  assert.equal(isAmountReached(goal, 99_999), false)
})

test('isAmountReached is false on a planned or closed goal but still validates', () => {
  for (const goal of [makePlannedGoal(), makeClosedGoal()]) {
    assert.equal(isAmountReached(goal, 200_000), false)
    assert.throws(() => isAmountReached(goal, 1.5), RangeError)
  }
})

test('isAmountReached throws on a bad balance or target', () => {
  assert.throws(() => isAmountReached(makeActiveGoal(), 10.5), RangeError)
  assert.throws(() => isAmountReached(makeActiveGoal(), Number.NaN), RangeError)
  assert.throws(() => isAmountReached(makeActiveGoal({ target_amount: 1.5 }), 0), RangeError)
  assert.throws(() => isAmountReached(makeActiveGoal({ target_amount: 0 }), 0), RangeError)
  assert.throws(() => isAmountReached(makeActiveGoal({ target_amount: -5 }), 0), RangeError)
})

test('isAmountReached accepts a negative balance', () => {
  assert.equal(isAmountReached(makeActiveGoal(), -500), false)
})

test('isDateReached is true on the target date and after, false the day before', () => {
  const goal = makeActiveGoal({ target_date: '2026-12-01' })
  assert.equal(isDateReached(goal, '2026-12-01'), true)
  assert.equal(isDateReached(goal, '2026-12-02'), true)
  assert.equal(isDateReached(goal, '2026-11-30'), false)
})

test('isDateReached is false when the goal has no target date', () => {
  const goal = makeActiveGoal()
  delete goal.target_date
  assert.equal(isDateReached(goal, '9999-12-31'), false)
  assert.throws(() => isDateReached(goal, '2027-02-30'), RangeError)
})

test('isDateReached is false on a planned or closed goal but still validates both dates', () => {
  for (const status of ['planned', 'completed', 'cancelled'] as const) {
    const goal = makeActiveGoal({ status, target_date: '2026-12-01' })
    assert.equal(isDateReached(goal, '2027-01-01'), false)
    assert.throws(() => isDateReached(goal, '2027-02-30'), RangeError)
    assert.throws(() => isDateReached(makeActiveGoal({ status, target_date: 'soon' }), '2027-01-01'), RangeError)
  }
})

test('connectGoal activates the goal and holds the bucket', () => {
  const { goal, bucket } = connectGoal(makePlannedGoal(), makeFreeBucket(), 7_500, TODAY, NOW)
  assert.equal(goal.status, 'active')
  assert.equal(goal.bucket_id, 'bucket-1')
  assert.equal(goal.start_date, TODAY)
  assert.equal(goal.start_balance, 7_500)
  assert.equal(goal.updated_at, NOW)
  assert.equal(bucket.active_goal_id, 'goal-1')
  assert.equal(bucket.updated_at, NOW)
})

test('connectGoal works for a goal with no target date and with a negative balance', () => {
  const planned = makePlannedGoal()
  delete planned.target_date
  const { goal } = connectGoal(planned, makeFreeBucket(), -2_000, TODAY, NOW)
  assert.equal(goal.start_balance, -2_000)
  assert.equal(goal.target_date, undefined)
})

test('connectGoal does not change its arguments', () => {
  const planned = makePlannedGoal()
  const bucket = makeFreeBucket()
  connectGoal(planned, bucket, 0, TODAY, NOW)
  assert.deepEqual(planned, makePlannedGoal())
  assert.deepEqual(bucket, makeFreeBucket())
})

test('connectGoal throws on wrong input', () => {
  const planned = makePlannedGoal()
  const bucket = makeFreeBucket()
  assert.throws(() => connectGoal(planned, makeFreeBucket({ user_id: 'user-2' }), 0, TODAY, NOW), RangeError)
  assert.throws(() => connectGoal(planned, bucket, 1.5, TODAY, NOW), RangeError)
  assert.throws(() => connectGoal(planned, bucket, Number.NaN, TODAY, NOW), RangeError)
  assert.throws(() => connectGoal(planned, bucket, 0, '2026-02-30', NOW), RangeError)
  assert.throws(() => connectGoal(makePlannedGoal({ target_amount: 0 }), bucket, 0, TODAY, NOW), RangeError)
})

test('connectGoal throws on wrong state', () => {
  const bucket = makeFreeBucket()
  assert.throws(() => connectGoal(makeActiveGoal(), bucket, 0, TODAY, NOW), RangeError)
  assert.throws(() => connectGoal(makeClosedGoal(), bucket, 0, TODAY, NOW), RangeError)
  assert.throws(() => connectGoal(makePlannedGoal({ bucket_id: 'bucket-9' }), bucket, 0, TODAY, NOW), RangeError)
  const heldByOther = makeHeldBucket({ active_goal_id: 'goal-2' })
  assert.throws(() => connectGoal(makePlannedGoal(), heldByOther, 0, TODAY, NOW), RangeError)
})

test('connectGoal checks input before state', () => {
  assert.throws(() => connectGoal(makeClosedGoal(), makeFreeBucket(), 1.5, TODAY, NOW), /Invalid balance/)
})

test('completeGoal records the close and frees the bucket, which keeps its other fields', () => {
  const { goal, bucket } = completeGoal(makeActiveGoal(), makeHeldBucket({ notes: 'Keep' }), 5_000, TODAY, null, NOW)
  assert.equal(goal.status, 'completed')
  assert.equal(goal.completion_reason, 'manual')
  assert.equal(goal.final_balance, 5_000)
  assert.equal(goal.closed_at, NOW)
  assert.equal(goal.updated_at, NOW)
  assert.equal(goal.bucket_id, 'bucket-1')
  assert.equal('active_goal_id' in bucket, false)
  assert.equal(bucket.notes, 'Keep')
  assert.equal(bucket.updated_at, NOW)
})

test('completeGoal picks the reason by priority', () => {
  const goal = makeActiveGoal({ target_amount: 100_000, target_date: '2026-11-01' })
  const reasonFor = (balance: number, today: string, price: BestResponse | null) =>
    completeGoal(goal, makeHeldBucket(), balance, today, price, NOW).goal.completion_reason
  // amount beats everything
  assert.equal(reasonFor(100_000, '2026-11-01', makePrice()), 'amount_reached')
  assert.equal(reasonFor(100_000, '2026-10-01', null), 'amount_reached')
  // an affordable price beats the date
  assert.equal(reasonFor(50_000, '2026-11-01', makePrice()), 'price_covered')
  assert.equal(reasonFor(50_000, '2026-10-01', makePrice()), 'price_covered')
  // date next
  assert.equal(reasonFor(50_000, '2026-11-01', null), 'date_reached')
  // otherwise manual
  assert.equal(reasonFor(50_000, '2026-10-01', null), 'manual')
})

test('completeGoal gives price_covered only while the badge is on', () => {
  const goal = makeActiveGoal({ target_date: '2026-12-01' })
  const reasonFor = (balance: number, price: BestResponse) =>
    completeGoal(goal, makeHeldBucket(), balance, TODAY, price, NOW).goal.completion_reason
  const best = makePrice().best
  if (best === null) throw new Error('makePrice has a best price')
  assert.equal(reasonFor(39_999, makePrice()), 'manual')
  assert.equal(reasonFor(50_000, makePrice({ checked_at: '2026-10-29T11:59:59.999Z' })), 'manual')
  assert.equal(
    reasonFor(50_000, makePrice({ best: { ...best, suspicious: true, suspicious_reason: 'Far below' } })),
    'manual',
  )
  assert.equal(reasonFor(50_000, makePrice({ best: { ...best, meets_target: false } })), 'manual')
  assert.equal(reasonFor(50_000, makePrice({ best: null })), 'manual')
})

test('completeGoal throws on a price from another watch, or for a goal with no watch', () => {
  const active = makeActiveGoal()
  assert.throws(
    () => completeGoal(active, makeHeldBucket(), 50_000, TODAY, makePrice({ watch_id: 'w_02' }), NOW),
    /for watch "w_02", but the goal has watch "w_01"/,
  )
  const unlinked = makeActiveGoal()
  delete unlinked.linked_item
  assert.throws(
    () => completeGoal(unlinked, makeHeldBucket(), 50_000, TODAY, makePrice(), NOW),
    /the goal has no watch/,
  )
  const labelOnly = makeActiveGoal({ linked_item: { label: 'Laptop' } })
  assert.throws(() => completeGoal(labelOnly, makeHeldBucket(), 50_000, TODAY, makePrice(), NOW), RangeError)
  // No price answer is fine for any goal.
  assert.equal(completeGoal(unlinked, makeHeldBucket(), 50_000, TODAY, null, NOW).goal.completion_reason, 'manual')
})

test('completeGoal throws on a bad timestamp when a price is given', () => {
  assert.throws(() => completeGoal(makeActiveGoal(), makeHeldBucket(), 0, TODAY, makePrice(), 'now'), RangeError)
})

test('completeGoal on a goal with no target date never gives date_reached', () => {
  const goal = makeActiveGoal()
  delete goal.target_date
  const { goal: closed } = completeGoal(goal, makeHeldBucket(), 0, '9999-12-31', null, NOW)
  assert.equal(closed.completion_reason, 'manual')
})

test('completeGoal accepts a negative balance', () => {
  const { goal } = completeGoal(makeActiveGoal(), makeHeldBucket(), -300, TODAY, null, NOW)
  assert.equal(goal.final_balance, -300)
})

test('completeGoal does not change its arguments', () => {
  const active = makeActiveGoal()
  const bucket = makeHeldBucket()
  completeGoal(active, bucket, 0, TODAY, null, NOW)
  assert.deepEqual(active, makeActiveGoal())
  assert.deepEqual(bucket, makeHeldBucket())
})

test('completeGoal throws on wrong input', () => {
  const active = makeActiveGoal()
  const bucket = makeHeldBucket()
  assert.throws(() => completeGoal(active, makeHeldBucket({ user_id: 'user-2' }), 0, TODAY, null, NOW), RangeError)
  assert.throws(() => completeGoal(active, makeHeldBucket({ bucket_id: 'bucket-2' }), 0, TODAY, null, NOW), RangeError)
  assert.throws(() => completeGoal(active, makeFreeBucket(), 0, TODAY, null, NOW), RangeError)
  const heldByOther = makeHeldBucket({ active_goal_id: 'goal-2' })
  assert.throws(() => completeGoal(active, heldByOther, 0, TODAY, null, NOW), RangeError)
  assert.throws(() => completeGoal(active, bucket, 1.5, TODAY, null, NOW), RangeError)
  assert.throws(() => completeGoal(active, bucket, 0, 'soon', null, NOW), RangeError)
  assert.throws(() => completeGoal(makeActiveGoal({ target_amount: 0 }), bucket, 0, TODAY, null, NOW), RangeError)
})

test('completeGoal throws when a bad target date hides behind another reason', () => {
  const goal = makeActiveGoal({ target_date: 'soon' })
  assert.throws(() => completeGoal(goal, makeHeldBucket(), 100_000, TODAY, makePrice(), NOW), RangeError)
})

test('completeGoal throws on a goal that is not active', () => {
  assert.throws(() => completeGoal(makePlannedGoal(), makeHeldBucket(), 0, TODAY, null, NOW), RangeError)
  assert.throws(() => completeGoal(makeClosedGoal(), makeHeldBucket(), 0, TODAY, null, NOW), RangeError)
  const cancelled = makeClosedGoal({ status: 'cancelled' })
  assert.throws(() => completeGoal(cancelled, makeHeldBucket(), 0, TODAY, null, NOW), RangeError)
})

test('cancelPlannedGoal changes the goal only', () => {
  const planned = makePlannedGoal()
  const cancelled = cancelPlannedGoal(planned, NOW)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.completion_reason, 'manual')
  assert.equal(cancelled.closed_at, NOW)
  assert.equal(cancelled.updated_at, NOW)
  assert.equal(cancelled.final_balance, undefined)
  assert.equal(cancelled.bucket_id, undefined)
  assert.deepEqual(planned, makePlannedGoal())
})

test('cancelPlannedGoal throws on a goal that is not planned', () => {
  assert.throws(() => cancelPlannedGoal(makeActiveGoal(), NOW), RangeError)
  assert.throws(() => cancelPlannedGoal(makeClosedGoal(), NOW), RangeError)
  assert.throws(() => cancelPlannedGoal(makeClosedGoal({ status: 'cancelled' }), NOW), RangeError)
})

test('cancelPlannedGoal throws on a planned goal that still has a bucket', () => {
  assert.throws(() => cancelPlannedGoal(makePlannedGoal({ bucket_id: 'bucket-1' }), NOW), RangeError)
})

test('cancelActiveGoal records the close with reason manual and frees the bucket', () => {
  const active = makeActiveGoal({ target_amount: 1_000 })
  const bucket = makeHeldBucket()
  const { goal, bucket: freed } = cancelActiveGoal(active, bucket, 5_000, NOW)
  assert.equal(goal.status, 'cancelled')
  assert.equal(goal.completion_reason, 'manual')
  assert.equal(goal.final_balance, 5_000)
  assert.equal(goal.closed_at, NOW)
  assert.equal(goal.updated_at, NOW)
  assert.equal('active_goal_id' in freed, false)
  assert.equal(freed.updated_at, NOW)
  assert.deepEqual(active, makeActiveGoal({ target_amount: 1_000 }))
  assert.deepEqual(bucket, makeHeldBucket())
})

test('cancelActiveGoal accepts a negative balance', () => {
  const { goal } = cancelActiveGoal(makeActiveGoal(), makeHeldBucket(), -1, NOW)
  assert.equal(goal.final_balance, -1)
})

test('cancelActiveGoal throws on wrong input', () => {
  const active = makeActiveGoal()
  assert.throws(() => cancelActiveGoal(active, makeHeldBucket({ user_id: 'user-2' }), 0, NOW), RangeError)
  assert.throws(() => cancelActiveGoal(active, makeHeldBucket({ bucket_id: 'bucket-2' }), 0, NOW), RangeError)
  assert.throws(() => cancelActiveGoal(active, makeFreeBucket(), 0, NOW), RangeError)
  assert.throws(() => cancelActiveGoal(active, makeHeldBucket({ active_goal_id: 'goal-2' }), 0, NOW), RangeError)
  assert.throws(() => cancelActiveGoal(active, makeHeldBucket(), 0.5, NOW), RangeError)
})

test('cancelActiveGoal throws on a goal that is not active', () => {
  assert.throws(() => cancelActiveGoal(makePlannedGoal(), makeHeldBucket(), 0, NOW), RangeError)
  assert.throws(() => cancelActiveGoal(makeClosedGoal(), makeHeldBucket(), 0, NOW), RangeError)
})
