import { assertCents } from './money.ts'
import type { Cents, Entry, Goal } from './types.ts'

export function calculateBalance(
  goal: Pick<Goal, 'goal_id' | 'opening_balance'>,
  entries: readonly Pick<Entry, 'goal_id' | 'type' | 'amount'>[],
): Cents {
  assertCents(goal.opening_balance, 'opening balance', 0)
  let balance: Cents = goal.opening_balance
  for (const entry of entries) {
    if (entry.goal_id !== goal.goal_id) throw new RangeError(`Entry belongs to another goal: ${entry.goal_id}`)
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
