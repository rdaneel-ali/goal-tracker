// Goal Tracker's own copy of the Price Watch contract. Price Watch is an outside service,
// so every answer goes through a parse function before it's cached or shown.
import { parseTimestampToMilliseconds } from './dates.ts'
import { assertCents, isCents } from './money.ts'
import type { Cents, IsoTimestamp } from './types.ts'

export const LISTING_CONDITIONS = ['new', 'refurbished', 'used', 'unknown'] as const
export type ListingCondition = (typeof LISTING_CONDITIONS)[number]

export const LISTING_STATUSES = ['found', 'confirmed'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const MANUAL_SOURCE_NAME = 'Manual'
export const PRICE_FRESH_HOURS = 48

const MILLISECONDS_PER_HOUR = 3_600_000
const CLOCK_SKEW_MILLISECONDS = 5 * 60_000

export interface WatchSummary {
  watch_id: string
  name: string
  target_price: Cents
}

export interface BestListing {
  title: string
  price: Cents
  condition: ListingCondition
  url: string | null // null only for the manual price
  source_name: string
  meets_target: boolean
  suspicious: boolean
  suspicious_reason: string | null
  status: ListingStatus
  seen_at: IsoTimestamp
}

export interface Listing extends BestListing {
  meets_spec: boolean
  spec_reason: string
}

export interface BestResponse extends WatchSummary {
  checked_at: IsoTimestamp | null // null before the first check
  check_ok: boolean
  best: BestListing | null // null when nothing meets the spec
}

export interface ListingsResponse {
  watch_id: string
  checked_at: IsoTimestamp | null
  listings: Listing[] // cheapest first
}

export interface PriceCacheItem {
  watch_id: string
  response: BestResponse
  fetched_at: IsoTimestamp
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isPositiveCents(value: unknown): value is Cents {
  return isCents(value) && value > 0
}

function isTimestamp(value: unknown): value is IsoTimestamp {
  return parseTimestampToMilliseconds(value) !== null
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return options.some((option) => option === value)
}

// A listing URL ends up as a link in the page, so anything but an absolute https URL is refused.
// A pattern, not URL, keeps this module free of environment types; the literal scheme is what blocks script links.
// Backslashes, control and invisible format characters are refused too: browsers read a backslash as a slash,
// which would move the host, and a format character such as a right-to-left override can disguise it.
const HTTPS_URL_PATTERN = /^https:\/\/[^\s/?#@\\\p{Cc}\p{Cf}]+(?:[/?#][^\s\\\p{Cc}\p{Cf}]*)?$/u

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && HTTPS_URL_PATTERN.test(value)
}

// Copies only known fields, so extra fields Price Watch adds later never reach the cache.
function parseBestListing(value: unknown): BestListing | null {
  if (!isRecord(value)) return null
  const { title, price, condition, url, source_name, meets_target, suspicious, suspicious_reason, status, seen_at } =
    value
  if (typeof title !== 'string' || !isPositiveCents(price) || !isOneOf(LISTING_CONDITIONS, condition)) return null
  if (typeof source_name !== 'string') return null
  const isUrlValid = isHttpsUrl(url) || (url === null && source_name === MANUAL_SOURCE_NAME)
  if (!isUrlValid) return null
  if (typeof meets_target !== 'boolean' || typeof suspicious !== 'boolean') return null
  if (suspicious_reason !== null && typeof suspicious_reason !== 'string') return null
  if (!isOneOf(LISTING_STATUSES, status) || !isTimestamp(seen_at)) return null
  return { title, price, condition, url, source_name, meets_target, suspicious, suspicious_reason, status, seen_at }
}

function parseListing(value: unknown): Listing | null {
  const bestListing = parseBestListing(value)
  if (bestListing === null || !isRecord(value)) return null
  const { meets_spec, spec_reason } = value
  if (typeof meets_spec !== 'boolean' || typeof spec_reason !== 'string') return null
  return { ...bestListing, meets_spec, spec_reason }
}

function parseWatchSummary(value: unknown): WatchSummary | null {
  if (!isRecord(value)) return null
  const { watch_id, name, target_price } = value
  if (!isNonEmptyString(watch_id) || typeof name !== 'string' || !isPositiveCents(target_price)) return null
  return { watch_id, name, target_price }
}

function parseCheckedAt(value: unknown): { checkedAt: IsoTimestamp | null } | null {
  if (value === null) return { checkedAt: null }
  return isTimestamp(value) ? { checkedAt: value } : null
}

export function parseWatchSummaries(value: unknown): WatchSummary[] | null {
  if (!Array.isArray(value)) return null
  const watches: WatchSummary[] = []
  for (const item of value) {
    const watch = parseWatchSummary(item)
    if (watch === null) return null
    watches.push(watch)
  }
  return watches
}

export function parseBestResponse(value: unknown): BestResponse | null {
  const summary = parseWatchSummary(value)
  if (summary === null || !isRecord(value)) return null
  const checked = parseCheckedAt(value['checked_at'])
  if (checked === null || typeof value['check_ok'] !== 'boolean') return null
  const best = value['best'] === null ? null : parseBestListing(value['best'])
  if (value['best'] !== null && best === null) return null
  return { ...summary, checked_at: checked.checkedAt, check_ok: value['check_ok'], best }
}

export function parseListingsResponse(value: unknown): ListingsResponse | null {
  if (!isRecord(value) || !isNonEmptyString(value['watch_id']) || !Array.isArray(value['listings'])) return null
  const checked = parseCheckedAt(value['checked_at'])
  if (checked === null) return null
  const listings: Listing[] = []
  for (const item of value['listings']) {
    const listing = parseListing(item)
    if (listing === null) return null
    listings.push(listing)
  }
  return { watch_id: value['watch_id'], checked_at: checked.checkedAt, listings }
}

function parseTimestampOrThrow(timestamp: IsoTimestamp, label: string): number {
  const milliseconds = parseTimestampToMilliseconds(timestamp)
  if (milliseconds === null) throw new RangeError(`Invalid ${label}: ${JSON.stringify(timestamp)}`)
  return milliseconds
}

// Fresh means Price Watch's run happened within the last 48 hours. A check from the future
// (beyond a few minutes of clock skew) is never fresh, so a bad clock can't keep the badge on.
export function isPriceFresh(checkedAt: IsoTimestamp | null, now: IsoTimestamp): boolean {
  const nowMilliseconds = parseTimestampOrThrow(now, 'now')
  if (checkedAt === null) return false
  const ageMilliseconds = nowMilliseconds - parseTimestampOrThrow(checkedAt, 'checked_at')
  return ageMilliseconds >= -CLOCK_SKEW_MILLISECONDS && ageMilliseconds <= PRICE_FRESH_HOURS * MILLISECONDS_PER_HOUR
}

// The "You can afford it now" badge. Once Price Watch confirms prices, this will also need status `confirmed`.
export function canAffordNow(response: BestResponse, balance: Cents, now: IsoTimestamp): boolean {
  assertCents(balance, 'balance')
  assertCents(response.target_price, 'target price', 1)
  const isFresh = isPriceFresh(response.checked_at, now)
  const { best } = response
  if (best === null || !isFresh) return false
  assertCents(best.price, 'best price', 1)
  // Price Watch sets meets_target, but the badge also checks the numbers it can see.
  const meetsTarget = best.meets_target && best.price <= response.target_price
  return meetsTarget && !best.suspicious && balance >= best.price
}
