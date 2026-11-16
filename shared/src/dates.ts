import type { IsoDate } from './types.ts'

// `value is IsoDate` would narrow a failed check's string to never, so the guard targets this private type.
type ValidIsoDate = IsoDate & { readonly __valid: true }

const MILLISECONDS_PER_DAY = 86_400_000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseDateToMilliseconds(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`)
}

function formatMillisecondsAsDate(utcMilliseconds: number): IsoDate {
  return new Date(utcMilliseconds).toISOString().slice(0, 10)
}

export function isIsoDate(value: unknown): value is ValidIsoDate {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false
  const utcMilliseconds = parseDateToMilliseconds(value)
  // Date.parse rolls impossible days forward (02-30 becomes 03-02), so compare the round trip.
  return !Number.isNaN(utcMilliseconds) && formatMillisecondsAsDate(utcMilliseconds) === value
}

function assertIsoDate(date: IsoDate): void {
  if (!isIsoDate(date)) throw new RangeError(`Invalid ISO date: ${JSON.stringify(date)}`)
}

export function addDaysToDate(date: IsoDate, days: number): IsoDate {
  assertIsoDate(date)
  if (!Number.isInteger(days)) throw new RangeError(`Invalid day count: ${days}`)
  const resultDate = formatMillisecondsAsDate(parseDateToMilliseconds(date) + days * MILLISECONDS_PER_DAY)
  assertIsoDate(resultDate)
  return resultDate
}

export function countDaysBetweenDates(startDate: IsoDate, endDate: IsoDate): number {
  assertIsoDate(startDate)
  assertIsoDate(endDate)
  return (parseDateToMilliseconds(endDate) - parseDateToMilliseconds(startDate)) / MILLISECONDS_PER_DAY
}

// UTC only, as Price Watch sends it. Up to 9 fractional digits; milliseconds are kept.
const ISO_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?Z$/

// Returns null for anything that isn't a real UTC timestamp, such as February 30 or a missing Z.
export function parseTimestampToMilliseconds(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = ISO_TIMESTAMP_PATTERN.exec(value)
  if (match === null) return null
  const [, date = '', hours = '', minutes = '', seconds = '', fraction = ''] = match
  if (!isIsoDate(date)) return null
  const milliseconds = fraction.padEnd(3, '0').slice(0, 3)
  return Date.parse(`${date}T${hours}:${minutes}:${seconds}.${milliseconds}Z`)
}
