import { useCallback, useState, type SubmitEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { GoalDetail, Leftover, UpdateGoalRequest } from '@goal-tracker/shared/api'
import { formatCents, parseDollarsToCents } from '@goal-tracker/shared/money'
import type { Bucket, LinkedItem } from '@goal-tracker/shared/types'
import {
  ErrorPanel,
  Field,
  FormError,
  Loading,
  Money,
  buttonStyles,
  cardStyles,
  inputStyles,
} from '../components/ui.tsx'
import { useLoader } from '../hooks/useLoader.ts'
import { api, describeError } from '../lib/api.ts'
import { findTodayInTimezone, formatIsoDate } from '../lib/dates.ts'
import { useSettings } from '../settings-context.ts'

interface FormData {
  goal: GoalDetail['goal'] | null
  buckets: Bucket[]
}

function readLinkedItem(label: string, url: string, existing: LinkedItem | undefined): LinkedItem | null | string {
  const trimmedLabel = label.trim()
  const trimmedUrl = url.trim()
  if (trimmedLabel === '' && trimmedUrl === '') return null
  if (trimmedLabel === '' || trimmedUrl === '')
    return 'Give the linked item both a name and a link, or leave both empty.'
  if (!/^https?:\/\/\S+$/i.test(trimmedUrl)) return 'The link must start with http:// or https://.'
  // linked_item is replaced whole, so keep an existing price watch link.
  return existing?.price_watch_id === undefined
    ? { label: trimmedLabel, url: trimmedUrl }
    : { label: trimmedLabel, url: trimmedUrl, price_watch_id: existing.price_watch_id }
}

export function GoalFormPage() {
  const { goalId } = useParams()
  const load = useCallback(async (): Promise<FormData> => {
    const [goalDetail, buckets] = await Promise.all([
      goalId === undefined ? Promise.resolve(null) : api.getGoal(goalId),
      api.listBuckets(),
    ])
    return { goal: goalDetail?.goal ?? null, buckets }
  }, [goalId])
  const { state, reload } = useLoader(load)

  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') return <ErrorPanel error={state.error} onRetry={reload} />
  return <GoalForm key={goalId ?? 'new'} goal={state.data.goal} buckets={state.data.buckets} />
}

function GoalForm({ goal, buckets }: FormData) {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const isEditing = goal !== null
  const availableBuckets = buckets.filter((bucket) => bucket.status === 'available')

  const [name, setName] = useState(goal?.name ?? '')
  const [targetText, setTargetText] = useState(goal === null ? '' : formatCents(goal.target_amount))
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '')
  const [bucketId, setBucketId] = useState('')
  const [leftover, setLeftover] = useState<Leftover | null>(null)
  const [openingText, setOpeningText] = useState('')
  const [linkLabel, setLinkLabel] = useState(goal?.linked_item?.label ?? '')
  const [linkUrl, setLinkUrl] = useState(goal?.linked_item?.url ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleBucketChange(nextBucketId: string) {
    setBucketId(nextBucketId)
    setLeftover(null)
    setOpeningText('')
    if (nextBucketId === '') return
    try {
      const nextLeftover = await api.getLeftover(nextBucketId)
      setLeftover(nextLeftover)
      if (nextLeftover.amount > 0) setOpeningText(formatCents(nextLeftover.amount))
    } catch (error) {
      setErrorMessage(describeError(error))
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const targetAmount = parseDollarsToCents(targetText.trim())
    const linkedItem = readLinkedItem(linkLabel, linkUrl, goal?.linked_item)
    if (name.trim() === '') {
      setErrorMessage('Give the goal a name.')
      return
    }
    if (targetAmount === null || targetAmount < 1) {
      setErrorMessage('Enter a target amount like 1999 or 1,999.00.')
      return
    }
    if (targetDate === '') {
      setErrorMessage('Pick a target date.')
      return
    }
    if (typeof linkedItem === 'string') {
      setErrorMessage(linkedItem)
      return
    }
    // The opening balance is fixed after creation, so only a new goal reads it.
    const openingBalance = isEditing || openingText.trim() === '' ? 0 : parseDollarsToCents(openingText.trim())
    if (!isEditing && bucketId === '') {
      setErrorMessage('Pick a bucket for this goal.')
      return
    }
    if (openingBalance === null) {
      setErrorMessage('Enter the amount already saved like 42 or 42.00.')
      return
    }

    setErrorMessage(null)
    setIsSaving(true)
    try {
      if (isEditing) {
        const changes: UpdateGoalRequest = { name: name.trim(), target_amount: targetAmount, target_date: targetDate }
        if (linkedItem !== null) changes.linked_item = linkedItem
        else if (goal.linked_item !== undefined) changes.linked_item = null
        await api.updateGoal(goal.goal_id, changes)
        void navigate(`/goals/${goal.goal_id}`)
        return
      }
      const created = await api.createGoal({
        bucket_id: bucketId,
        name: name.trim(),
        target_amount: targetAmount,
        target_date: targetDate,
        start_date: findTodayInTimezone(settings.timezone),
        opening_balance: openingBalance,
        ...(linkedItem === null ? {} : { linked_item: linkedItem }),
      })
      void navigate(`/goals/${created.goal.goal_id}`)
    } catch (error) {
      setErrorMessage(describeError(error))
      setIsSaving(false)
    }
  }

  if (isEditing && goal.status !== 'active') {
    return (
      <div className={`${cardStyles} mx-auto max-w-md text-center`}>
        <p>This goal is {goal.status}, so it can't be edited. Reopen it first.</p>
        <Link to={`/goals/${goal.goal_id}`} className={`${buttonStyles.secondary} mt-4`}>
          Back to the goal
        </Link>
      </div>
    )
  }

  const goalBucketName = buckets.find((bucket) => bucket.bucket_id === goal?.bucket_id)?.name

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          to={isEditing ? `/goals/${goal.goal_id}` : '/'}
          className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-100"
        >
          ‹ {isEditing ? goal.name : 'All goals'}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{isEditing ? 'Edit goal' : 'New goal'}</h1>
      </div>

      {!isEditing && availableBuckets.length === 0 ? (
        <div className={`${cardStyles} text-center`}>
          <p className="font-medium">Every bucket already holds a goal.</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Add a savings account as a new bucket, or finish a goal to free one up.
          </p>
          <Link to="/buckets" className={`${buttonStyles.primary} mt-4`}>
            Go to buckets
          </Link>
        </div>
      ) : (
        <form className={`${cardStyles} space-y-4`} onSubmit={(event) => void handleSubmit(event)} noValidate>
          <Field label="What are you saving for?">
            <input
              className={inputStyles}
              maxLength={100}
              placeholder="Mac mini"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target amount">
              <input
                className={`${inputStyles} tabular-nums`}
                inputMode="decimal"
                placeholder="$1,999.00"
                value={targetText}
                onChange={(event) => setTargetText(event.target.value)}
              />
            </Field>
            <Field label="Target date">
              <input
                className={inputStyles}
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </Field>
          </div>

          {isEditing ? (
            <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600 dark:bg-stone-950 dark:text-stone-400">
              <p>
                Bucket: <span className="font-medium text-stone-800 dark:text-stone-200">{goalBucketName}</span>
              </p>
              <p className="mt-1">
                Opening balance:{' '}
                <Money cents={goal.opening_balance} className="font-medium text-stone-800 dark:text-stone-200" /> ·
                started {formatIsoDate(goal.start_date)}
              </p>
              <p className="mt-1">These are fixed. Fix a wrong opening balance with a deposit or withdrawal.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bucket">
                <select
                  className={inputStyles}
                  value={bucketId}
                  onChange={(event) => void handleBucketChange(event.target.value)}
                >
                  <option value="">Choose a savings account</option>
                  {availableBuckets.map((bucket) => (
                    <option key={bucket.bucket_id} value={bucket.bucket_id}>
                      {bucket.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Already saved"
                hint={
                  leftover !== null && leftover.amount > 0
                    ? `${formatCents(leftover.amount)} left from ${leftover.from_goal_name ?? 'the last goal'}`
                    : undefined
                }
              >
                <input
                  className={`${inputStyles} tabular-nums`}
                  inputMode="decimal"
                  placeholder="$0.00"
                  value={openingText}
                  onChange={(event) => setOpeningText(event.target.value)}
                />
              </Field>
            </div>
          )}

          <fieldset className="space-y-3 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
            <legend className="px-1 text-sm font-medium text-stone-700 dark:text-stone-300">
              Linked item (optional)
            </legend>
            <Field label="Name">
              <input
                className={inputStyles}
                maxLength={100}
                placeholder="Mac mini M6 (32GB/512GB)"
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
              />
            </Field>
            <Field label="Link">
              <input
                className={inputStyles}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
            </Field>
          </fieldset>

          <FormError message={errorMessage} />
          <button type="submit" className={`${buttonStyles.primary} w-full`} disabled={isSaving}>
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create goal'}
          </button>
        </form>
      )}
    </div>
  )
}
