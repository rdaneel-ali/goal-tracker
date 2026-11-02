import type { Cents } from './types.ts'

// `value is Cents` would narrow a failed check's number to never, so the guard targets this private type.
type ValidCents = Cents & { readonly __valid: true }

const CENTS_PER_DOLLAR = 100
const DOLLARS_PATTERN = /^\$?(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.(\d{1,2}))?$/
const USD_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function isCents(value: unknown): value is ValidCents {
  return Number.isSafeInteger(value)
}

export function assertCents(value: Cents, label: string, minimum: Cents = Number.MIN_SAFE_INTEGER): void {
  if (!isCents(value) || value < minimum) throw new RangeError(`Invalid ${label}: ${value}`)
}

export function parseDollarsToCents(text: string): Cents | null {
  const match = DOLLARS_PATTERN.exec(text)
  if (match === null) return null
  const [, wholeText = '', fractionText = ''] = match
  const wholeDollars = Number(wholeText.replaceAll(',', ''))
  const fractionCents = Number(fractionText.padEnd(2, '0'))
  const totalCents = wholeDollars * CENTS_PER_DOLLAR + fractionCents
  return isCents(totalCents) ? totalCents : null
}

export function formatCents(cents: Cents): string {
  assertCents(cents, 'cents')
  // A decimal string formats exactly, where cents / 100 would pass through a float.
  return USD_FORMATTER.format(`${cents}e-2` as Intl.StringNumericLiteral)
}
