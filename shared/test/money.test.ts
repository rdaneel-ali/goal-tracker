import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertCents, formatCents, isCents, parseDollarsToCents } from '../src/money.ts'

test('isCents accepts safe integers, including zero and negatives', () => {
  for (const value of [0, 1, -1, 123456, Number.MAX_SAFE_INTEGER]) {
    assert.equal(isCents(value), true, String(value))
  }
})

test('isCents rejects floats, unsafe integers and non-numbers', () => {
  for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity, '100', null, undefined]) {
    assert.equal(isCents(value), false, String(value))
  }
})

test('isCents keeps a number usable when the check fails', () => {
  const amount: number = 1.5
  assert.equal(isCents(amount) ? '' : amount.toFixed(1), '1.5')
})

test('isCents narrows unknown input to a number', () => {
  const input: unknown = 1250
  assert.equal(isCents(input) ? input.toFixed(0) : '', '1250')
})

function describeAmount(value: number | string): string {
  if (isCents(value)) return 'valid'
  return typeof value === 'number' ? value.toFixed(1) : value
}

test('isCents keeps every union member usable when the check fails', () => {
  assert.equal(describeAmount(1.5), '1.5')
  assert.equal(describeAmount('abc'), 'abc')
  assert.equal(describeAmount(100), 'valid')
})

test('assertCents accepts any safe integer by default', () => {
  for (const value of [0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
    assertCents(value, 'balance')
  }
})

test('assertCents throws on anything that is not whole cents and names the value', () => {
  for (const value of [1.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => {
        assertCents(value, 'balance')
      },
      RangeError,
      String(value),
    )
  }
  assert.throws(
    () => {
      assertCents(1.5, 'balance')
    },
    { name: 'RangeError', message: 'Invalid balance: 1.5' },
  )
})

test('assertCents enforces the minimum, which is inclusive', () => {
  assertCents(1, 'amount', 1)
  assertCents(0, 'amount', 0)
  assert.throws(() => {
    assertCents(0, 'amount', 1)
  }, RangeError)
  assert.throws(() => {
    assertCents(-1, 'amount', 0)
  }, RangeError)
})

test('parseDollarsToCents reads the accepted forms', () => {
  const expectedCentsByText: Record<string, number> = {
    '0': 0,
    '12': 1200,
    '12.3': 1230,
    '12.34': 1234,
    '1,234.56': 123456,
    '1,234,567': 123456700,
    '$12.34': 1234,
    '$1,234.56': 123456,
  }
  for (const [text, expectedCents] of Object.entries(expectedCentsByText)) {
    assert.equal(parseDollarsToCents(text), expectedCents, text)
  }
})

test('parseDollarsToCents stays exact where float math would drift', () => {
  assert.equal(parseDollarsToCents('19.99'), 1999)
  assert.equal(parseDollarsToCents('1.15'), 115)
  assert.equal(parseDollarsToCents('4.35'), 435)
})

test('parseDollarsToCents returns null instead of guessing or rounding', () => {
  const rejectedTexts = [
    '',
    ' ',
    'abc',
    '-12.34',
    '12.345',
    '12.',
    '1,23',
    '12,34.56',
    '1.2.3',
    '$',
    '$$12',
    ' 12',
    '12 ',
  ]
  for (const text of rejectedTexts) {
    assert.equal(parseDollarsToCents(text), null, JSON.stringify(text))
  }
})

test('parseDollarsToCents rejects leading zeros but keeps a lone zero', () => {
  for (const text of ['007', '00', '00.50', '0,001', '0,000', '01,234.56', '$012']) {
    assert.equal(parseDollarsToCents(text), null, text)
  }
  assert.equal(parseDollarsToCents('0.50'), 50)
  assert.equal(parseDollarsToCents('$0.05'), 5)
  assert.equal(parseDollarsToCents('100'), 10000)
})

test('parseDollarsToCents returns null past the safe integer range', () => {
  assert.equal(parseDollarsToCents('90071992547409.91'), Number.MAX_SAFE_INTEGER)
  assert.equal(parseDollarsToCents('90071992547409.92'), null)
  assert.equal(parseDollarsToCents('9'.repeat(400)), null)
})

test('formatCents writes dollars with grouping and two decimals', () => {
  const expectedTextByCents: Array<[number, string]> = [
    [0, '$0.00'],
    [5, '$0.05'],
    [50, '$0.50'],
    [1234, '$12.34'],
    [100000, '$1,000.00'],
    [123456789, '$1,234,567.89'],
  ]
  for (const [cents, expectedText] of expectedTextByCents) {
    assert.equal(formatCents(cents), expectedText)
  }
})

test('formatCents puts the sign before the dollar symbol', () => {
  assert.equal(formatCents(-1234), '-$12.34')
  assert.equal(formatCents(-5), '-$0.05')
})

test('formatCents writes negative zero without a sign', () => {
  assert.equal(formatCents(-0), '$0.00')
})

test('formatCents stays exact at the top of the safe integer range', () => {
  assert.equal(formatCents(Number.MAX_SAFE_INTEGER), '$90,071,992,547,409.91')
})

test('formatCents throws on anything that is not whole cents', () => {
  for (const value of [12.5, 1250.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatCents(value), RangeError, String(value))
  }
})

test('formatCents and parseDollarsToCents round-trip', () => {
  for (const cents of [0, 1, 99, 100, 1999, 123456789]) {
    assert.equal(parseDollarsToCents(formatCents(cents)), cents)
  }
})
