import { calculateRemaining } from './balance.ts'
import { addDaysToDate, countDaysBetweenDates, isIsoDate } from './dates.ts'
import { assertCents } from './money.ts'
import type { Cents, IsoDate } from './types.ts'

const LAST_DATE = '9999-12-31'
const MINIMUM_DAYS_FOR_PROJECTION = 7
const DAYS_PER_WEEK = 7

export interface ProjectionInput {
  startDate: IsoDate
  startBalance: Cents // any safe integer; a bucket can be negative when connected
  balance: Cents
  targetAmount: Cents
  today: IsoDate
}

function assertDate(date: IsoDate): void {
  if (!isIsoDate(date)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(date)}`)
}

// Exact for any size, where a float product or division would round past 2^53.
function divideRoundingUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

// A goal with nothing remaining finishes today, whatever the pace or the days elapsed.
// Otherwise returns null until 7 days have passed since the start, when nothing was saved since then,
// or when the finish date would pass the last supported date.
export function findProjectedFinishDate(input: ProjectionInput): IsoDate | null {
  const { startDate, startBalance, balance, targetAmount, today } = input
  const remaining = calculateRemaining(targetAmount, balance)
  assertCents(startBalance, 'start balance')
  assertDate(startDate)
  assertDate(today)
  const daysElapsed = countDaysBetweenDates(startDate, today)
  if (daysElapsed < 0) throw new RangeError(`Today is before the start date: ${today} < ${startDate}`)
  if (remaining === 0) return today
  if (daysElapsed < MINIMUM_DAYS_FOR_PROJECTION) return null
  const savedSinceStart = balance - startBalance
  assertCents(savedSinceStart, 'saved since start')
  if (savedSinceStart <= 0) return null
  // Rounds up so the projection never finishes earlier than the exact pace allows.
  const daysToFinish = divideRoundingUp(BigInt(remaining) * BigInt(daysElapsed), BigInt(savedSinceStart))
  // Checked before addDaysToDate, which would throw past the last supported date.
  if (daysToFinish > BigInt(countDaysBetweenDates(today, LAST_DATE))) return null
  return addDaysToDate(today, Number(daysToFinish))
}

// Rounds up so paying the amount every week always reaches the target.
// With less than a week left, including a target date that has passed, the full remaining amount is due.
export function calculateNeededPerWeek(
  targetAmount: Cents,
  balance: Cents,
  today: IsoDate,
  targetDate: IsoDate,
): Cents {
  const remaining = calculateRemaining(targetAmount, balance)
  assertDate(today)
  assertDate(targetDate)
  if (remaining === 0) return 0
  const daysLeft = countDaysBetweenDates(today, targetDate)
  if (daysLeft < DAYS_PER_WEEK) return remaining
  return Number(divideRoundingUp(BigInt(remaining) * BigInt(DAYS_PER_WEEK), BigInt(daysLeft)))
}

export function isOnTrack(projectedFinishDate: IsoDate | null, targetDate: IsoDate): boolean {
  assertDate(targetDate)
  if (projectedFinishDate === null) return false
  return countDaysBetweenDates(projectedFinishDate, targetDate) >= 0
}
