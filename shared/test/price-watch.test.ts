import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  canAffordNow,
  isPriceFresh,
  parseBestResponse,
  parseListingsResponse,
  parseWatchSummaries,
} from '../src/price-watch.ts'
import type { BestResponse } from '../src/price-watch.ts'

const sampleJson: unknown = JSON.parse(readFileSync(new URL('fixtures/price-watch-best.json', import.meta.url), 'utf8'))
const CHECKED_AT = '2026-11-14T14:00:00Z'
const MAX = Number.MAX_SAFE_INTEGER

function loadSample(): BestResponse {
  const parsed = parseBestResponse(sampleJson)
  assert.notEqual(parsed, null)
  return parsed as BestResponse
}

function withBest(overrides: Record<string, unknown>): Record<string, unknown> {
  const sample = structuredClone(sampleJson) as Record<string, unknown>
  return { ...sample, best: { ...(sample['best'] as Record<string, unknown>), ...overrides } }
}

const manualListing = {
  title: 'Mac mini (manual)',
  price: 140000,
  condition: 'unknown',
  url: null,
  source_name: 'Manual',
  meets_target: true,
  suspicious: false,
  suspicious_reason: null,
  status: 'confirmed',
  seen_at: '2026-11-10T09:30:00.123Z',
}

test("parseBestResponse accepts Price Watch's sample JSON unchanged", () => {
  assert.deepEqual(parseBestResponse(sampleJson), sampleJson)
})

test('parseBestResponse accepts a watch with no check yet and no best price', () => {
  const response = {
    watch_id: 'w_02',
    name: 'Refurb',
    target_price: 149900,
    checked_at: null,
    check_ok: false,
    best: null,
  }
  assert.deepEqual(parseBestResponse(response), response)
})

test('parseBestResponse accepts a manual best price with no URL', () => {
  const response = withBest(manualListing)
  assert.deepEqual(parseBestResponse(response), response)
})

test('parseBestResponse drops fields it does not know, since new fields may be added', () => {
  const response = { ...withBest({ extra_field: 1 }), another_field: 'x' }
  assert.deepEqual(parseBestResponse(response), sampleJson)
})

test('parseBestResponse returns null for anything that is not a best response', () => {
  for (const value of [null, undefined, 'text', 42, [], {}]) {
    assert.equal(parseBestResponse(value), null, JSON.stringify(value))
  }
})

test('parseBestResponse returns null when a top-level field is missing or wrong', () => {
  const sample = sampleJson as Record<string, unknown>
  const badFields: Record<string, unknown[]> = {
    watch_id: [undefined, '', 1],
    name: [undefined, 1],
    target_price: [undefined, 0, -1, 1.5, '149900', MAX + 1],
    checked_at: [undefined, '2026-11-14', '2026-11-14T14:00:00', '2026-11-14T14:00:00+02:00', 'not a date'],
    check_ok: [undefined, 'true', 1],
    best: [undefined, 'none', []],
  }
  for (const [field, values] of Object.entries(badFields)) {
    for (const value of values) {
      assert.equal(parseBestResponse({ ...sample, [field]: value }), null, `${field}: ${String(value)}`)
    }
  }
})

test('parseBestResponse returns null when a listing field is missing or wrong', () => {
  const badFields: Record<string, unknown[]> = {
    title: [undefined, 1],
    price: [undefined, 0, -100, 1.5, '135900', MAX + 1],
    condition: [undefined, 'Refurbished', 'broken'],
    url: [
      undefined,
      1,
      'http://example.com/listing',
      'javascript:alert(1)',
      '/listing',
      'example.com',
      ' https://example.com',
      'HTTPS://example.com',
      'https://',
      'https:///path',
      'https://user@evil.example',
      'https://example.com/a b',
      'https://example.com/\nx',
      'https://trusted.example\\@evil.example/x',
      'https://good.example\\evil.example',
      'https://example.com/a\\b',
      'https://example.com/\u0000',
      'https://example.com/\u007f',
      'https://exa\u202emple.com/x',
      'https://example.com/\u200b',
      'https://exa\tmple.com',
    ],
    source_name: [undefined, 1],
    meets_target: [undefined, 'yes'],
    suspicious: [undefined, 0],
    suspicious_reason: [undefined, 1],
    status: [undefined, 'pending'],
    seen_at: [undefined, '2026-11-14', 'yesterday'],
  }
  for (const [field, values] of Object.entries(badFields)) {
    for (const value of values) {
      assert.equal(parseBestResponse(withBest({ [field]: value })), null, `${field}: ${String(value)}`)
    }
  }
})

test('parseBestResponse allows a null URL only on the manual price', () => {
  assert.equal(parseBestResponse(withBest({ url: null })), null)
  assert.notEqual(parseBestResponse(withBest({ ...manualListing, url: 'https://example.com/manual' })), null)
})

test('parseBestResponse rejects an impossible timestamp', () => {
  assert.equal(parseBestResponse({ ...(sampleJson as object), checked_at: '2026-02-30T14:00:00Z' }), null)
  assert.equal(parseBestResponse({ ...(sampleJson as object), checked_at: '2026-11-14T25:00:00Z' }), null)
})

test('parseListingsResponse accepts listings with meets_spec and spec_reason', () => {
  const sample = sampleJson as Record<string, unknown>
  const listing = { ...(sample['best'] as object), meets_spec: true, spec_reason: 'M6, 32GB, 512GB' }
  const response = {
    watch_id: 'w_01',
    checked_at: CHECKED_AT,
    listings: [listing, { ...manualListing, meets_spec: true, spec_reason: 'Entered by hand' }],
  }
  assert.deepEqual(parseListingsResponse(response), response)
  assert.deepEqual(parseListingsResponse({ watch_id: 'w_01', checked_at: null, listings: [] }), {
    watch_id: 'w_01',
    checked_at: null,
    listings: [],
  })
})

test('parseListingsResponse returns null when any listing is bad', () => {
  const sample = sampleJson as Record<string, unknown>
  const goodListing = { ...(sample['best'] as object), meets_spec: false, spec_reason: '16GB only' }
  const badListings = [
    { ...goodListing, meets_spec: undefined },
    { ...goodListing, spec_reason: 1 },
    { ...goodListing, price: 0 },
  ]
  for (const badListing of badListings) {
    const response = { watch_id: 'w_01', checked_at: CHECKED_AT, listings: [goodListing, badListing] }
    assert.equal(parseListingsResponse(response), null)
  }
  assert.equal(parseListingsResponse({ watch_id: 'w_01', checked_at: CHECKED_AT, listings: 'none' }), null)
  assert.equal(parseListingsResponse([goodListing]), null)
})

test('parseWatchSummaries accepts the pickers list', () => {
  const watches = [
    { watch_id: 'w_01', name: 'Mac mini', target_price: 149900 },
    { watch_id: 'w_02', name: 'MacBook Pro', target_price: 200000, extra: true },
  ]
  assert.deepEqual(parseWatchSummaries(watches), [
    { watch_id: 'w_01', name: 'Mac mini', target_price: 149900 },
    { watch_id: 'w_02', name: 'MacBook Pro', target_price: 200000 },
  ])
  assert.deepEqual(parseWatchSummaries([]), [])
})

test('parseWatchSummaries returns null when the list or any watch is bad', () => {
  const badValues = [
    null,
    {},
    [{ watch_id: 'w_01', name: 'Mac mini' }],
    [{ watch_id: '', name: 'Mac mini', target_price: 149900 }],
    [{ watch_id: 'w_01', name: 'Mac mini', target_price: 0 }],
  ]
  for (const value of badValues) {
    assert.equal(parseWatchSummaries(value), null, JSON.stringify(value))
  }
})

test('isPriceFresh is true up to exactly 48 hours after the check', () => {
  assert.equal(isPriceFresh(CHECKED_AT, '2026-11-14T14:00:00Z'), true)
  assert.equal(isPriceFresh(CHECKED_AT, '2026-11-16T14:00:00Z'), true)
  assert.equal(isPriceFresh(CHECKED_AT, '2026-11-16T14:00:00.001Z'), false)
})

test('isPriceFresh is false before the first check', () => {
  assert.equal(isPriceFresh(null, '2026-11-14T14:00:00Z'), false)
})

test('isPriceFresh allows 5 minutes of clock skew, but not a check from the future', () => {
  assert.equal(isPriceFresh('2026-11-14T14:05:00Z', '2026-11-14T14:00:00Z'), true)
  assert.equal(isPriceFresh('2026-11-14T14:05:00.001Z', '2026-11-14T14:00:00Z'), false)
  assert.equal(isPriceFresh('2027-01-01T00:00:00Z', '2026-11-14T14:00:00Z'), false)
})

test('isPriceFresh throws on a bad timestamp', () => {
  for (const timestamp of ['', '2026-11-14', '2026-11-14T14:00:00', 'soon', '2026-13-01T00:00:00Z']) {
    assert.throws(() => isPriceFresh(timestamp, CHECKED_AT), RangeError, timestamp)
    assert.throws(() => isPriceFresh(CHECKED_AT, timestamp), RangeError, timestamp)
  }
})

test('canAffordNow is true when a fresh, in-target, unsuspicious price is covered', () => {
  const sample = loadSample()
  assert.equal(canAffordNow(sample, 135900, '2026-11-15T09:00:00Z'), true)
  assert.equal(canAffordNow(sample, 200000, '2026-11-15T09:00:00Z'), true)
})

test('canAffordNow is false when the balance falls short', () => {
  assert.equal(canAffordNow(loadSample(), 135899, '2026-11-15T09:00:00Z'), false)
  assert.equal(canAffordNow(loadSample(), -500, '2026-11-15T09:00:00Z'), false)
})

test('canAffordNow is false for a stale price, a missing best or no check', () => {
  const sample = loadSample()
  assert.equal(canAffordNow(sample, 200000, '2026-11-17T09:00:00Z'), false)
  assert.equal(canAffordNow({ ...sample, best: null }, 200000, '2026-11-15T09:00:00Z'), false)
  assert.equal(canAffordNow({ ...sample, checked_at: null }, 200000, '2026-11-15T09:00:00Z'), false)
})

test('canAffordNow is false when the price is over target or suspicious', () => {
  const sample = loadSample()
  if (sample.best === null) throw new Error('sample has a best price')
  const overTarget = { ...sample, best: { ...sample.best, meets_target: false } }
  const suspicious = { ...sample, best: { ...sample.best, suspicious: true, suspicious_reason: 'Far below history' } }
  assert.equal(canAffordNow(overTarget, 200000, '2026-11-15T09:00:00Z'), false)
  assert.equal(canAffordNow(suspicious, 200000, '2026-11-15T09:00:00Z'), false)
})

test('canAffordNow does not trust meets_target when the price is above the target', () => {
  const sample = loadSample()
  if (sample.best === null) throw new Error('sample has a best price')
  const mislabelled = { ...sample, best: { ...sample.best, price: 149901 } }
  assert.equal(canAffordNow(mislabelled, 200000, '2026-11-15T09:00:00Z'), false)
})

test('canAffordNow throws on a bad target price, even when the price is stale', () => {
  for (const targetPrice of [0, -1, 1.5, Number.NaN, MAX + 1]) {
    const response = { ...loadSample(), target_price: targetPrice }
    assert.throws(() => canAffordNow(response, 200000, '2026-11-15T09:00:00Z'), RangeError, String(targetPrice))
    assert.throws(() => canAffordNow(response, 200000, '2026-12-15T09:00:00Z'), RangeError, String(targetPrice))
  }
})

test('canAffordNow throws on a bad balance', () => {
  for (const balance of [1.5, Number.NaN, Infinity, MAX + 1]) {
    assert.throws(() => canAffordNow(loadSample(), balance, '2026-11-15T09:00:00Z'), RangeError, String(balance))
  }
})
