import type {
  CreateBucketRequest,
  CreateEntryRequest,
  CreateGoalRequest,
  PutSettingsRequest,
  UpdateBucketRequest,
  UpdateEntryRequest,
  UpdateGoalRequest,
} from '@goal-tracker/shared/api'
import { isIsoDate } from '@goal-tracker/shared/dates'
import { isCents } from '@goal-tracker/shared/money'
import { ENTRY_TYPES } from '@goal-tracker/shared/types'
import type { Cents, EntryType, IsoDate, LinkedItem } from '@goal-tracker/shared/types'
import { invalidInput } from './errors.ts'

export const LIMITS = {
  nameLength: 100,
  institutionLength: 100,
  bucketNotesLength: 1000,
  entryNoteLength: 500,
  linkLabelLength: 100,
  linkUrlLength: 2000,
  priceWatchIdLength: 100,
  timeZoneLength: 64,
  // $100 million. Keeps a goal's running balance far inside the safe integer range.
  maxCents: 10_000_000_000,
  minDate: '2000-01-01',
  maxDate: '2199-12-31',
} as const

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RawObject = Record<string, unknown>
type FieldParser<T> = (value: unknown, label: string) => T

function isRawObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isEntryType(value: unknown): value is EntryType {
  return typeof value === 'string' && (ENTRY_TYPES as readonly string[]).includes(value)
}

export function parseId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw invalidInput(`${label} is not a valid ID`)
  return value
}

export function parseText(maxLength: number): FieldParser<string> {
  return (value, label) => {
    if (typeof value !== 'string') throw invalidInput(`${label} must be a string`)
    const text = value.trim()
    if (text.length === 0) throw invalidInput(`${label} must not be empty`)
    if (text.length > maxLength) throw invalidInput(`${label} must be at most ${maxLength} characters`)
    return text
  }
}

export function parseAmount(minimum: Cents): FieldParser<Cents> {
  return (value, label) => {
    if (!isCents(value) || value < minimum || value > LIMITS.maxCents) {
      throw invalidInput(`${label} must be a whole number of cents from ${minimum} to ${LIMITS.maxCents}`)
    }
    return value
  }
}

export const parseDate: FieldParser<IsoDate> = (value, label) => {
  if (!isIsoDate(value) || value < LIMITS.minDate || value > LIMITS.maxDate) {
    throw invalidInput(`${label} must be a date as YYYY-MM-DD from ${LIMITS.minDate} to ${LIMITS.maxDate}`)
  }
  return value
}

export const parseEntryType: FieldParser<EntryType> = (value, label) => {
  if (!isEntryType(value)) throw invalidInput(`${label} must be one of: ${ENTRY_TYPES.join(', ')}`)
  return value
}

// Returns the canonical IANA name, so "america/los_angeles" is stored as "America/Los_Angeles".
export const parseTimeZone: FieldParser<string> = (value, label) => {
  const text = parseText(LIMITS.timeZoneLength)(value, label)
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: text }).resolvedOptions().timeZone
  } catch {
    throw invalidInput(`${label} must be a valid time zone`)
  }
}

export const parseLinkedItem: FieldParser<LinkedItem> = (value, label) => {
  if (!isRawObject(value)) throw invalidInput(`${label} must be an object`)
  rejectUnknownKeys(value, ['label', 'url', 'price_watch_id'], label)
  const url = parseText(LIMITS.linkUrlLength)(value['url'], `${label}.url`)
  if (!isWebUrl(url)) throw invalidInput(`${label}.url must be an http or https URL`)
  const linkedItem: LinkedItem = { label: parseText(LIMITS.linkLabelLength)(value['label'], `${label}.label`), url }
  const priceWatchId = readOptional(value, 'price_watch_id', parseText(LIMITS.priceWatchIdLength), label)
  if (priceWatchId !== undefined) linkedItem.price_watch_id = priceWatchId
  return linkedItem
}

function isWebUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

function rejectUnknownKeys(raw: RawObject, allowedKeys: readonly string[], label: string): void {
  const unknownKey = Object.keys(raw).find((key) => !allowedKeys.includes(key))
  if (unknownKey !== undefined) throw invalidInput(`${label} has an unknown field: ${unknownKey}`)
}

function qualify(parentLabel: string, key: string): string {
  return parentLabel === 'body' ? key : `${parentLabel}.${key}`
}

function readRequired<T>(raw: RawObject, key: string, parse: FieldParser<T>, parentLabel = 'body'): T {
  if (!Object.hasOwn(raw, key)) throw invalidInput(`${qualify(parentLabel, key)} is required`)
  return parse(raw[key], qualify(parentLabel, key))
}

function readOptional<T>(raw: RawObject, key: string, parse: FieldParser<T>, parentLabel = 'body'): T | undefined {
  return Object.hasOwn(raw, key) ? parse(raw[key], qualify(parentLabel, key)) : undefined
}

// For PATCH bodies: absent means unchanged, and null clears the field.
function readClearable<T>(raw: RawObject, key: string, parse: FieldParser<T>): T | null | undefined {
  if (!Object.hasOwn(raw, key)) return undefined
  return raw[key] === null ? null : parse(raw[key], key)
}

export function parseJsonObject(text: string | undefined, allowedKeys: readonly string[]): RawObject {
  if (text === undefined || text.trim() === '') throw invalidInput('Request body is required')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw invalidInput('Request body must be valid JSON')
  }
  if (!isRawObject(parsed)) throw invalidInput('Request body must be a JSON object')
  rejectUnknownKeys(parsed, allowedKeys, 'body')
  return parsed
}

function requireAnyField(raw: RawObject): void {
  if (Object.keys(raw).length === 0) throw invalidInput('Request body must include at least one field')
}

export function parsePutSettings(text: string | undefined): PutSettingsRequest {
  const raw = parseJsonObject(text, ['anchor_payday', 'timezone'])
  return {
    anchor_payday: readRequired(raw, 'anchor_payday', parseDate),
    timezone: readRequired(raw, 'timezone', parseTimeZone),
  }
}

export function parseCreateBucket(text: string | undefined): CreateBucketRequest {
  const raw = parseJsonObject(text, ['name', 'institution', 'notes'])
  const request: CreateBucketRequest = { name: readRequired(raw, 'name', parseText(LIMITS.nameLength)) }
  const institution = readOptional(raw, 'institution', parseText(LIMITS.institutionLength))
  if (institution !== undefined) request.institution = institution
  const notes = readOptional(raw, 'notes', parseText(LIMITS.bucketNotesLength))
  if (notes !== undefined) request.notes = notes
  return request
}

export function parseUpdateBucket(text: string | undefined): UpdateBucketRequest {
  const raw = parseJsonObject(text, ['name', 'institution', 'notes'])
  requireAnyField(raw)
  const request: UpdateBucketRequest = {}
  const name = readOptional(raw, 'name', parseText(LIMITS.nameLength))
  if (name !== undefined) request.name = name
  const institution = readClearable(raw, 'institution', parseText(LIMITS.institutionLength))
  if (institution !== undefined) request.institution = institution
  const notes = readClearable(raw, 'notes', parseText(LIMITS.bucketNotesLength))
  if (notes !== undefined) request.notes = notes
  return request
}

export function parseCreateGoal(text: string | undefined): CreateGoalRequest {
  const raw = parseJsonObject(text, [
    'bucket_id',
    'name',
    'target_amount',
    'target_date',
    'start_date',
    'opening_balance',
    'linked_item',
  ])
  const request: CreateGoalRequest = {
    bucket_id: readRequired(raw, 'bucket_id', parseId),
    name: readRequired(raw, 'name', parseText(LIMITS.nameLength)),
    target_amount: readRequired(raw, 'target_amount', parseAmount(1)),
    target_date: readRequired(raw, 'target_date', parseDate),
  }
  const startDate = readOptional(raw, 'start_date', parseDate)
  if (startDate !== undefined) request.start_date = startDate
  const openingBalance = readOptional(raw, 'opening_balance', parseAmount(0))
  if (openingBalance !== undefined) request.opening_balance = openingBalance
  const linkedItem = readOptional(raw, 'linked_item', parseLinkedItem)
  if (linkedItem !== undefined) request.linked_item = linkedItem
  return request
}

export function parseUpdateGoal(text: string | undefined): UpdateGoalRequest {
  const raw = parseJsonObject(text, ['name', 'target_amount', 'target_date', 'linked_item'])
  requireAnyField(raw)
  const request: UpdateGoalRequest = {}
  const name = readOptional(raw, 'name', parseText(LIMITS.nameLength))
  if (name !== undefined) request.name = name
  const targetAmount = readOptional(raw, 'target_amount', parseAmount(1))
  if (targetAmount !== undefined) request.target_amount = targetAmount
  const targetDate = readOptional(raw, 'target_date', parseDate)
  if (targetDate !== undefined) request.target_date = targetDate
  const linkedItem = readClearable(raw, 'linked_item', parseLinkedItem)
  if (linkedItem !== undefined) request.linked_item = linkedItem
  return request
}

export function parseCreateEntry(text: string | undefined): CreateEntryRequest {
  const raw = parseJsonObject(text, ['type', 'amount', 'date', 'note'])
  const request: CreateEntryRequest = {
    type: readRequired(raw, 'type', parseEntryType),
    amount: readRequired(raw, 'amount', parseAmount(1)),
    date: readRequired(raw, 'date', parseDate),
  }
  const note = readOptional(raw, 'note', parseText(LIMITS.entryNoteLength))
  if (note !== undefined) request.note = note
  return request
}

export function parseUpdateEntry(text: string | undefined): UpdateEntryRequest {
  const raw = parseJsonObject(text, ['type', 'amount', 'date', 'note'])
  requireAnyField(raw)
  const request: UpdateEntryRequest = {}
  const type = readOptional(raw, 'type', parseEntryType)
  if (type !== undefined) request.type = type
  const amount = readOptional(raw, 'amount', parseAmount(1))
  if (amount !== undefined) request.amount = amount
  const date = readOptional(raw, 'date', parseDate)
  if (date !== undefined) request.date = date
  const note = readClearable(raw, 'note', parseText(LIMITS.entryNoteLength))
  if (note !== undefined) request.note = note
  return request
}
