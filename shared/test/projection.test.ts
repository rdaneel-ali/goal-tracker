import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDaysToDate, countDaysBetweenDates } from '../src/dates.ts'
import { calculateNeededPerWeek, findProjectedFinishDate, isOnTrack } from '../src/projection.ts'
import type { ProjectionInput } from '../src/projection.ts'

const START = '2026-11-01'
const DAY_7 = '2026-11-08'
const badAmounts = [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]
const badDates = ['nope', '2026-02-30', '', '2026-1-1']

function project(overrides: Partial<ProjectionInput> = {}): ReturnType<typeof findProjectedFinishDate> {
  return findProjectedFinishDate({
    startDate: START,
    startBalance: 0,
    balance: 7000,
    targetAmount: 14_000,
    today: DAY_7,
    ...overrides,
  })
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

test('findProjectedFinishDate adds remaining over pace to today', () => {
  // 7000 saved in 7 days is 1000 a day, and 7000 remains.
  assert.equal(project(), '2026-11-15')
})

test('findProjectedFinishDate rounds up to a whole day', () => {
  // 7000 saved in 7 days; 7001 remaining needs 7.001 days.
  assert.equal(project({ targetAmount: 14_001 }), '2026-11-16')
  assert.equal(project({ targetAmount: 13_999 }), '2026-11-15')
})

test('findProjectedFinishDate rounds the exact quotient, not a rounded pace', () => {
  // 10 saved in 9 days is a pace of 1.11 a day. 9 remaining is exactly 8.1 days, rounded up to 9.
  const input = { startDate: '2026-10-30', today: DAY_7, balance: 10 }
  assert.equal(project({ ...input, targetAmount: 19 }), '2026-11-17')
  // 10 remaining is 9 days exactly.
  assert.equal(project({ ...input, targetAmount: 20 }), '2026-11-17')
  // 11 remaining is 9.9 days, rounded up to 10.
  assert.equal(project({ ...input, targetAmount: 21 }), '2026-11-18')
})

test('findProjectedFinishDate returns null until 7 days have passed', () => {
  assert.equal(project({ today: '2026-11-07' }), null)
  assert.equal(project({ today: START }), null)
  assert.notEqual(project({ today: DAY_7 }), null)
})

test('findProjectedFinishDate returns today when nothing remains, even before day 7', () => {
  assert.equal(project({ today: START, balance: 14_000 }), START)
  assert.equal(project({ today: '2026-11-03', balance: 20_000 }), '2026-11-03')
  assert.equal(project({ balance: 14_000 }), DAY_7)
  // Whatever the pace.
  assert.equal(project({ balance: 14_000, startBalance: 14_000 }), DAY_7)
  assert.equal(project({ balance: 14_000, startBalance: 20_000 }), DAY_7)
})

test('findProjectedFinishDate returns null when nothing was saved since the start', () => {
  assert.equal(project({ balance: 5000, startBalance: 5000 }), null)
})

test('findProjectedFinishDate returns null when the balance fell below the start balance', () => {
  assert.equal(project({ balance: 4999, startBalance: 5000 }), null)
  assert.equal(project({ balance: -100, startBalance: 0 }), null)
})

test('findProjectedFinishDate works from a negative start balance', () => {
  // Saved 7000 (from -2000 to 5000) in 7 days; 9000 remains of 14_000, so 9 days.
  assert.equal(project({ startBalance: -2000, balance: 5000 }), '2026-11-17')
  // Still negative now, but climbing: 2000 saved in 7 days, 4000 remains, 14 days.
  assert.equal(project({ startBalance: -5000, balance: -3000, targetAmount: 1000 }), '2026-11-22')
})

test('findProjectedFinishDate throws when today is before the start date', () => {
  assert.throws(() => project({ today: '2026-10-31' }), RangeError)
  // Even when the target is already reached, bad dates throw.
  assert.throws(() => project({ today: '2026-10-31', balance: 5, targetAmount: 1 }), RangeError)
})

test('findProjectedFinishDate returns the last date and null just past it', () => {
  const daysToLimit = countDaysBetweenDates(DAY_7, '9999-12-31')
  // 7 saved in 7 days is 1 a day, so each remaining cent takes a day.
  assert.equal(project({ balance: 7, targetAmount: 7 + daysToLimit }), '9999-12-31')
  assert.equal(project({ balance: 7, targetAmount: 8 + daysToLimit }), null)
  assert.equal(project({ balance: 1, targetAmount: Number.MAX_SAFE_INTEGER }), null)
})

test('findProjectedFinishDate keeps exact math where float math would be wrong', () => {
  // The product is far past 2^53; the exact quotient is just over 7, rounded up to 8.
  const input = { balance: 4_000_000_000_000_000, targetAmount: 8_000_000_000_000_001 }
  assert.equal(ceilDivide(4_000_000_000_000_001n * 7n, 4_000_000_000_000_000n), 8n)
  assert.equal(project(input), addDaysToDate(DAY_7, 8))
})

test('findProjectedFinishDate throws on invalid amounts, including on paths that return early', () => {
  for (const bad of badAmounts) {
    assert.throws(() => project({ startBalance: bad }), RangeError)
    assert.throws(() => project({ balance: bad }), RangeError)
    assert.throws(() => project({ targetAmount: bad }), RangeError)
    assert.throws(() => project({ today: START, startBalance: bad }), RangeError)
    assert.throws(() => project({ balance: 14_000, startBalance: bad }), RangeError)
  }
  assert.throws(() => project({ targetAmount: 0 }), RangeError)
  assert.throws(() => project({ targetAmount: -5 }), RangeError)
})

test('findProjectedFinishDate throws when saved since start leaves the safe range', () => {
  assert.throws(
    () =>
      project({
        startBalance: -Number.MAX_SAFE_INTEGER,
        balance: Number.MAX_SAFE_INTEGER - 1,
        targetAmount: Number.MAX_SAFE_INTEGER,
      }),
    RangeError,
  )
})

test('findProjectedFinishDate throws on invalid dates, including on paths that return early', () => {
  for (const bad of badDates) {
    assert.throws(() => project({ startDate: bad }), RangeError)
    assert.throws(() => project({ today: bad }), RangeError)
    assert.throws(() => project({ today: bad, balance: 14_000 }), RangeError)
    assert.throws(() => project({ startDate: bad, balance: 14_000 }), RangeError)
  }
})

test('findProjectedFinishDate matches brute-force division', () => {
  for (let saved = 1; saved <= 30; saved++) {
    for (let remaining = 1; remaining <= 60; remaining++) {
      const finish = project({ balance: saved, targetAmount: saved + remaining })
      assert.ok(finish !== null)
      const days = countDaysBetweenDates(DAY_7, finish)
      // days is the least whole number with saved * days >= remaining * 7.
      assert.ok(saved * days >= remaining * 7 && saved * (days - 1) < remaining * 7)
    }
  }
})

test('calculateNeededPerWeek divides the remaining amount by the weeks left', () => {
  // 14 days is 2 weeks.
  assert.equal(calculateNeededPerWeek(100_000, 40_000, START, '2026-11-15'), 30_000)
  // Exactly 7 days is 1 week.
  assert.equal(calculateNeededPerWeek(100_000, 40_000, START, DAY_7), 60_000)
})

test('calculateNeededPerWeek rounds up to the cent', () => {
  // 10_000 over 3 weeks.
  assert.equal(calculateNeededPerWeek(10_000, 0, START, '2026-11-22'), 3334)
  // 10 days is 10 / 7 weeks, so 1000 * 7 / 10 = 700.
  assert.equal(calculateNeededPerWeek(1000, 0, START, '2026-11-11'), 700)
  // 11 days: 100 * 7 / 11 = 63.6, rounded up to 64.
  assert.equal(calculateNeededPerWeek(100, 0, START, '2026-11-12'), 64)
  // 1 cent over a year still needs 1 cent.
  assert.equal(calculateNeededPerWeek(1, 0, START, '2027-11-01'), 1)
})

test('calculateNeededPerWeek returns the full remaining amount with less than a week left', () => {
  assert.equal(calculateNeededPerWeek(100_000, 40_000, START, '2026-11-07'), 60_000)
  assert.equal(calculateNeededPerWeek(100_000, 40_000, START, '2026-11-02'), 60_000)
})

test('calculateNeededPerWeek returns the full remaining amount on the target date and after it', () => {
  assert.equal(calculateNeededPerWeek(100_000, 40_000, START, START), 60_000)
  assert.equal(calculateNeededPerWeek(100_000, 40_000, START, '2026-10-01'), 60_000)
})

test('calculateNeededPerWeek is 0 when the target is reached or passed', () => {
  assert.equal(calculateNeededPerWeek(100_000, 100_000, START, '2026-12-01'), 0)
  assert.equal(calculateNeededPerWeek(100_000, 150_000, START, '2026-10-01'), 0)
})

test('calculateNeededPerWeek keeps exact math where float math would be wrong', () => {
  const remaining = Number.MAX_SAFE_INTEGER
  for (const days of [7, 8, 9, 13, 100]) {
    const expected = ceilDivide(BigInt(remaining) * 7n, BigInt(days))
    const needed = calculateNeededPerWeek(remaining, 0, START, addDaysToDate(START, days))
    assert.equal(BigInt(needed), expected)
  }
})

test('calculateNeededPerWeek throws on invalid input, including on paths that return early', () => {
  for (const bad of badAmounts) {
    assert.throws(() => calculateNeededPerWeek(bad, 0, START, '2026-12-01'), RangeError)
    assert.throws(() => calculateNeededPerWeek(100, bad, START, '2026-12-01'), RangeError)
  }
  assert.throws(() => calculateNeededPerWeek(0, 0, START, '2026-12-01'), RangeError)
  for (const bad of badDates) {
    assert.throws(() => calculateNeededPerWeek(100, 0, bad, '2026-12-01'), RangeError)
    assert.throws(() => calculateNeededPerWeek(100, 0, START, bad), RangeError)
    assert.throws(() => calculateNeededPerWeek(100, 100, bad, '2026-12-01'), RangeError)
    assert.throws(() => calculateNeededPerWeek(100, 100, START, bad), RangeError)
  }
})

test('calculateNeededPerWeek paid every week reaches the target, one cent less does not', () => {
  for (let remaining = 1; remaining <= 60; remaining++) {
    for (let days = 7; days <= 40; days++) {
      const needed = calculateNeededPerWeek(remaining, 0, START, addDaysToDate(START, days))
      assert.ok(needed * days >= remaining * 7 && (needed - 1) * days < remaining * 7)
    }
  }
})

test('isOnTrack is true when the finish date is on or before the target date', () => {
  assert.equal(isOnTrack('2026-11-27', '2026-11-27'), true)
  assert.equal(isOnTrack('2026-11-27', '2026-11-28'), true)
  assert.equal(isOnTrack('2026-11-13', '2026-12-25'), true)
})

test('isOnTrack is false when the finish date is after the target date', () => {
  assert.equal(isOnTrack('2026-11-27', '2026-11-26'), false)
})

test('isOnTrack is false when there is no finish date', () => {
  assert.equal(isOnTrack(null, '2026-12-25'), false)
})

test('isOnTrack throws on an invalid date', () => {
  assert.throws(() => isOnTrack('nope', '2026-12-25'), RangeError)
  assert.throws(() => isOnTrack('2026-11-27', 'nope'), RangeError)
  assert.throws(() => isOnTrack(null, 'nope'), RangeError)
  assert.throws(() => isOnTrack(null, '2026-02-30'), RangeError)
})
