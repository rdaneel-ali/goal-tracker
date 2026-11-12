import { useState, type SubmitEvent } from 'react'
import { isWithdrawalOverBalance } from '@goal-tracker/shared/balance'
import { formatCents, parseDollarsToCents } from '@goal-tracker/shared/money'
import type { Cents, EntryType, IsoDate } from '@goal-tracker/shared/types'
import { describeError } from '../lib/api.ts'
import { Field, FormError, buttonStyles, inputStyles } from './ui.tsx'

export interface EntryFormValues {
  type: EntryType
  amount: Cents
  date: IsoDate
  note: string
}

interface EntryFormProps {
  initialValues: { type: EntryType; amount: Cents | null; date: IsoDate; note: string }
  allowDeposit: boolean
  // The goal's balance without this entry, so an edited withdrawal is checked against the right number.
  balanceBefore: Cents
  submitLabel: string
  onSubmit: (values: EntryFormValues) => Promise<void>
}

const TYPE_OPTIONS: { type: EntryType; label: string }[] = [
  { type: 'deposit', label: 'Deposit' },
  { type: 'withdrawal', label: 'Withdrawal' },
]

export function EntryForm({ initialValues, allowDeposit, balanceBefore, submitLabel, onSubmit }: EntryFormProps) {
  const [type, setType] = useState<EntryType>(allowDeposit ? initialValues.type : 'withdrawal')
  const [amountText, setAmountText] = useState(initialValues.amount === null ? '' : formatCents(initialValues.amount))
  const [date, setDate] = useState(initialValues.date)
  const [note, setNote] = useState(initialValues.note)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const amount = parseDollarsToCents(amountText.trim())
  const isOverBalance = type === 'withdrawal' && amount !== null && isWithdrawalOverBalance(amount, balanceBefore)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (amount === null || amount < 1) {
      setErrorMessage('Enter an amount like 110 or 110.50.')
      return
    }
    if (date === '') {
      setErrorMessage('Pick a date.')
      return
    }
    setErrorMessage(null)
    setIsSaving(true)
    try {
      await onSubmit({ type, amount, date, note: note.trim() })
    } catch (error) {
      setErrorMessage(describeError(error))
      setIsSaving(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div
        className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800"
        role="radiogroup"
        aria-label="Type"
      >
        {TYPE_OPTIONS.map((option) => {
          const isSelected = type === option.type
          const isDisabled = option.type === 'deposit' && !allowDeposit
          return (
            <button
              key={option.type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isDisabled}
              onClick={() => setType(option.type)}
              className={`min-h-10 rounded-lg text-sm font-semibold transition disabled:opacity-40 ${
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

      <Field label="Amount">
        <input
          className={`${inputStyles} text-2xl font-semibold tabular-nums`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="$0.00"
          autoFocus
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input className={inputStyles} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="Note">
          <input
            className={inputStyles}
            placeholder="Optional"
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>

      {isOverBalance && (
        <p
          className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          role="alert"
        >
          This is more than the {formatCents(balanceBefore)} saved. The balance will go below zero.
        </p>
      )}
      <FormError message={errorMessage} />

      <button type="submit" className={`${buttonStyles.primary} w-full`} disabled={isSaving}>
        {isSaving ? 'Saving…' : isOverBalance ? 'Save anyway' : submitLabel}
      </button>
    </form>
  )
}
