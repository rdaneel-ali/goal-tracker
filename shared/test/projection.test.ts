import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDaysToDate } from '../src/dates.ts'
import { countPaydaysRemaining } from '../src/paydays.ts'
import { calculateNeededPerPaycheck, calculatePace, findProjectedFinishDate, isOnTrack } from '../src/projection.ts'

// Paydays: ..., 2026-10-30, 2026-11-13, 2026-11-27, 2026-12-11, ...
const ANCHOR = '2026-10-30'

test('calculatePace divides net saved by paydays elapsed', () => {
  assert.equal(calculatePace(50_000, 10_000, 4), 10_000)
  assert.equal(calculatePace(10_000, 10_000, 3), 0)
})

test('calculatePace rounds down to the whole cent', () => {
  assert.equal(calculatePace(10_000, 0, 3), 3333)
  assert.equal(calculatePace(2, 0, 3), 0)
})

test('calculatePace is negative when the balance fell below the opening balance', () => {
  assert.equal(calculatePace(9000, 10_000, 4), -250)
  assert.equal(calculatePace(9999, 10_000, 3), -1)
})

test('calculatePace returns null before the first payday', () => {
  assert.equal(calculatePace(50_000, 10_000, 0), null)
})

test('calculatePace throws on invalid input', () => {
  assert.throws(() => calculatePace(1.5, 0, 1), RangeError)
  assert.throws(() => calculatePace(100, -1, 1), RangeError)
  assert.throws(() => calculatePace(100, 0, -1), RangeError)
  assert.throws(() => calculatePace(100, 0, 1.5), RangeError)
  assert.throws(() => calculatePace(100, 0, Number.NaN), RangeError)
  assert.throws(() => calculatePace(-Number.MAX_SAFE_INTEGER, 1, 1), RangeError)
})

test('calculatePace matches brute-force division', () => {
  for (let netSaved = -50; netSaved <= 50; netSaved++) {
    for (let elapsed = 1; elapsed <= 12; elapsed++) {
      const pace = calculatePace(1000 + netSaved, 1000, elapsed)
      assert.ok(pace !== null && pace * elapsed <= netSaved && (pace + 1) * elapsed > netSaved)
    }
  }
})

test('calculateNeededPerPaycheck divides the remaining amount by paydays remaining', () => {
  assert.equal(calculateNeededPerPaycheck(100_000, 40_000, 3), 20_000)
})

test('calculateNeededPerPaycheck rounds up to the whole cent', () => {
  assert.equal(calculateNeededPerPaycheck(10_000, 0, 3), 3334)
  assert.equal(calculateNeededPerPaycheck(1, 0, 5), 1)
})

test('calculateNeededPerPaycheck returns the full remaining amount when no paydays remain', () => {
  assert.equal(calculateNeededPerPaycheck(100_000, 40_000, 0), 60_000)
})

test('calculateNeededPerPaycheck is 0 when the target is reached or passed', () => {
  assert.equal(calculateNeededPerPaycheck(100_000, 100_000, 3), 0)
  assert.equal(calculateNeededPerPaycheck(100_000, 150_000, 0), 0)
})

test('calculateNeededPerPaycheck throws on invalid input', () => {
  assert.throws(() => calculateNeededPerPaycheck(0, 0, 1), RangeError)
  assert.throws(() => calculateNeededPerPaycheck(100, 0.5, 1), RangeError)
  assert.throws(() => calculateNeededPerPaycheck(100, 0, -1), RangeError)
  assert.throws(() => calculateNeededPerPaycheck(100, 0, 1.5), RangeError)
})

test('calculateNeededPerPaycheck paid every payday reaches the target, one cent less does not', () => {
  for (let remaining = 1; remaining <= 60; remaining++) {
    for (let paydays = 1; paydays <= 8; paydays++) {
      const needed = calculateNeededPerPaycheck(remaining, 0, paydays)
      assert.ok(needed * paydays >= remaining && (needed - 1) * paydays < remaining)
    }
  }
})

test('findProjectedFinishDate returns the payday when the last paycheck lands', () => {
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 0, 5000), '2026-11-27')
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 0, 10_000), '2026-11-13')
})

test('findProjectedFinishDate rounds the paycheck count up', () => {
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_001, 0, 5000), '2026-12-11')
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 0, 9999), '2026-11-27')
})

test('findProjectedFinishDate starts after today when today is a payday', () => {
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-13', 10_000, 0, 10_000), '2026-11-27')
})

test('findProjectedFinishDate returns null when the pace is unknown or not positive', () => {
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 0, null), null)
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 0, 0), null)
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 0, -5), null)
})

test('findProjectedFinishDate returns today when nothing remains, whatever the pace', () => {
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 10_000, 5000), '2026-11-01')
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 12_000, 5000), '2026-11-01')
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 10_000, null), '2026-11-01')
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 10_000, 0), '2026-11-01')
  assert.equal(findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 12_000, -5), '2026-11-01')
})

test('findProjectedFinishDate returns null when the pace is too slow to finish by 9999-12-31', () => {
  const today = '2026-11-01'
  const lastPaycheckCount = countPaydaysRemaining(ANCHOR, today, '9999-12-31')
  assert.notEqual(findProjectedFinishDate(ANCHOR, today, lastPaycheckCount, 0, 1), null)
  assert.equal(findProjectedFinishDate(ANCHOR, today, lastPaycheckCount + 1, 0, 1), null)
  assert.equal(findProjectedFinishDate(ANCHOR, today, 1_000_000, 0, 1), null)
})

test('findProjectedFinishDate throws on invalid input, including on paths that return early', () => {
  assert.throws(() => findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 0, 1.5), RangeError)
  assert.throws(() => findProjectedFinishDate(ANCHOR, '2026-11-01', 10_000, 10_000, 1.5), RangeError)
  assert.throws(() => findProjectedFinishDate(ANCHOR, 'nope', 10_000, 0, 5000), RangeError)
  assert.throws(() => findProjectedFinishDate(ANCHOR, 'nope', 10_000, 10_000, 5000), RangeError)
  assert.throws(() => findProjectedFinishDate(ANCHOR, 'nope', 10_000, 0, null), RangeError)
  assert.throws(() => findProjectedFinishDate('nope', '2026-11-01', 10_000, 0, 5000), RangeError)
  assert.throws(() => findProjectedFinishDate('nope', '2026-11-01', 10_000, 0, 0), RangeError)
  assert.throws(() => findProjectedFinishDate(ANCHOR, '2026-02-30', 10_000, 10_000, 5000), RangeError)
  assert.throws(() => findProjectedFinishDate(ANCHOR, '2026-11-01', 0, 0, 5000), RangeError)
})

test('findProjectedFinishDate lands on the payday where the paychecks cover the remaining amount', () => {
  const today = '2026-11-01'
  for (let remaining = 1; remaining <= 40; remaining++) {
    for (let pace = 1; pace <= 10; pace++) {
      const finishDate = findProjectedFinishDate(ANCHOR, today, remaining, 0, pace)
      assert.ok(finishDate !== null)
      const paychecks = countPaydaysRemaining(ANCHOR, today, finishDate)
      assert.ok(paychecks * pace >= remaining && (paychecks - 1) * pace < remaining)
      // The finish date is itself a payday.
      assert.equal(countPaydaysRemaining(ANCHOR, addDaysToDate(finishDate, -1), finishDate), 1)
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

// The dashboard shows "Target reached" first, so this case never displays as off track.
test('isOnTrack is false for a funded goal past its target date', () => {
  const finishDate = findProjectedFinishDate(ANCHOR, '2026-12-01', 10_000, 10_000, null)
  assert.equal(isOnTrack(finishDate, '2026-11-27'), false)
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
