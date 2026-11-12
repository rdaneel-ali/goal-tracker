import { Link } from 'react-router'
import type { GoalView } from '@goal-tracker/shared/api'
import type { Bucket } from '@goal-tracker/shared/types'
import { ErrorPanel, Loading, Money, ProgressBar, StatusBadge, buttonStyles, cardStyles } from '../components/ui.tsx'
import { useLoader } from '../hooks/useLoader.ts'
import { api } from '../lib/api.ts'
import { formatIsoDate } from '../lib/dates.ts'
import { formatProgressPercent, selectGoalStatus } from '../lib/status.ts'

function GoalCard({ view, bucketName }: { view: GoalView; bucketName: string }) {
  const { goal, stats } = view
  return (
    <Link
      to={`/goals/${goal.goal_id}`}
      className={`${cardStyles} block transition hover:border-brand-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold">{goal.name}</h3>
          <p className="truncate text-sm text-stone-500 dark:text-stone-400">{bucketName}</p>
        </div>
        <StatusBadge status={selectGoalStatus(view)} />
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <p>
          <Money cents={stats.balance} className="text-2xl font-bold" />
          <span className="text-stone-500 dark:text-stone-400">
            {' '}
            of <Money cents={goal.target_amount} />
          </span>
        </p>
        <span className="text-sm font-semibold text-brand-700 dark:text-brand-100">
          {formatProgressPercent(stats.progress)}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar progress={stats.progress} label={`${goal.name} progress`} />
      </div>
      {goal.status === 'active' && (
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
          {stats.projected_finish_date === null
            ? 'Projected finish: not enough data yet'
            : `Projected finish ${formatIsoDate(stats.projected_finish_date)}`}
          <span className="text-stone-400"> · target {formatIsoDate(goal.target_date)}</span>
        </p>
      )}
    </Link>
  )
}

async function loadGoalsAndBuckets(): Promise<{ goals: GoalView[]; buckets: Bucket[] }> {
  const [goals, buckets] = await Promise.all([api.listGoals(), api.listBuckets()])
  return { goals, buckets }
}

export function GoalsPage() {
  const { state, reload } = useLoader(loadGoalsAndBuckets)

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorPanel error={state.error} onRetry={reload} />

  const bucketNames = new Map(state.data.buckets.map((bucket) => [bucket.bucket_id, bucket.name]))
  const activeGoals = state.data.goals.filter((view) => view.goal.status === 'active')
  const finishedGoals = state.data.goals
    .filter((view) => view.goal.status !== 'active')
    .sort((first, second) => second.goal.updated_at.localeCompare(first.goal.updated_at))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Your goals</h1>
        <Link to="/goals/new" className={buttonStyles.primary}>
          New goal
        </Link>
      </div>

      {activeGoals.length === 0 ? (
        <div className={`${cardStyles} text-center`}>
          <p className="font-medium">No active goals yet.</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Pick something to save for, and the app works out what to put away each paycheck.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {activeGoals.map((view) => (
            <GoalCard key={view.goal.goal_id} view={view} bucketName={bucketNames.get(view.goal.bucket_id) ?? ''} />
          ))}
        </div>
      )}

      {finishedGoals.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-stone-600 dark:text-stone-400">
            <span className="inline-block transition group-open:rotate-90">›</span> Completed and cancelled (
            {finishedGoals.length})
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {finishedGoals.map((view) => (
              <GoalCard key={view.goal.goal_id} view={view} bucketName={bucketNames.get(view.goal.bucket_id) ?? ''} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
