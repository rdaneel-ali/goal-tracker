import type { GoalStats, GoalView } from '@goal-tracker/shared/api'
import { calculateProgress, calculateBalance, calculateRemaining } from '@goal-tracker/shared/balance'
import { isAmountReached, isDateReached } from '@goal-tracker/shared/lifecycle'
import { countPaydaysElapsed, countPaydaysRemaining } from '@goal-tracker/shared/paydays'
import {
  calculateNeededPerPaycheck,
  calculatePace,
  findProjectedFinishDate,
  isOnTrack,
} from '@goal-tracker/shared/projection'
import type { Entry, Goal, IsoDate, Settings } from '@goal-tracker/shared/types'

// `entries` must be the goal's own entries. Nothing is stored: every number is derived on each request.
export function buildGoalView(goal: Goal, entries: readonly Entry[], settings: Settings, today: IsoDate): GoalView {
  const balance = calculateBalance(goal, entries)
  const paydaysRemaining = countPaydaysRemaining(settings.anchor_payday, today, goal.target_date)
  const paydaysElapsed = countPaydaysElapsed(settings.anchor_payday, goal.start_date, today)
  const pace = calculatePace(balance, goal.opening_balance, paydaysElapsed)
  const projectedFinishDate = findProjectedFinishDate(settings.anchor_payday, today, goal.target_amount, balance, pace)
  const stats: GoalStats = {
    balance,
    remaining: calculateRemaining(goal.target_amount, balance),
    progress: calculateProgress(balance, goal.target_amount),
    paydays_remaining: paydaysRemaining,
    paydays_elapsed: paydaysElapsed,
    pace,
    needed_per_paycheck: calculateNeededPerPaycheck(goal.target_amount, balance, paydaysRemaining),
    projected_finish_date: projectedFinishDate,
    is_on_track: isOnTrack(projectedFinishDate, goal.target_date),
    is_amount_reached: isAmountReached(goal, balance),
    is_date_reached: isDateReached(goal, today),
  }
  return { goal, stats }
}
