import type { Bucket, Cents, Entry, Goal, IsoDate, LinkedItem, Settings } from './types.ts'

// PATCH bodies follow JSON Merge Patch (RFC 7396): an omitted field is unchanged, and null clears an optional field.
type Clearable<T> = T | null

export interface GoalStats {
  balance: Cents
  remaining: Cents
  progress: number // balance ÷ target; can go above 1
  paydays_remaining: number
  paydays_elapsed: number
  pace: Cents | null
  needed_per_paycheck: Cents
  projected_finish_date: IsoDate | null
  is_on_track: boolean
  is_amount_reached: boolean
  is_date_reached: boolean
}

export interface GoalView {
  goal: Goal
  stats: GoalStats
}

export interface GoalDetail extends GoalView {
  entries: Entry[] // newest first
}

export interface Leftover {
  amount: Cents
  from_goal_id: string | null
  from_goal_name: string | null
}

export const ERROR_CODES = [
  'invalid_input',
  'not_found',
  'settings_not_found',
  'bucket_not_available',
  'goal_locked',
  'carryover_read_only',
  'opening_balance_too_high',
  'settings_required',
  'internal',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ApiError {
  error: { code: ErrorCode; message: string }
}

export type PutSettingsRequest = Pick<Settings, 'anchor_payday' | 'timezone'>

export type CreateBucketRequest = Pick<Bucket, 'name' | 'institution' | 'notes'>

export interface UpdateBucketRequest {
  name?: string
  institution?: Clearable<string>
  notes?: Clearable<string>
}

export type CreateGoalRequest = Pick<Goal, 'bucket_id' | 'name' | 'target_amount' | 'target_date' | 'linked_item'> &
  Partial<Pick<Goal, 'start_date' | 'opening_balance'>>

export interface UpdateGoalRequest {
  name?: string
  target_amount?: Cents
  target_date?: IsoDate
  linked_item?: Clearable<LinkedItem>
}

export type CreateEntryRequest = Pick<Entry, 'type' | 'amount' | 'date' | 'note'>

export interface UpdateEntryRequest {
  type?: Entry['type']
  amount?: Cents
  date?: IsoDate
  note?: Clearable<string>
}

export interface ExportResponse {
  settings: Settings | null // null before first-run setup
  buckets: Bucket[]
  goals: Goal[]
  entries: Entry[]
}
