import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateBalance, calculateProgress, calculateRemaining, isWithdrawalOverBalance } from '../src/balance.ts'
import type { Entry, EntryType } from '../src/types.ts'

type EntryInput = Pick<Entry, 'bucket_id' | 'type' | 'amount'>

const MAX = Number.MAX_SAFE_INTEGER
const badAmounts = [0, -1, 1.5, Number.NaN, Infinity, -Infinity, MAX + 1]
const bucket = { bucket_id: 'bucket-1' }

function makeEntry(entryType: EntryType, amount: number): EntryInput {
  return { bucket_id: 'bucket-1', type: entryType, amount }
}

test('calculateBalance is 0 when there are no entries', () => {
  assert.equal(calculateBalance(bucket, []), 0)
})

test('calculateBalance adds deposits and subtracts withdrawals', () => {
  const entries = [makeEntry('deposit', 10000), makeEntry('deposit', 2550), makeEntry('withdrawal', 3000)]
  assert.equal(calculateBalance(bucket, entries), 9550)
})

test('calculateBalance can go negative, and lands on exactly zero', () => {
  assert.equal(calculateBalance(bucket, [makeEntry('deposit', 1000), makeEntry('withdrawal', 1500)]), -500)
  assert.equal(calculateBalance(bucket, [makeEntry('deposit', 1000), makeEntry('withdrawal', 1000)]), 0)
})

test('calculateBalance stays exact where float math would drift', () => {
  const entries = Array.from({ length: 10 }, () => makeEntry('deposit', 10))
  assert.equal(calculateBalance(bucket, entries), 100)
})

test('calculateBalance throws on an entry from another bucket', () => {
  const foreignEntry: EntryInput = { bucket_id: 'bucket-2', type: 'deposit', amount: 900 }
  assert.throws(() => calculateBalance(bucket, [makeEntry('deposit', 100), foreignEntry]), RangeError)
})

test('calculateBalance throws on any entry amount that is not above 0', () => {
  for (const amount of badAmounts) {
    assert.throws(() => calculateBalance(bucket, [makeEntry('deposit', amount)]), RangeError, String(amount))
    assert.throws(() => calculateBalance(bucket, [makeEntry('withdrawal', amount)]), RangeError, String(amount))
  }
})

test('calculateBalance throws on an entry type that is neither deposit nor withdrawal', () => {
  for (const entryType of ['transfer', 'Deposit', '', undefined, null]) {
    const entry = makeEntry(entryType as EntryType, 100)
    assert.throws(() => calculateBalance(bucket, [entry]), RangeError, String(entryType))
  }
})

test('calculateBalance accepts the top of the safe integer range', () => {
  assert.equal(calculateBalance(bucket, [makeEntry('deposit', MAX - 1), makeEntry('deposit', 1)]), MAX)
})

test('calculateBalance throws when a running total leaves the safe integer range', () => {
  assert.throws(() => calculateBalance(bucket, [makeEntry('deposit', MAX), makeEntry('deposit', 1)]), RangeError)
  assert.throws(() => calculateBalance(bucket, [makeEntry('withdrawal', MAX), makeEntry('withdrawal', 1)]), RangeError)
})

test('calculateBalance checks every step, not just the final total', () => {
  const entries = [makeEntry('deposit', MAX), makeEntry('deposit', MAX), makeEntry('withdrawal', MAX)]
  assert.throws(() => calculateBalance(bucket, entries), RangeError)
})

test('calculateRemaining is target minus balance', () => {
  assert.equal(calculateRemaining(100000, 40000), 60000)
  assert.equal(calculateRemaining(100000, 0), 100000)
  assert.equal(calculateRemaining(100000, -500), 100500)
})

test('calculateRemaining floors at 0 at and past the target', () => {
  assert.equal(calculateRemaining(100000, 100000), 0)
  assert.equal(calculateRemaining(100000, 100001), 0)
  assert.equal(calculateRemaining(100000, 250000), 0)
})

test('calculateRemaining throws on a bad target or balance', () => {
  for (const target of [0, -1, 1.5, Number.NaN, Infinity, MAX + 1]) {
    assert.throws(() => calculateRemaining(target, 100), RangeError, String(target))
  }
  for (const balance of [1.5, Number.NaN, Infinity, -Infinity, MAX + 1]) {
    assert.throws(() => calculateRemaining(100, balance), RangeError, String(balance))
  }
})

test('calculateRemaining throws rather than return an unsafe difference', () => {
  assert.throws(() => calculateRemaining(MAX, -MAX), RangeError)
})

test('calculateProgress is balance over target', () => {
  assert.equal(calculateProgress(25000, 100000), 0.25)
  assert.equal(calculateProgress(0, 100000), 0)
  assert.equal(calculateProgress(100000, 100000), 1)
})

test('calculateProgress is not clamped', () => {
  assert.equal(calculateProgress(150000, 100000), 1.5)
  assert.equal(calculateProgress(-25000, 100000), -0.25)
})

test('calculateProgress throws on a bad target or balance', () => {
  for (const target of [0, -1, 1.5, Number.NaN, Infinity, MAX + 1]) {
    assert.throws(() => calculateProgress(100, target), RangeError, String(target))
  }
  for (const balance of [1.5, Number.NaN, Infinity, -Infinity, MAX + 1]) {
    assert.throws(() => calculateProgress(balance, 100), RangeError, String(balance))
  }
})

test('isWithdrawalOverBalance is true only when the withdrawal is larger', () => {
  assert.equal(isWithdrawalOverBalance(1001, 1000), true)
  assert.equal(isWithdrawalOverBalance(1000, 1000), false)
  assert.equal(isWithdrawalOverBalance(999, 1000), false)
})

test('isWithdrawalOverBalance handles zero and negative balances', () => {
  assert.equal(isWithdrawalOverBalance(1, 0), true)
  assert.equal(isWithdrawalOverBalance(1, -500), true)
})

test('isWithdrawalOverBalance throws on a bad withdrawal or balance', () => {
  for (const amount of badAmounts) {
    assert.throws(() => isWithdrawalOverBalance(amount, 1000), RangeError, String(amount))
  }
  for (const balance of [1.5, Number.NaN, Infinity, MAX + 1]) {
    assert.throws(() => isWithdrawalOverBalance(100, balance), RangeError, String(balance))
  }
})
