import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDaysToDate, countDaysBetweenDates, isIsoDate } from '../src/dates.ts'

test('isIsoDate accepts real calendar dates', () => {
  for (const value of ['2026-11-01', '2024-02-29', '2026-12-31', '2027-01-01']) {
    assert.equal(isIsoDate(value), true, value)
  }
})

test('isIsoDate rejects dates that do not exist', () => {
  for (const value of [
    '2026-02-29',
    '2026-02-30',
    '2026-02-31',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
  ]) {
    assert.equal(isIsoDate(value), false, value)
  }
})

test('isIsoDate rejects other formats and non-strings', () => {
  const rejectedValues = [
    '',
    '2026-1-1',
    '11/01/2026',
    '2026-11-01T00:00:00Z',
    ' 2026-11-01',
    '2026-11-01\n',
    20261101,
    null,
    undefined,
  ]
  for (const value of rejectedValues) {
    assert.equal(isIsoDate(value), false, JSON.stringify(value))
  }
})

test('isIsoDate keeps a string usable when the check fails', () => {
  const text: string = 'not-a-date'
  assert.equal(isIsoDate(text) ? 0 : text.length, 10)
})

test('isIsoDate narrows unknown input to a date string', () => {
  const input: unknown = '2026-11-01'
  assert.equal(isIsoDate(input) ? input.length : 0, 10)
})

function describeTextOrNumber(value: string | number): string {
  if (isIsoDate(value)) return 'valid'
  return typeof value === 'string' ? value.toUpperCase() : value.toFixed(1)
}

function describeOptionalText(value: string | undefined): string {
  if (isIsoDate(value)) return 'valid'
  return value === undefined ? 'missing' : value.toUpperCase()
}

test('isIsoDate keeps every union member usable when the check fails', () => {
  assert.equal(describeTextOrNumber('abc'), 'ABC')
  assert.equal(describeTextOrNumber(1.5), '1.5')
  assert.equal(describeTextOrNumber('2026-11-01'), 'valid')
  assert.equal(describeOptionalText(undefined), 'missing')
  assert.equal(describeOptionalText('abc'), 'ABC')
  assert.equal(describeOptionalText('2026-11-01'), 'valid')
})

test('addDaysToDate moves forward and back across months and years', () => {
  assert.equal(addDaysToDate('2026-11-01', 0), '2026-11-01')
  assert.equal(addDaysToDate('2026-11-01', 14), '2026-11-15')
  assert.equal(addDaysToDate('2026-12-25', 14), '2027-01-08')
  assert.equal(addDaysToDate('2026-11-01', -14), '2026-10-18')
})

test('addDaysToDate handles leap days', () => {
  assert.equal(addDaysToDate('2024-02-28', 1), '2024-02-29')
  assert.equal(addDaysToDate('2026-02-28', 1), '2026-03-01')
})

test('addDaysToDate is not shifted by daylight saving changes', () => {
  assert.equal(addDaysToDate('2026-03-07', 1), '2026-03-08')
  assert.equal(addDaysToDate('2026-03-08', 1), '2026-03-09')
  assert.equal(addDaysToDate('2026-10-31', 1), '2026-11-01')
  assert.equal(addDaysToDate('2026-11-01', 1), '2026-11-02')
})

test('addDaysToDate throws on an invalid date instead of rolling it forward', () => {
  for (const date of ['2026-02-30', '2026-13-01', 'garbage', '']) {
    assert.throws(() => addDaysToDate(date, 1), RangeError, JSON.stringify(date))
  }
})

test('the invalid date error escapes the input so it cannot forge log lines', () => {
  assert.throws(() => addDaysToDate('x\nforged line', 1), {
    name: 'RangeError',
    message: 'Invalid ISO date: "x\\nforged line"',
  })
})

test('addDaysToDate throws on a day count that is not a whole number', () => {
  for (const days of [0.5, 1.5, -0.5, Number.NaN, Infinity]) {
    assert.throws(() => addDaysToDate('2026-11-01', days), RangeError, String(days))
  }
})

test('addDaysToDate throws when the result leaves the four-digit year range', () => {
  assert.equal(addDaysToDate('9999-12-30', 1), '9999-12-31')
  assert.equal(addDaysToDate('0000-01-02', -1), '0000-01-01')
  assert.throws(() => addDaysToDate('9999-12-31', 1), RangeError)
  assert.throws(() => addDaysToDate('0000-01-01', -1), RangeError)
})

test('countDaysBetweenDates throws when either date is invalid', () => {
  for (const date of ['2026-02-30', 'garbage', '']) {
    assert.throws(() => countDaysBetweenDates(date, '2026-11-01'), RangeError, JSON.stringify(date))
    assert.throws(() => countDaysBetweenDates('2026-11-01', date), RangeError, JSON.stringify(date))
  }
})

test('countDaysBetweenDates counts whole days from start to end', () => {
  assert.equal(countDaysBetweenDates('2026-11-01', '2026-11-01'), 0)
  assert.equal(countDaysBetweenDates('2026-11-01', '2026-11-15'), 14)
  assert.equal(countDaysBetweenDates('2024-01-01', '2025-01-01'), 366)
})

test('countDaysBetweenDates is negative when the end is before the start', () => {
  assert.equal(countDaysBetweenDates('2026-11-15', '2026-11-01'), -14)
})

test('countDaysBetweenDates is not shifted by daylight saving changes', () => {
  assert.equal(countDaysBetweenDates('2026-03-01', '2026-03-15'), 14)
  assert.equal(countDaysBetweenDates('2026-10-25', '2026-11-08'), 14)
})
