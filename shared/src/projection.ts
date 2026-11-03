import { calculateRemaining } from './balance.ts'
import { countDaysBetweenDates, isIsoDate } from './dates.ts'
import { assertCents } from './money.ts'
import { countPaydaysRemaining, findPaydayAfter } from './paydays.ts'
import type { Cents, IsoDate } from './types.ts'

const LAST_DATE = '9999-12-31'

function assertPaydayCount(paydayCount: number, label: string): void {
  if (!Number.isSafeInteger(paydayCount) || paydayCount < 0) throw new RangeError(`Invalid ${label}: ${paydayCount}`)
}

// Rounds down so a lower pace gives a later finish, and the app never overstates being on track.
// Returns null before the first payday, when there is nothing to divide by.
export function calculatePace(balance: Cents, openingBalance: Cents, paydaysElapsed: number): Cents | null {
  assertCents(balance, 'balance')
  assertCents(openingBalance, 'opening balance', 0)
  assertPaydayCount(paydaysElapsed, 'paydays elapsed')
  if (paydaysElapsed === 0) return null
  const netSaved = balance - openingBalance
  assertCents(netSaved, 'net saved')
  return Math.floor(netSaved / paydaysElapsed)
}

// Rounds up so paying the amount every payday always reaches the target.
export function calculateNeededPerPaycheck(targetAmount: Cents, balance: Cents, paydaysRemaining: number): Cents {
  const remaining = calculateRemaining(targetAmount, balance)
  assertPaydayCount(paydaysRemaining, 'paydays remaining')
  if (paydaysRemaining === 0) return remaining
  return Math.ceil(remaining / paydaysRemaining)
}

// A goal with nothing remaining finishes today, whatever the pace.
// Otherwise returns null when the pace is unknown, not positive, or too slow to finish by the last date.
export function findProjectedFinishDate(
  anchorPayday: IsoDate,
  today: IsoDate,
  targetAmount: Cents,
  balance: Cents,
  pace: Cents | null,
): IsoDate | null {
  const remaining = calculateRemaining(targetAmount, balance)
  if (pace !== null) assertCents(pace, 'pace')
  if (!isIsoDate(anchorPayday)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(anchorPayday)}`)
  if (!isIsoDate(today)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(today)}`)
  if (remaining === 0) return today
  if (pace === null || pace <= 0) return null
  const paychecksToFinish = Math.ceil(remaining / pace)
  if (paychecksToFinish > countPaydaysRemaining(anchorPayday, today, LAST_DATE)) return null
  return findPaydayAfter(anchorPayday, today, paychecksToFinish)
}

export function isOnTrack(projectedFinishDate: IsoDate | null, targetDate: IsoDate): boolean {
  if (!isIsoDate(targetDate)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(targetDate)}`)
  if (projectedFinishDate === null) return false
  return countDaysBetweenDates(projectedFinishDate, targetDate) >= 0
}
