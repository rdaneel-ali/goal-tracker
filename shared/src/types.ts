export type Cents = number
export type IsoDate = string
export type IsoTimestamp = string

export const GOAL_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const COMPLETION_REASONS = ['amount_reached', 'price_covered', 'date_reached', 'manual'] as const
export type CompletionReason = (typeof COMPLETION_REASONS)[number]

export const ENTRY_TYPES = ['deposit', 'withdrawal'] as const
export type EntryType = (typeof ENTRY_TYPES)[number]

export const CURRENCIES = ['USD'] as const
export type Currency = (typeof CURRENCIES)[number]

export const CONNECTOR_TYPES = ['price_watch'] as const
export type ConnectorType = (typeof CONNECTOR_TYPES)[number]

export interface Bucket {
  bucket_id: string
  user_id: string
  name: string
  notes?: string
  // Set and cleared only together with that goal, in one transaction.
  active_goal_id?: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

export interface LinkedItem {
  label?: string
  url?: string
  price_watch_id?: string
}

export interface Goal {
  goal_id: string
  user_id: string
  name: string
  target_amount: Cents
  target_date?: IsoDate
  status: GoalStatus
  // Set when connected, and kept after closing as a record.
  bucket_id?: string
  start_date?: IsoDate
  start_balance?: Cents
  final_balance?: Cents
  completion_reason?: CompletionReason
  closed_at?: IsoTimestamp
  linked_item?: LinkedItem
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

export interface Entry {
  entry_id: string
  user_id: string
  bucket_id: string
  type: EntryType
  amount: Cents
  date: IsoDate
  note?: string
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}

export interface Settings {
  user_id: string
  timezone: string
  currency: Currency
}

export interface Connector {
  // Equals its type in the MVP, so there is at most one connector of each type.
  connector_id: ConnectorType
  type: ConnectorType
  name: string
  base_url: string
  // The SSM parameter name that holds the API key; the key itself is never stored here.
  key_parameter: string
  enabled: boolean
  last_test_at?: IsoTimestamp
  last_test_ok?: boolean
  created_at: IsoTimestamp
  updated_at: IsoTimestamp
}
