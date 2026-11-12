import type { ReactNode } from 'react'
import { formatCents } from '@goal-tracker/shared/money'
import type { Entry } from '@goal-tracker/shared/types'
import { formatIsoDate } from '../lib/dates.ts'

export function EntryRow({ entry, actions }: { entry: Entry; actions?: ReactNode }) {
  const isDeposit = entry.type === 'deposit'
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full text-lg font-bold ${
          isDeposit
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
        }`}
        aria-hidden="true"
      >
        {isDeposit ? '+' : '−'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{entry.note ?? (isDeposit ? 'Deposit' : 'Withdrawal')}</p>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {formatIsoDate(entry.date)}
          {entry.source === 'carryover' && ' · carryover'}
        </p>
      </div>
      <span
        className={`font-semibold tabular-nums ${isDeposit ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-700 dark:text-stone-300'}`}
      >
        <span className="sr-only">{isDeposit ? 'Deposit of ' : 'Withdrawal of '}</span>
        {isDeposit ? '+' : '−'}
        {formatCents(entry.amount)}
      </span>
      {actions}
    </li>
  )
}

export function EntryList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-stone-200 dark:divide-stone-800">{children}</ul>
}
