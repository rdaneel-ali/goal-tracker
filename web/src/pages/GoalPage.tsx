import { useCallback, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import type { GoalDetail } from '@goal-tracker/shared/api'
import type { Bucket, EntryType } from '@goal-tracker/shared/types'
import { ConfirmSheet } from '../components/ConfirmSheet.tsx'
import { EntryForm, type EntryFormValues } from '../components/EntryForm.tsx'
import { EntryList, EntryRow } from '../components/EntryList.tsx'
import {
  ErrorPanel,
  Loading,
  Money,
  ProgressBar,
  Sheet,
  StatusBadge,
  buttonStyles,
  cardStyles,
} from '../components/ui.tsx'
import { useLoader } from '../hooks/useLoader.ts'
import { api } from '../lib/api.ts'
import { findTodayInTimezone, formatIsoDate } from '../lib/dates.ts'
import { formatProgressPercent, selectGoalStatus } from '../lib/status.ts'
import { useSettings } from '../settings-context.ts'

const RECENT_ENTRY_COUNT = 5

type GoalAction = 'complete' | 'cancel' | 'reopen'

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950">
      <dt className="text-xs font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{children}</dd>
    </div>
  )
}

export function GoalPage() {
  const { goalId = '' } = useParams()
  const { settings } = useSettings()
  const load = useCallback(async (): Promise<{ detail: GoalDetail; bucket: Bucket | undefined }> => {
    const [detail, buckets] = await Promise.all([api.getGoal(goalId), api.listBuckets()])
    return { detail, bucket: buckets.find((bucket) => bucket.bucket_id === detail.goal.bucket_id) }
  }, [goalId])
  const { state, reload } = useLoader(load)
  const [quickAddType, setQuickAddType] = useState<EntryType | null>(null)
  const [pendingAction, setPendingAction] = useState<GoalAction | null>(null)

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorPanel error={state.error} onRetry={reload} />

  const { detail, bucket } = state.data
  const { goal, stats, entries } = detail
  const status = selectGoalStatus(detail)
  const isLocked = goal.status !== 'active'
  const today = findTodayInTimezone(settings.timezone)

  async function handleQuickAdd(values: EntryFormValues) {
    await api.createEntry(goal.goal_id, {
      type: values.type,
      amount: values.amount,
      date: values.date,
      ...(values.note === '' ? {} : { note: values.note }),
    })
    setQuickAddType(null)
    reload()
  }

  async function runGoalAction(action: GoalAction) {
    if (action === 'complete') await api.completeGoal(goal.goal_id)
    if (action === 'cancel') await api.cancelGoal(goal.goal_id)
    if (action === 'reopen') await api.reopenGoal(goal.goal_id)
    setPendingAction(null)
    reload()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-100">
          ‹ All goals
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{goal.name}</h1>
            <p className="text-stone-500 dark:text-stone-400">
              {bucket?.name}
              {goal.linked_item !== undefined && (
                <>
                  {' · '}
                  <a
                    href={goal.linked_item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 hover:underline dark:text-brand-100"
                  >
                    {goal.linked_item.label} ↗
                  </a>
                </>
              )}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      <section className={cardStyles} aria-label="Progress">
        <div className="flex items-baseline justify-between gap-2">
          <p>
            <Money cents={stats.balance} className="text-4xl font-bold" />
            <span className="text-stone-500 dark:text-stone-400">
              {' '}
              of <Money cents={goal.target_amount} />
            </span>
          </p>
          <span className="text-lg font-semibold text-brand-700 dark:text-brand-100">
            {formatProgressPercent(stats.progress)}
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar progress={stats.progress} label={`${goal.name} progress`} />
        </div>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          <Money cents={stats.remaining} /> to go · target {formatIsoDate(goal.target_date)}
        </p>

        {status === 'amount_reached' && (
          <div className="mt-4 rounded-xl bg-brand-50 p-4 dark:bg-brand-900/40">
            <p className="font-semibold">You reached your target! 🎉</p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
              Mark it complete when you're ready. Then record the purchase as a withdrawal.
            </p>
            <button
              type="button"
              className={`${buttonStyles.primary} mt-3`}
              onClick={() => setPendingAction('complete')}
            >
              Complete goal
            </button>
          </div>
        )}
        {status === 'date_reached' && (
          <div className="mt-4 rounded-xl bg-orange-50 p-4 dark:bg-orange-950/50">
            <p className="font-semibold">The target date has arrived.</p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">Complete the goal, or give it more time.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={buttonStyles.primary} onClick={() => setPendingAction('complete')}>
                Complete goal
              </button>
              <Link to={`/goals/${goal.goal_id}/edit`} className={buttonStyles.secondary}>
                Extend the date
              </Link>
            </div>
          </div>
        )}

        {!isLocked && (
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Per paycheck">
              <Money cents={stats.needed_per_paycheck} />
            </Stat>
            <Stat label="Paydays left">{stats.paydays_remaining}</Stat>
            <Stat label="Your pace">{stats.pace === null ? '—' : <Money cents={stats.pace} />}</Stat>
            <Stat label="Projected">
              {stats.projected_finish_date === null ? (
                <span className="text-sm font-medium text-stone-500">Not enough data yet</span>
              ) : (
                formatIsoDate(stats.projected_finish_date)
              )}
            </Stat>
          </dl>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {isLocked ? (
          <>
            <button type="button" className={buttonStyles.primary} onClick={() => setQuickAddType('withdrawal')}>
              Add withdrawal
            </button>
            <button type="button" className={buttonStyles.secondary} onClick={() => setPendingAction('reopen')}>
              Reopen
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${buttonStyles.primary} flex-1 sm:flex-none`}
              onClick={() => setQuickAddType('deposit')}
            >
              + Add deposit
            </button>
            <button type="button" className={buttonStyles.secondary} onClick={() => setQuickAddType('withdrawal')}>
              Add withdrawal
            </button>
            <Link to={`/goals/${goal.goal_id}/edit`} className={buttonStyles.secondary}>
              Edit
            </Link>
            {status !== 'amount_reached' && status !== 'date_reached' && (
              <button type="button" className={buttonStyles.ghost} onClick={() => setPendingAction('complete')}>
                Complete
              </button>
            )}
            <button type="button" className={buttonStyles.ghost} onClick={() => setPendingAction('cancel')}>
              Cancel goal
            </button>
          </>
        )}
      </div>

      <section className={cardStyles} aria-labelledby="recent-entries">
        <div className="flex items-center justify-between">
          <h2 id="recent-entries" className="font-semibold">
            Recent entries
          </h2>
          {entries.length > 0 && (
            <Link
              to={`/goals/${goal.goal_id}/entries`}
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-100"
            >
              See all ({entries.length})
            </Link>
          )}
        </div>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-stone-500 dark:text-stone-400">No entries yet. Add your first deposit.</p>
        ) : (
          <EntryList>
            {entries.slice(0, RECENT_ENTRY_COUNT).map((entry) => (
              <EntryRow key={entry.entry_id} entry={entry} />
            ))}
          </EntryList>
        )}
      </section>

      <Sheet
        isOpen={quickAddType !== null}
        title={quickAddType === 'withdrawal' ? 'Add withdrawal' : 'Add deposit'}
        onClose={() => setQuickAddType(null)}
      >
        {quickAddType !== null && (
          <EntryForm
            initialValues={{ type: quickAddType, amount: null, date: today, note: '' }}
            allowDeposit={!isLocked}
            balanceBefore={stats.balance}
            submitLabel="Save"
            onSubmit={handleQuickAdd}
          />
        )}
      </Sheet>

      <ConfirmSheet
        isOpen={pendingAction === 'complete'}
        title="Complete this goal?"
        confirmLabel="Complete"
        onConfirm={() => runGoalAction('complete')}
        onClose={() => setPendingAction(null)}
      >
        It locks the goal: no more deposits or edits. You can still record withdrawals, like the purchase, and you can
        reopen it later.
      </ConfirmSheet>
      <ConfirmSheet
        isOpen={pendingAction === 'cancel'}
        title="Cancel this goal?"
        confirmLabel="Cancel goal"
        tone="danger"
        onConfirm={() => runGoalAction('cancel')}
        onClose={() => setPendingAction(null)}
      >
        It locks the goal and frees up {bucket?.name ?? 'its bucket'}. Whatever is left stays there as seed money for
        the next goal. You can reopen it later.
      </ConfirmSheet>
      <ConfirmSheet
        isOpen={pendingAction === 'reopen'}
        title="Reopen this goal?"
        confirmLabel="Reopen"
        onConfirm={() => runGoalAction('reopen')}
        onClose={() => setPendingAction(null)}
      >
        It becomes active again and takes back {bucket?.name ?? 'its bucket'}.
      </ConfirmSheet>
    </div>
  )
}
