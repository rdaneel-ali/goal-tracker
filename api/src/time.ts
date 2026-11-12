import type { IsoDate, IsoTimestamp } from '@goal-tracker/shared/types'

export function formatTimestamp(moment: Date): IsoTimestamp {
  return moment.toISOString()
}

// The calendar date at `moment` in the given IANA time zone. The Lambda clock is UTC, so
// "today" has to be looked up in the user's zone.
export function findDateInTimeZone(moment: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(moment)
  const findPart = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type)
    if (part === undefined) throw new RangeError(`Missing ${type} for time zone ${timeZone}`)
    return part.value
  }
  return `${findPart('year').padStart(4, '0')}-${findPart('month')}-${findPart('day')}`
}
