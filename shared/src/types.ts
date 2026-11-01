export type Cents = number
export type IsoDate = string
export type IsoTimestamp = string

export const BUCKET_STATUSES = ['available', 'in_use', 'retired'] as const
export type BucketStatus = (typeof BUCKET_STATUSES)[number]

export const GOAL_STATUSES = ['active', 'completed', 'cancelled'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const COMPLETION_REASONS = ['amount_reached', 'date_reached', 'manual'] as const
export type CompletionReason = (typeof COMPLETION_REASONS)[number]

export const ENTRY_TYPES = ['deposit', 'withdrawal'] as const
export type EntryType = (typeof ENTRY_TYPES)[number]

export const ENTRY_SOURCES = ['manual', 'csv_import', 'carryover'] as const
export type EntrySource = (typeof ENTRY_SOURCES)[number]

export const PAY_CADENCES = ['biweekly'] as const
export type PayCadence = (typeof PAY_CADENCES)[number]

export const CURRENCIES = ['USD'] as const
export type Currency = (typeof CURRENCIES)[number]

export interface Bucket {
  bucket_id: string
  user_id: string
  name: string
  institution?: string
  status: BucketStatus
  notes?: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

export interface LinkedItem {
  label: string
  url: string
  price_watch_id?: string
}

export interface Goal {
  goal_id: string
  user_id: string
  bucket_id: string
  name: string
  target_amount: Cents
  target_date: IsoDate
  start_date: IsoDate
  opening_balance: Cents
  status: GoalStatus
  completion_reason?: CompletionReason
  completed_at?: IsoTimestamp
  linked_item?: LinkedItem
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

export interface Entry {
  entry_id: string
  user_id: string
  goal_id: string
  type: EntryType
  amount: Cents
  date: IsoDate
  note?: string
  source: EntrySource
  import_batch_id?: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

export interface Settings {
  user_id: string
  pay_cadence: PayCadence
  anchor_payday: IsoDate
  timezone: string
  currency: Currency
}
