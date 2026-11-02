import { addDaysToDate, countDaysBetweenDates } from './dates.ts'
import type { IsoDate } from './types.ts'

const DAYS_PER_PAYCYCLE = 14

// Paydays sit at every multiple of the cycle from the anchor, so a day offset's payday index is its floor division.
// Math.floor (not truncation) keeps offsets before the anchor right.
// Counts paydays in (startOffset, endOffset]; a reversed range counts 0.
function countPaydaysBetweenOffsets(startOffset: number, endOffset: number): number {
  const count = Math.floor(endOffset / DAYS_PER_PAYCYCLE) - Math.floor(startOffset / DAYS_PER_PAYCYCLE)
  return Math.max(0, count)
}

export function countPaydaysRemaining(anchorPayday: IsoDate, today: IsoDate, targetDate: IsoDate): number {
  const todayOffset = countDaysBetweenDates(anchorPayday, today)
  const targetOffset = countDaysBetweenDates(anchorPayday, targetDate)
  return countPaydaysBetweenOffsets(todayOffset, targetOffset)
}

export function countPaydaysElapsed(anchorPayday: IsoDate, startDate: IsoDate, today: IsoDate): number {
  const startOffset = countDaysBetweenDates(anchorPayday, startDate)
  const todayOffset = countDaysBetweenDates(anchorPayday, today)
  // Counting from the day before the start makes the start inclusive, without building a date that could fall before 0000.
  return countPaydaysBetweenOffsets(startOffset - 1, todayOffset)
}

export function findPaydayAfter(anchorPayday: IsoDate, date: IsoDate, paydayCount: number): IsoDate {
  if (!Number.isInteger(paydayCount) || paydayCount < 1) {
    throw new RangeError(`Invalid payday count: ${paydayCount}`)
  }
  const dateOffset = countDaysBetweenDates(anchorPayday, date)
  const nextPaydayIndex = Math.floor(dateOffset / DAYS_PER_PAYCYCLE) + 1
  return addDaysToDate(anchorPayday, (nextPaydayIndex + paydayCount - 1) * DAYS_PER_PAYCYCLE)
}
