import { useEffect, useId, useRef, type ReactNode } from 'react'
import { formatCents } from '@goal-tracker/shared/money'
import type { Cents } from '@goal-tracker/shared/types'
import { describeError } from '../lib/api.ts'
import { STATUS_TEXT, type GoalStatusLabel } from '../lib/status.ts'

const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50'

export const buttonStyles = {
  primary: `${BUTTON_BASE} bg-brand-600 text-white hover:bg-brand-700`,
  secondary: `${BUTTON_BASE} border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800`,
  danger: `${BUTTON_BASE} border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-stone-900 dark:text-red-400 dark:hover:bg-red-950`,
  ghost: `${BUTTON_BASE} text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800`,
}

export const inputStyles =
  'block min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:outline-2 focus:outline-brand-600/30 disabled:bg-stone-100 disabled:text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:disabled:bg-stone-800'

export const cardStyles =
  'rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5'

export function Money({ cents, className }: { cents: Cents; className?: string }) {
  return <span className={`tabular-nums ${className ?? ''}`}>{formatCents(cents)}</span>
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">{label}</span>
      {children}
      {hint !== undefined && <span className="mt-1.5 block text-sm text-stone-500 dark:text-stone-400">{hint}</span>}
    </label>
  )
}

export function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const percent = Math.min(Math.max(progress, 0), 1) * 100
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

const BADGE_TONES: Record<GoalStatusLabel, string> = {
  on_track: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  behind: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  amount_reached: 'bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100',
  date_reached: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  completed: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  cancelled: 'bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
}

export function StatusBadge({ status }: { status: GoalStatusLabel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[status]}`}
    >
      {STATUS_TEXT[status]}
    </span>
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-16" role="status">
      <span className="text-stone-500">Loading…</span>
    </div>
  )
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className={`${cardStyles} mx-auto my-8 max-w-md text-center`} role="alert">
      <p className="text-stone-700 dark:text-stone-300">{describeError(error)}</p>
      {onRetry !== undefined && (
        <button type="button" className={`${buttonStyles.secondary} mt-4`} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (message === null) return null
  return (
    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-300" role="alert">
      {message}
    </p>
  )
}

// A bottom sheet on phones and a centered dialog on wider screens, built on the native <dialog>.
export function Sheet({
  isOpen,
  title,
  onClose,
  children,
}: {
  isOpen: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (isOpen && !dialog.open) dialog.showModal()
    if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-white p-0 text-stone-900 shadow-xl sm:m-auto sm:max-w-md sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      {isOpen && (
        <div className="p-5 pb-8 sm:pb-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button type="button" className={buttonStyles.ghost} onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
