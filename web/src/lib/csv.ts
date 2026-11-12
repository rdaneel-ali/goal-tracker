import type { ExportResponse } from '@goal-tracker/shared/api'
import type { Cents } from '@goal-tracker/shared/types'

const HEADER = [
  'goal',
  'bucket',
  'date',
  'type',
  'amount',
  'note',
  'source',
  'goal_status',
  'target_amount',
  'target_date',
]

// Free text starting with =, +, - or @ is prefixed with ' so spreadsheet apps don't run it as a formula.
function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

// RFC 4180 quoting.
function quoteCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function formatCentsPlain(cents: Cents): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError(`Invalid cents: ${cents}`)
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

// One row per entry, oldest first, with its goal and bucket alongside.
export function buildEntriesCsv(data: ExportResponse): string {
  const goalsById = new Map(data.goals.map((goal) => [goal.goal_id, goal]))
  const bucketsById = new Map(data.buckets.map((bucket) => [bucket.bucket_id, bucket]))
  const sortedEntries = [...data.entries].sort(
    (first, second) => first.date.localeCompare(second.date) || first.created_at.localeCompare(second.created_at),
  )
  const rows = sortedEntries.map((entry) => {
    const goal = goalsById.get(entry.goal_id)
    if (goal === undefined) throw new RangeError(`Entry belongs to an unknown goal: ${entry.goal_id}`)
    const bucket = bucketsById.get(goal.bucket_id)
    return [
      neutralizeFormula(goal.name),
      neutralizeFormula(bucket?.name ?? ''),
      entry.date,
      entry.type,
      formatCentsPlain(entry.amount),
      neutralizeFormula(entry.note ?? ''),
      entry.source,
      goal.status,
      formatCentsPlain(goal.target_amount),
      goal.target_date,
    ]
  })
  return [HEADER, ...rows].map((row) => row.map(quoteCsvField).join(',')).join('\r\n') + '\r\n'
}
