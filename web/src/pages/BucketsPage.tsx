import { useState, type SubmitEvent } from 'react'
import { Link } from 'react-router'
import type { GoalView } from '@goal-tracker/shared/api'
import type { Bucket, BucketStatus } from '@goal-tracker/shared/types'
import { ConfirmSheet } from '../components/ConfirmSheet.tsx'
import {
  ErrorPanel,
  Field,
  FormError,
  Loading,
  Sheet,
  buttonStyles,
  cardStyles,
  inputStyles,
} from '../components/ui.tsx'
import { useLoader } from '../hooks/useLoader.ts'
import { api, describeError } from '../lib/api.ts'

const STATUS_TEXT: Record<BucketStatus, string> = {
  available: 'Available',
  in_use: 'In use',
  retired: 'Retired',
}

const STATUS_ORDER: Record<BucketStatus, number> = { in_use: 0, available: 1, retired: 2 }

async function loadBucketsAndGoals(): Promise<{ buckets: Bucket[]; goals: GoalView[] }> {
  const [buckets, goals] = await Promise.all([api.listBuckets(), api.listGoals()])
  return { buckets, goals }
}

function BucketForm({
  bucket,
  submitLabel,
  onSaved,
}: {
  bucket: Bucket | null
  submitLabel: string
  onSaved: () => void
}) {
  const [name, setName] = useState(bucket?.name ?? '')
  const [institution, setInstitution] = useState(bucket?.institution ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedInstitution = institution.trim()
    if (trimmedName === '') {
      setErrorMessage('Give the bucket a name.')
      return
    }
    setErrorMessage(null)
    setIsSaving(true)
    try {
      if (bucket === null) {
        await api.createBucket({
          name: trimmedName,
          ...(trimmedInstitution === '' ? {} : { institution: trimmedInstitution }),
        })
      } else {
        await api.updateBucket(bucket.bucket_id, {
          name: trimmedName,
          institution: trimmedInstitution === '' ? null : trimmedInstitution,
        })
      }
      onSaved()
    } catch (error) {
      setErrorMessage(describeError(error))
      setIsSaving(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <Field label="Name">
        <input
          className={inputStyles}
          maxLength={100}
          placeholder="Ally savings"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Bank (optional)">
        <input
          className={inputStyles}
          maxLength={100}
          placeholder="Ally Bank"
          value={institution}
          onChange={(event) => setInstitution(event.target.value)}
        />
      </Field>
      <FormError message={errorMessage} />
      <button type="submit" className={`${buttonStyles.primary} w-full`} disabled={isSaving}>
        {isSaving ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}

export function BucketsPage() {
  const { state, reload } = useLoader(loadBucketsAndGoals)
  const [isAdding, setIsAdding] = useState(false)
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const [retiringBucket, setRetiringBucket] = useState<Bucket | null>(null)

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorPanel error={state.error} onRetry={reload} />

  const activeGoalByBucket = new Map(
    state.data.goals.filter((view) => view.goal.status === 'active').map((view) => [view.goal.bucket_id, view.goal]),
  )
  const buckets = [...state.data.buckets].sort(
    (first, second) =>
      STATUS_ORDER[first.status] - STATUS_ORDER[second.status] || first.name.localeCompare(second.name),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Buckets</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Savings accounts. Each holds one goal at a time.</p>
        </div>
        <button type="button" className={buttonStyles.primary} onClick={() => setIsAdding(true)}>
          Add bucket
        </button>
      </div>

      {buckets.length === 0 ? (
        <div className={`${cardStyles} text-center`}>
          <p className="font-medium">No buckets yet.</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Add the savings account you'll use for your first goal.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {buckets.map((bucket) => {
            const activeGoal = activeGoalByBucket.get(bucket.bucket_id)
            const isRetired = bucket.status === 'retired'
            return (
              <li key={bucket.bucket_id} className={`${cardStyles} ${isRetired ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{bucket.name}</p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      {STATUS_TEXT[bucket.status]}
                      {bucket.institution !== undefined && ` · ${bucket.institution}`}
                      {activeGoal !== undefined && (
                        <>
                          {' · '}
                          <Link
                            to={`/goals/${activeGoal.goal_id}`}
                            className="text-brand-700 hover:underline dark:text-brand-100"
                          >
                            {activeGoal.name}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  {!isRetired && (
                    <div className="flex gap-1">
                      <button type="button" className={buttonStyles.ghost} onClick={() => setEditingBucket(bucket)}>
                        Rename
                      </button>
                      {bucket.status === 'available' && (
                        <button type="button" className={buttonStyles.ghost} onClick={() => setRetiringBucket(bucket)}>
                          Retire
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Sheet isOpen={isAdding} title="Add bucket" onClose={() => setIsAdding(false)}>
        {isAdding && (
          <BucketForm
            bucket={null}
            submitLabel="Add bucket"
            onSaved={() => {
              setIsAdding(false)
              reload()
            }}
          />
        )}
      </Sheet>
      <Sheet isOpen={editingBucket !== null} title="Rename bucket" onClose={() => setEditingBucket(null)}>
        {editingBucket !== null && (
          <BucketForm
            bucket={editingBucket}
            submitLabel="Save"
            onSaved={() => {
              setEditingBucket(null)
              reload()
            }}
          />
        )}
      </Sheet>
      <ConfirmSheet
        isOpen={retiringBucket !== null}
        title="Retire this bucket?"
        confirmLabel="Retire"
        tone="danger"
        onConfirm={async () => {
          if (retiringBucket === null) return
          await api.retireBucket(retiringBucket.bucket_id)
          setRetiringBucket(null)
          reload()
        }}
        onClose={() => setRetiringBucket(null)}
      >
        {retiringBucket?.name} won't be offered for new goals any more. Its past goals stay as they are.
      </ConfirmSheet>
    </div>
  )
}
