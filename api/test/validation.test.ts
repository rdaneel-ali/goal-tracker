import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HttpError } from '../src/errors.ts'
import { findDateInTimeZone } from '../src/time.ts'
import { applyChanges } from '../src/patch.ts'
import {
  isEntryType,
  parseCreateGoal,
  parseLinkedItem,
  parseTimeZone,
  parseUpdateBucket,
  parseUpdateGoal,
} from '../src/validation.ts'

const ID = '00000000-0000-4000-8000-000000000001'

function rejects(fn: () => unknown): void {
  assert.throws(fn, (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_input')
}

test('isEntryType accepts only the two entry types', () => {
  assert.equal(isEntryType('deposit'), true)
  assert.equal(isEntryType('withdrawal'), true)
  for (const value of ['Deposit', '', 'transfer', null, undefined, 1, {}]) assert.equal(isEntryType(value), false)
})

test('parsers return only the known fields, with strings trimmed', () => {
  const request = parseCreateGoal(
    JSON.stringify({
      bucket_id: ID,
      name: '  Mac  ',
      target_amount: 100,
      target_date: '2026-12-31',
      linked_item: { label: ' L ', url: 'https://a.example/x', price_watch_id: 'p' },
    }),
  )
  assert.deepEqual(request, {
    bucket_id: ID,
    name: 'Mac',
    target_amount: 100,
    target_date: '2026-12-31',
    linked_item: { label: 'L', url: 'https://a.example/x', price_watch_id: 'p' },
  })
})

test('an object with a __proto__ key is rejected as an unknown field', () => {
  rejects(() => parseUpdateGoal('{"__proto__": {"name": "x"}}'))
  rejects(() => parseUpdateGoal('{"name": "ok", "constructor": 1}'))
})

test('patch parsers keep null only for the clearable fields', () => {
  assert.deepEqual(parseUpdateBucket('{"institution": null, "notes": null}'), { institution: null, notes: null })
  assert.deepEqual(parseUpdateGoal('{"linked_item": null}'), { linked_item: null })
  rejects(() => parseUpdateGoal('{"target_date": null}'))
})

test('linked item: http and https only, bounded lengths, no extra keys', () => {
  assert.ok(parseLinkedItem({ label: 'a', url: 'http://a.example' }, 'linked_item'))
  for (const value of [
    'str',
    null,
    [],
    { label: 'a' },
    { url: 'https://a.example' },
    { label: 'a', url: 'ftp://a.example' },
    { label: 'a', url: 'not a url' },
    { label: 'a', url: `https://a.example/${'x'.repeat(2000)}` },
    { label: 'a', url: 'https://a.example', price_watch_id: '' },
  ]) {
    rejects(() => parseLinkedItem(value, 'linked_item'))
  }
})

test('time zones are validated and canonicalized', () => {
  assert.equal(parseTimeZone('america/new_york', 'timezone'), 'America/New_York')
  rejects(() => parseTimeZone('Nowhere/City', 'timezone'))
  rejects(() => parseTimeZone('', 'timezone'))
})

test('findDateInTimeZone uses the calendar date in the zone, either side of midnight', () => {
  assert.equal(findDateInTimeZone(new Date('2026-11-12T07:59:59Z'), 'America/Los_Angeles'), '2026-11-11')
  assert.equal(findDateInTimeZone(new Date('2026-11-12T08:00:00Z'), 'America/Los_Angeles'), '2026-11-12')
  // Daylight saving: PDT in July, PST in November.
  assert.equal(findDateInTimeZone(new Date('2026-07-01T07:00:00Z'), 'America/Los_Angeles'), '2026-07-01')
  assert.equal(findDateInTimeZone(new Date('2026-07-01T06:59:00Z'), 'America/Los_Angeles'), '2026-06-30')
})

test('applyChanges: omitted unchanged, null removes, objects replaced whole', () => {
  const record: { a: number; b?: string; c?: { x: number; y?: number } } = { a: 1, b: 'keep', c: { x: 1, y: 2 } }
  assert.deepEqual(applyChanges(record, {}), record)
  assert.deepEqual(applyChanges(record, { b: null }), { a: 1, c: { x: 1, y: 2 } })
  assert.deepEqual(applyChanges(record, { c: { x: 9 } }), { a: 1, b: 'keep', c: { x: 9 } })
  assert.deepEqual(record, { a: 1, b: 'keep', c: { x: 1, y: 2 } })
})
