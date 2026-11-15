import type { BestResponse, WatchSummary } from './price-watch.ts'
import type { Bucket, Cents, Connector, Entry, Goal, IsoDate, IsoTimestamp, LinkedItem, Settings } from './types.ts'

// In PATCH bodies an omitted field is unchanged and null clears an optional field.
// An object field such as linked_item is replaced whole, never merged.
type Clearable<T> = T | null

export interface GoalStats {
  balance: Cents // the bucket's balance now; a closed goal shows final_balance instead
  remaining: Cents
  progress: number // balance ÷ target; can go above 1
  projected_finish_date: IsoDate | null // null shows "Not enough data yet"
  needed_per_week: Cents | null // null without a target date
  is_on_track: boolean | null // null without a target date
  is_amount_reached: boolean
  is_date_reached: boolean
}

// What the API returns for a goal's price panel. Absent when no connector is enabled
// or the goal has no watch.
export interface PriceView {
  response: BestResponse | null // null shows "Price unavailable"
  fetched_at: IsoTimestamp | null // when Goal Tracker last got a good answer; only the "as of" label
  // Exactly !isPriceFresh(checked_at, now): true when the check is more than 48 hours old, when there has
  // been no check yet, or when checked_at is in the future. Never measured from fetched_at.
  // A stale price is shown, but never turns on the badge.
  is_stale: boolean
  can_afford_now: boolean // the badge
}

export interface GoalView {
  goal: Goal
  bucket: Bucket | null // null for a planned goal
  stats: GoalStats | null // null for a planned goal
  price?: PriceView
}

export interface GoalDetail extends GoalView {
  entries: Entry[] // the bucket's recent entries, newest first
}

export interface BucketView {
  bucket: Bucket
  balance: Cents
  active_goal: Pick<Goal, 'goal_id' | 'name'> | null
}

export interface BucketDetail extends BucketView {
  entries: Entry[] // newest first
}

export const ERROR_CODES = [
  'invalid_input',
  'not_found',
  'forbidden',
  'bucket_not_available',
  'goal_not_planned',
  'goal_closed',
  'connector_exists',
  'internal',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ApiError {
  error: { code: ErrorCode; message: string }
}

export type PutSettingsRequest = Pick<Settings, 'timezone'>

export type CreateBucketRequest = Pick<Bucket, 'name' | 'notes'>

export interface UpdateBucketRequest {
  name?: string
  notes?: Clearable<string>
}

// With bucket_id the goal starts active and connected; without it, planned.
export type CreateGoalRequest = Pick<Goal, 'name' | 'target_amount' | 'target_date' | 'linked_item' | 'bucket_id'>

export interface UpdateGoalRequest {
  name?: string
  target_amount?: Cents
  target_date?: Clearable<IsoDate>
  linked_item?: Clearable<LinkedItem>
}

export interface ConnectGoalRequest {
  bucket_id: string
}

export type CreateEntryRequest = Pick<Entry, 'bucket_id' | 'type' | 'amount' | 'date' | 'note'>

export interface UpdateEntryRequest {
  type?: Entry['type']
  amount?: Cents
  date?: IsoDate
  note?: Clearable<string>
}

export type CreateConnectorRequest = Pick<Connector, 'type' | 'name' | 'base_url' | 'key_parameter' | 'enabled'>

export interface UpdateConnectorRequest {
  name?: string
  base_url?: string
  key_parameter?: string
  enabled?: boolean
}

export interface WatchesResponse {
  watches: WatchSummary[] // empty when no connector is enabled
}
