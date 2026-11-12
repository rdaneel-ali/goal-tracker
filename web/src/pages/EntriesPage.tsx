import { useCallback, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import type { UpdateEntryRequest } from '@goal-tracker/shared/api'
import type { Entry, EntryType } from '@goal-tracker/shared/types'
import { ConfirmSheet } from '../components/ConfirmSheet.tsx'
import { EntryForm, type EntryFormValues } from '../components/EntryForm.tsx'
import { EntryList, EntryRow } from '../components/EntryList.tsx'
import { ErrorPanel, Loading, Money, Sheet, buttonStyles, cardStyles } from '../components/ui.tsx'
import { useLoader } from '../hooks/useLoader.ts'
import { api } from '../lib/api.ts'
import { formatIsoDate } from '../lib/dates.ts'

const FILTERS: { value: EntryType | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
]

function parseFilter(value: string | null): EntryType | null {
  return value === 'deposit' || value === 'withdrawal' ? value : null
}

export function EntriesPage() {
  const { goalId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get('type'))
  const { state, reload } = useLoader(useCallback(() => api.getGoal(goalId), [goalId]))
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<Entry | null>(null)

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorPanel error={state.error} onRetry={reload} />

  const { goal, stats, entries } = state.data
  const isLocked = goal.status !== 'active'
  const visibleEntries = filter === null ? entries : entries.filter((entry) => entry.type === filter)

  async function handleEdit(entry: Entry, values: EntryFormValues) {
    const changes: UpdateEntryRequest = { type: values.type, amount: values.amount, date: values.date }
    if (values.note !== '') changes.note = values.note
    else if (entry.note !== undefined) changes.note = null
    await api.updateEntry(goal.goal_id, entry.entry_id, changes)
    setEditingEntry(null)
    reload()
  }

  async function handleDelete(entry: Entry) {
    await api.deleteEntry(goal.goal_id, entry.entry_id)
    setDeletingEntry(null)
    reload()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/goals/${goal.goal_id}`}
          className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-100"
        >
          ‹ {goal.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Entries</h1>
        <p className="text-stone-500 dark:text-stone-400">
          Balance <Money cents={stats.balance} />
        </p>
      </div>

      <div
        className="flex gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800"
        role="tablist"
        aria-label="Filter entries"
      >
        {FILTERS.map((option) => {
          const isSelected = filter === option.value
          return (
            <button
              key={option.label}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSearchParams(option.value === null ? {} : { type: option.value }, { replace: true })}
              className={`min-h-10 flex-1 rounded-lg text-sm font-semibold transition ${
                isSelected
                  ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-100'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <section className={cardStyles}>
        {visibleEntries.length === 0 ? (
          <p className="py-6 text-center text-stone-500 dark:text-stone-400">Nothing here yet.</p>
        ) : (
          <EntryList>
            {visibleEntries.map((entry) => (
              <EntryRow
                key={entry.entry_id}
                entry={entry}
                actions={
                  entry.source === 'carryover' ? undefined : (
                    <div className="flex shrink-0">
                      <button
                        type="button"
                        className={`${buttonStyles.ghost} px-2`}
                        onClick={() => setEditingEntry(entry)}
                        aria-label={`Edit entry from ${formatIsoDate(entry.date)}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${buttonStyles.ghost} px-2 text-red-700 dark:text-red-400`}
                        onClick={() => setDeletingEntry(entry)}
                        aria-label={`Delete entry from ${formatIsoDate(entry.date)}`}
                      >
                        Delete
                      </button>
                    </div>
                  )
                }
              />
            ))}
          </EntryList>
        )}
      </section>

      <Sheet isOpen={editingEntry !== null} title="Edit entry" onClose={() => setEditingEntry(null)}>
        {editingEntry !== null && (
          <EntryForm
            initialValues={{
              type: editingEntry.type,
              amount: editingEntry.amount,
              date: editingEntry.date,
              note: editingEntry.note ?? '',
            }}
            // A locked goal can't gain a deposit, but an existing deposit keeps its type.
            allowDeposit={!isLocked || editingEntry.type === 'deposit'}
            balanceBefore={
              editingEntry.type === 'deposit'
                ? stats.balance - editingEntry.amount
                : stats.balance + editingEntry.amount
            }
            submitLabel="Save changes"
            onSubmit={(values) => handleEdit(editingEntry, values)}
          />
        )}
      </Sheet>

      <ConfirmSheet
        isOpen={deletingEntry !== null}
        title="Delete this entry?"
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => (deletingEntry === null ? Promise.resolve() : handleDelete(deletingEntry))}
        onClose={() => setDeletingEntry(null)}
      >
        {deletingEntry !== null && (
          <>
            The {deletingEntry.type} of <Money cents={deletingEntry.amount} /> on {formatIsoDate(deletingEntry.date)} is
            removed for good.
          </>
        )}
      </ConfirmSheet>
    </div>
  )
}
