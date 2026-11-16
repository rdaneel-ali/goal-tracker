import { assertCents } from './money.ts'
import type { Bucket, Cents, Entry } from './types.ts'

export function calculateBalance(
  bucket: Pick<Bucket, 'bucket_id'>,
  entries: readonly Pick<Entry, 'bucket_id' | 'type' | 'amount'>[],
): Cents {
  let balance: Cents = 0
  for (const entry of entries) {
    if (entry.bucket_id !== bucket.bucket_id)
      throw new RangeError(`Entry belongs to another bucket: ${entry.bucket_id}`)
    assertCents(entry.amount, 'entry amount', 1)
    // Widened because the type is only trusted at compile time.
    const entryType: string = entry.type
    if (entryType === 'deposit') balance += entry.amount
    else if (entryType === 'withdrawal') balance -= entry.amount
    else throw new RangeError(`Invalid entry type: ${JSON.stringify(entryType)}`)
    // Past the safe range a sum silently rounds, so check each step.
    assertCents(balance, 'running balance')
  }
  return balance
}

export function calculateRemaining(targetAmount: Cents, balance: Cents): Cents {
  assertCents(targetAmount, 'target amount', 1)
  assertCents(balance, 'balance')
  const remaining = targetAmount - balance
  assertCents(remaining, 'remaining amount')
  return Math.max(remaining, 0)
}

export function calculateProgress(balance: Cents, targetAmount: Cents): number {
  assertCents(targetAmount, 'target amount', 1)
  assertCents(balance, 'balance')
  return balance / targetAmount
}

export function isWithdrawalOverBalance(withdrawalAmount: Cents, balance: Cents): boolean {
  assertCents(withdrawalAmount, 'withdrawal amount', 1)
  assertCents(balance, 'balance')
  return withdrawalAmount > balance
}
