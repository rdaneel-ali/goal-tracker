import type { GoalView } from '@goal-tracker/shared/api'

export type GoalStatusLabel = 'completed' | 'cancelled' | 'amount_reached' | 'date_reached' | 'on_track' | 'behind'

// Order matters (handoff, web rules): a funded goal past its date is not on track,
// so amount reached is checked before the on-track badge.
export function selectGoalStatus({ goal, stats }: GoalView): GoalStatusLabel {
  if (goal.status === 'completed') return 'completed'
  if (goal.status === 'cancelled') return 'cancelled'
  if (stats.is_amount_reached) return 'amount_reached'
  if (stats.is_date_reached) return 'date_reached'
  return stats.is_on_track ? 'on_track' : 'behind'
}

export const STATUS_TEXT: Record<GoalStatusLabel, string> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  amount_reached: 'Target reached',
  date_reached: 'Target date reached',
  on_track: 'On track',
  behind: 'Behind',
}

export function formatProgressPercent(progress: number): string {
  return `${Math.floor(progress * 100)}%`
}
