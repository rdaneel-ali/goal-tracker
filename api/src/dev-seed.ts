import { addDaysToDate } from '@goal-tracker/shared/dates'
import type { IsoDate } from '@goal-tracker/shared/types'

// Calls the API like a client would and returns the parsed body. Throws on any non-2xx response.
export type ApiCall = (method: string, path: string, body?: unknown) => Promise<unknown>

const FRIDAY = 5
const PAY_CYCLE_DAYS = 14

function findLatestFriday(today: IsoDate): IsoDate {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  return addDaysToDate(today, -((weekday - FRIDAY + 7) % 7))
}

interface Created {
  bucket_id?: string
  goal?: { goal_id: string }
}

// Fills a fresh in-memory store through the API, so every record passes the same validation as real data.
export async function seedDevData(call: ApiCall, today: IsoDate): Promise<void> {
  const anchorPayday = findLatestFriday(today)
  const paydayAgo = (cyclesAgo: number): IsoDate => addDaysToDate(anchorPayday, -cyclesAgo * PAY_CYCLE_DAYS)

  await call('PUT', '/api/settings', { anchor_payday: anchorPayday, timezone: 'America/Los_Angeles' })

  const createBucket = async (name: string, institution: string): Promise<string> => {
    const bucket = (await call('POST', '/api/buckets', { name, institution })) as Created
    return bucket.bucket_id ?? ''
  }
  const createGoal = async (body: Record<string, unknown>): Promise<string> => {
    const view = (await call('POST', '/api/goals', body)) as Created
    return view.goal?.goal_id ?? ''
  }
  const addEntry = (goalId: string, type: 'deposit' | 'withdrawal', amount: number, date: IsoDate, note: string) =>
    call('POST', `/api/goals/${goalId}/entries`, { type, amount, date, note })

  const allyId = await createBucket('Ally savings', 'Ally')
  const marcusId = await createBucket('Marcus HYSA', 'Marcus')
  const capitalOneId = await createBucket('Capital One 360', 'Capital One')

  // Roughly on track: about $110 a paycheck against a $1,999 target five months out.
  const macId = await createGoal({
    bucket_id: allyId,
    name: 'Mac mini M6',
    target_amount: 199_900,
    target_date: addDaysToDate(today, 150),
    start_date: paydayAgo(8),
    linked_item: { label: 'Mac mini M6 (32GB/512GB)', url: 'https://www.apple.com/mac-mini/' },
  })
  const macDeposits = [11_000, 11_000, 12_000, 10_000, 11_000, 11_000, 11_500, 10_500, 11_000]
  for (const [i, amount] of macDeposits.entries()) {
    await addEntry(macId, 'deposit', amount, paydayAgo(8 - i), 'Paycheck')
  }

  // Behind pace: a $500 head start, then $150 a paycheck and one $150 withdrawal, against $3,000 in four months.
  const emergencyId = await createGoal({
    bucket_id: marcusId,
    name: 'Emergency fund top-up',
    target_amount: 300_000,
    target_date: addDaysToDate(today, 120),
    start_date: paydayAgo(6),
    opening_balance: 50_000,
  })
  for (let cyclesAgo = 6; cyclesAgo >= 0; cyclesAgo--) {
    await addEntry(emergencyId, 'deposit', 15_000, paydayAgo(cyclesAgo), 'Paycheck')
  }
  await addEntry(emergencyId, 'withdrawal', 15_000, paydayAgo(3), 'Car repair')

  // Completed, with $42 left in the bucket to try the leftover and carryover flow.
  const airpodsId = await createGoal({
    bucket_id: capitalOneId,
    name: 'AirPods Pro',
    target_amount: 24_900,
    target_date: addDaysToDate(today, -30),
    start_date: paydayAgo(12),
  })
  for (let cyclesAgo = 11; cyclesAgo >= 7; cyclesAgo--) {
    await addEntry(airpodsId, 'deposit', 6_000, paydayAgo(cyclesAgo), 'Paycheck')
  }
  await call('POST', `/api/goals/${airpodsId}/complete`)
  await addEntry(airpodsId, 'withdrawal', 25_800, paydayAgo(2), 'Bought AirPods Pro')
}
