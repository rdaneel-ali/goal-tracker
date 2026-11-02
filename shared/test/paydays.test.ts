import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDaysToDate } from '../src/dates.ts'
import { countPaydaysElapsed, countPaydaysRemaining, findPaydayAfter } from '../src/paydays.ts'

// Paydays: ..., 2026-10-02, 2026-10-16, 2026-10-30, 2026-11-13, 2026-11-27, ...
const ANCHOR = '2026-10-30'

test('countPaydaysRemaining excludes today when today is a payday', () => {
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-10-30', '2026-11-27'), 2)
})

test('countPaydaysRemaining includes a target that is a payday', () => {
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-11-01', '2026-11-13'), 1)
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-11-01', '2026-11-12'), 0)
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-11-01', '2026-11-14'), 1)
})

test('countPaydaysRemaining counts around the day before and after a payday', () => {
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-11-12', '2026-11-27'), 2)
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-11-13', '2026-11-27'), 1)
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-11-14', '2026-11-27'), 1)
})

test('countPaydaysRemaining works for dates before the anchor', () => {
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-09-01', '2026-10-30'), 5)
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-09-18', '2026-10-02'), 1)
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-09-17', '2026-09-18'), 1)
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-09-19', '2026-10-01'), 0)
})

test('countPaydaysRemaining is 0 when today is on or after the target', () => {
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-11-13', '2026-11-13'), 0)
  assert.equal(countPaydaysRemaining(ANCHOR, '2026-12-25', '2026-11-13'), 0)
  assert.equal(countPaydaysRemaining(ANCHOR, '2025-01-01', '2024-01-01'), 0)
})

test('countPaydaysRemaining handles an anchor after both dates', () => {
  assert.equal(countPaydaysRemaining('2030-01-04', '2026-11-01', '2026-12-01'), 2)
})

test('countPaydaysElapsed includes both a start and a today that are paydays', () => {
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-10-30', '2026-10-30'), 1)
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-10-16', '2026-11-13'), 3)
})

test('countPaydaysElapsed counts around the day before and after a payday', () => {
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-10-29', '2026-10-30'), 1)
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-10-31', '2026-11-12'), 0)
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-10-31', '2026-11-13'), 1)
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-10-17', '2026-10-29'), 0)
})

test('countPaydaysElapsed works for starts before the anchor', () => {
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-09-01', '2026-10-30'), 5)
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-09-01', '2026-09-17'), 1)
})

test('countPaydaysElapsed is 0 when the start is after today', () => {
  assert.equal(countPaydaysElapsed(ANCHOR, '2026-11-14', '2026-11-13'), 0)
  assert.equal(countPaydaysElapsed(ANCHOR, '2027-01-01', '2026-01-01'), 0)
})

test('countPaydaysElapsed handles an anchor after both dates', () => {
  assert.equal(countPaydaysElapsed('2030-01-04', '2026-11-01', '2026-12-01'), 2)
})

test('counts reject an invalid date in any position, even when they would return 0', () => {
  const bad = '2026-02-30'
  assert.throws(() => countPaydaysRemaining(bad, '2026-11-01', '2026-12-01'), RangeError)
  assert.throws(() => countPaydaysRemaining(ANCHOR, bad, '2026-12-01'), RangeError)
  assert.throws(() => countPaydaysRemaining(ANCHOR, '2026-11-01', bad), RangeError)
  assert.throws(() => countPaydaysRemaining(bad, '2026-12-01', '2026-11-01'), RangeError)
  assert.throws(() => countPaydaysElapsed(bad, '2026-11-01', '2026-12-01'), RangeError)
  assert.throws(() => countPaydaysElapsed(ANCHOR, bad, '2026-12-01'), RangeError)
  assert.throws(() => countPaydaysElapsed(ANCHOR, '2026-11-01', bad), RangeError)
  assert.throws(() => countPaydaysElapsed(bad, '2026-12-01', '2026-11-01'), RangeError)
})

test('counts do not throw at the extreme dates', () => {
  const anchor = '2026-10-30'
  assert.equal(countPaydaysRemaining(anchor, '0000-01-01', '9999-12-31'), 260_888)
  assert.equal(countPaydaysElapsed(anchor, '0000-01-01', '9999-12-31'), 260_888)
  assert.equal(countPaydaysElapsed(anchor, '0000-01-01', '0000-01-01'), 0)
  assert.equal(countPaydaysRemaining('0000-01-01', '0000-01-01', '0000-01-14'), 0)
  assert.equal(countPaydaysRemaining('0000-01-01', '0000-01-01', '0000-01-15'), 1)
  assert.equal(countPaydaysElapsed('0000-01-01', '0000-01-01', '0000-01-01'), 1)
  assert.equal(countPaydaysElapsed('9999-12-31', '9999-12-31', '9999-12-31'), 1)
  assert.equal(countPaydaysRemaining('9999-12-31', '9999-12-30', '9999-12-31'), 1)
})

test('counts match a brute-force walk of paydays', () => {
  const anchor = '2026-10-30'
  const walkOffsets = Array.from({ length: 31 }, (_, i) => (i - 15) * 14)
  const paydays = walkOffsets.map((offset) => addDaysToDate(anchor, offset))
  const countPaydaysInRange = (first: string, last: string) =>
    paydays.filter((payday) => payday >= first && payday <= last).length

  for (let startOffset = -60; startOffset <= 60; startOffset += 5) {
    for (let endOffset = -60; endOffset <= 60; endOffset += 3) {
      const startDate = addDaysToDate(anchor, startOffset)
      const endDate = addDaysToDate(anchor, endOffset)
      const dayAfterStart = addDaysToDate(startDate, 1)
      const label = `${startDate} ${endDate}`
      assert.equal(
        countPaydaysElapsed(anchor, startDate, endDate),
        startOffset > endOffset ? 0 : countPaydaysInRange(startDate, endDate),
        `elapsed ${label}`,
      )
      assert.equal(
        countPaydaysRemaining(anchor, startDate, endDate),
        startOffset >= endOffset ? 0 : countPaydaysInRange(dayAfterStart, endDate),
        `remaining ${label}`,
      )
    }
  }
})

test('findPaydayAfter matches a brute-force walk of paydays', () => {
  const walkOffsets = Array.from({ length: 31 }, (_, i) => (i - 15) * 14)
  const paydays = walkOffsets.map((offset) => addDaysToDate(ANCHOR, offset))

  for (let dateOffset = -60; dateOffset <= 60; dateOffset++) {
    const date = addDaysToDate(ANCHOR, dateOffset)
    const laterPaydays = paydays.filter((payday) => payday > date)
    for (let paydayCount = 1; paydayCount <= 4; paydayCount++) {
      assert.equal(findPaydayAfter(ANCHOR, date, paydayCount), laterPaydays[paydayCount - 1], `${date} ${paydayCount}`)
    }
  }
})

test('findPaydayAfter returns the next payday when the date is itself a payday', () => {
  assert.equal(findPaydayAfter(ANCHOR, '2026-10-30', 1), '2026-11-13')
  assert.equal(findPaydayAfter(ANCHOR, '2026-10-30', 3), '2026-12-11')
})

test('findPaydayAfter finds paydays after a date between paydays', () => {
  assert.equal(findPaydayAfter(ANCHOR, '2026-10-31', 1), '2026-11-13')
  assert.equal(findPaydayAfter(ANCHOR, '2026-11-12', 1), '2026-11-13')
  assert.equal(findPaydayAfter(ANCHOR, '2026-11-12', 2), '2026-11-27')
})

test('findPaydayAfter works for dates before the anchor', () => {
  assert.equal(findPaydayAfter(ANCHOR, '2026-10-01', 1), '2026-10-02')
  assert.equal(findPaydayAfter(ANCHOR, '2026-10-02', 1), '2026-10-16')
  assert.equal(findPaydayAfter(ANCHOR, '2025-01-01', 2), '2025-01-24')
})

test('findPaydayAfter throws when the result passes year 9999', () => {
  // 9999-12-31 is itself a payday for this anchor.
  assert.equal(findPaydayAfter(ANCHOR, '9999-12-30', 1), '9999-12-31')
  assert.throws(() => findPaydayAfter(ANCHOR, '9999-12-31', 1), RangeError)
  assert.throws(() => findPaydayAfter(ANCHOR, '2026-11-01', 1e9), RangeError)
})

test('findPaydayAfter rejects an invalid payday count', () => {
  for (const paydayCount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => findPaydayAfter(ANCHOR, '2026-11-01', paydayCount), RangeError, String(paydayCount))
  }
})

test('findPaydayAfter rejects an invalid date', () => {
  assert.throws(() => findPaydayAfter('2026-02-30', '2026-11-01', 1), RangeError)
  assert.throws(() => findPaydayAfter(ANCHOR, 'nope', 1), RangeError)
})
