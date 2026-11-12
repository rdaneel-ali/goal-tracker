import type { IsoDate } from '@goal-tracker/shared/types'

// en-CA formats as YYYY-MM-DD.
export function findTodayInTimezone(timezone: string, now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

// ISO dates are calendar days, so format them in UTC to keep the day from shifting.
export function formatIsoDate(date: IsoDate): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

export function formatShortDate(date: IsoDate): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}
