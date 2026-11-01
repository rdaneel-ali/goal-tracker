import type { Cents } from './types.ts'

const CENTS_PER_DOLLAR = 100
const DOLLARS_PATTERN = /^\$?(0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.(\d{1,2}))?$/
const USD_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// The number overload stops a failed check from narrowing the caller's number to never.
export function isCents(value: number): boolean
export function isCents(value: unknown): value is Cents
export function isCents(value: unknown): boolean {
  return Number.isSafeInteger(value)
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
  if (!isCents(cents)) throw new RangeError(`Invalid cents: ${cents}`)
  // A decimal string formats exactly, where cents / 100 would pass through a float.
  return USD_FORMATTER.format(`${cents}e-2` as Intl.StringNumericLiteral)
}
