import type { Leftover } from '@goal-tracker/shared/api'
import { calculateBalance } from '@goal-tracker/shared/balance'
import { calculateSeedMoney, isGoalLocked } from '@goal-tracker/shared/lifecycle'
import type { Cents, Goal } from '@goal-tracker/shared/types'
import type { RequestContext } from '../context.ts'

export interface LeftoverResult {
  summary: Leftover
  // Set only when the amount is above 0: the goal the money is left over from, and its full balance.
  previousGoal: Goal | null
  previousBalance: Cents
}

function compareMostRecentFirst(a: Goal, b: Goal): number {
  return (
    b.updated_at.localeCompare(a.updated_at) ||
    b.created_at.localeCompare(a.created_at) ||
    b.goal_id.localeCompare(a.goal_id)
  )
}

// Leftover is whatever the bucket's most recent completed or cancelled goal still holds.
export async function findLeftover(ctx: RequestContext, bucketId: string): Promise<LeftoverResult> {
  const goals = await ctx.deps.repo.listGoals(ctx.userId)
  const [previousGoal] = goals
    .filter((goal) => goal.bucket_id === bucketId && isGoalLocked(goal))
    .sort(compareMostRecentFirst)
  const none: LeftoverResult = {
    summary: { amount: 0, from_goal_id: null, from_goal_name: null },
    previousGoal: null,
    previousBalance: 0,
  }
  if (previousGoal === undefined) return none
  const entries = await ctx.deps.repo.listGoalEntries(ctx.userId, previousGoal.goal_id)
  const previousBalance = calculateBalance(previousGoal, entries)
  const amount = calculateSeedMoney(previousBalance)
  if (amount === 0) return none
  return {
    summary: { amount, from_goal_id: previousGoal.goal_id, from_goal_name: previousGoal.name },
    previousGoal,
    previousBalance,
  }
}
