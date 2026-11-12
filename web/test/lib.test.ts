import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExportResponse, GoalStats, GoalView } from '@goal-tracker/shared/api'
import type { Bucket, Entry, Goal } from '@goal-tracker/shared/types'
import { buildEntriesCsv } from '../src/lib/csv.ts'
import { findTodayInTimezone, formatIsoDate, formatShortDate } from '../src/lib/dates.ts'
import { formatProgressPercent, selectGoalStatus } from '../src/lib/status.ts'

const goal: Goal = {
  goal_id: 'g1',
  user_id: 'u1',
  bucket_id: 'b1',
  name: 'Mac mini',
  target_amount: 199900,
  target_date: '2027-04-01',
  start_date: '2026-10-01',
  opening_balance: 0,
  status: 'active',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}

const stats: GoalStats = {
  balance: 100000,
  remaining: 99900,
  progress: 0.5,
  paydays_remaining: 10,
  paydays_elapsed: 2,
  pace: 50000,
  needed_per_paycheck: 9990,
  projected_finish_date: '2026-12-01',
  is_on_track: true,
  is_amount_reached: false,
  is_date_reached: false,
}

function makeView(goalChanges: Partial<Goal>, statsChanges: Partial<GoalStats>): GoalView {
  return { goal: { ...goal, ...goalChanges }, stats: { ...stats, ...statsChanges } }
}

test('today is the calendar date in the given timezone', () => {
  const lateEveningInLosAngeles = new Date('2026-11-12T07:30:00Z')
  assert.equal(findTodayInTimezone('America/Los_Angeles', lateEveningInLosAngeles), '2026-11-11')
  assert.equal(findTodayInTimezone('UTC', lateEveningInLosAngeles), '2026-11-12')
})

test('ISO dates format without shifting the day', () => {
  assert.equal(formatIsoDate('2027-03-01'), 'Mar 1, 2027')
  assert.equal(formatShortDate('2026-12-31'), 'Dec 31')
})

test('status: a locked goal shows its status first', () => {
  assert.equal(selectGoalStatus(makeView({ status: 'completed' }, { is_on_track: false })), 'completed')
  assert.equal(selectGoalStatus(makeView({ status: 'cancelled' }, {})), 'cancelled')
})

test('status: amount reached wins over a passed date and the on-track flag', () => {
  const fundedAndLate = makeView({}, { is_amount_reached: true, is_date_reached: true, is_on_track: false })
  assert.equal(selectGoalStatus(fundedAndLate), 'amount_reached')
})

test('status: date reached comes before on track', () => {
  assert.equal(selectGoalStatus(makeView({}, { is_date_reached: true, is_on_track: false })), 'date_reached')
})

test('status: otherwise on track or behind', () => {
  assert.equal(selectGoalStatus(makeView({}, {})), 'on_track')
  assert.equal(selectGoalStatus(makeView({}, { is_on_track: false })), 'behind')
})

test('progress percent rounds down and can pass 100', () => {
  assert.equal(formatProgressPercent(0.999), '99%')
  assert.equal(formatProgressPercent(1.25), '125%')
})

const bucket: Bucket = {
  bucket_id: 'b1',
  user_id: 'u1',
  name: 'Ally, savings',
  status: 'in_use',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}

function makeEntry(changes: Partial<Entry>): Entry {
  return {
    entry_id: 'e1',
    user_id: 'u1',
    goal_id: 'g1',
    type: 'deposit',
    amount: 11005,
    date: '2026-10-10',
    source: 'manual',
    created_at: '2026-10-10T00:00:00.000Z',
    updated_at: '2026-10-10T00:00:00.000Z',
    ...changes,
  }
}

test('CSV export: one row per entry, oldest first, quoted and formula-safe', () => {
  const data: ExportResponse = {
    settings: null,
    buckets: [bucket],
    goals: [goal],
    entries: [
      makeEntry({ entry_id: 'e2', date: '2026-10-24', amount: 5, note: '=SUM(A1) "x"' }),
      makeEntry({ entry_id: 'e1', type: 'withdrawal' }),
    ],
  }
  const lines = buildEntriesCsv(data).split('\r\n')
  assert.equal(lines[0], 'goal,bucket,date,type,amount,note,source,goal_status,target_amount,target_date')
  assert.equal(lines[1], 'Mac mini,"Ally, savings",2026-10-10,withdrawal,110.05,,manual,active,1999.00,2027-04-01')
  assert.equal(
    lines[2],
    `Mac mini,"Ally, savings",2026-10-24,deposit,0.05,"'=SUM(A1) ""x""",manual,active,1999.00,2027-04-01`,
  )
  assert.equal(lines[3], '')
})

test('CSV export throws on an entry whose goal is missing', () => {
  const data: ExportResponse = { settings: null, buckets: [bucket], goals: [], entries: [makeEntry({})] }
  assert.throws(() => buildEntriesCsv(data), RangeError)
})
