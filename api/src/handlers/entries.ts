import { canAddEntry } from '@goal-tracker/shared/lifecycle'
import type { Entry } from '@goal-tracker/shared/types'
import { commitOrConflict, param, requireGoal } from '../context.ts'
import type { RequestContext, RouteHandler } from '../context.ts'
import { conflict, notFound } from '../errors.ts'
import { applyChanges } from '../patch.ts'
import { checkOperation, deleteOperation, entryKey, goalKey, putOperation } from '../repository.ts'
import type { WriteOperation } from '../store.ts'
import { formatTimestamp } from '../time.ts'
import { parseCreateEntry, parseUpdateEntry } from '../validation.ts'

const LOCKED_MESSAGE = 'This goal is completed or cancelled, so it accepts only withdrawals.'
const CARRYOVER_MESSAGE = 'A carryover entry is read-only. It moves with the bucket leftover.'

// Writes that add a deposit to a locked goal are caught here even if the goal was completed
// after it was read, because the transaction re-checks the goal's status.
function requireGoalActive(ctx: RequestContext, goalId: string): WriteOperation {
  return checkOperation(goalKey(ctx.userId, goalId), { type: 'status_is', status: 'active' })
}

async function requireEntry(ctx: RequestContext, goalId: string, entryId: string): Promise<Entry> {
  const entries = await ctx.deps.repo.listGoalEntries(ctx.userId, goalId)
  const entry = entries.find((candidate) => candidate.entry_id === entryId)
  if (entry === undefined) throw notFound('Entry not found.')
  if (entry.source === 'carryover') throw conflict('carryover_read_only', CARRYOVER_MESSAGE)
  return entry
}

export const createEntry: RouteHandler = async (ctx) => {
  const request = parseCreateEntry(ctx.body)
  const goal = await requireGoal(ctx, param(ctx, 'goal_id'))
  if (!canAddEntry(goal, request.type)) throw conflict('goal_locked', LOCKED_MESSAGE)
  const timestamp = formatTimestamp(ctx.now)
  const entry: Entry = {
    entry_id: ctx.deps.newId(),
    user_id: ctx.userId,
    goal_id: goal.goal_id,
    type: request.type,
    amount: request.amount,
    date: request.date,
    source: 'manual',
    created_at: timestamp,
    updated_at: timestamp,
  }
  if (request.note !== undefined) entry.note = request.note
  const operations: WriteOperation[] = [putOperation(entryKey(entry), entry, { type: 'not_exists' })]
  if (entry.type === 'deposit') operations.unshift(requireGoalActive(ctx, goal.goal_id))
  await commitOrConflict(ctx, operations, () => conflict('goal_locked', LOCKED_MESSAGE))
  return { status: 201, body: entry }
}

export const updateEntry: RouteHandler = async (ctx) => {
  const changes = parseUpdateEntry(ctx.body)
  const goal = await requireGoal(ctx, param(ctx, 'goal_id'))
  const entry = await requireEntry(ctx, goal.goal_id, param(ctx, 'entry_id'))
  const updated = applyChanges(entry, { ...changes, updated_at: formatTimestamp(ctx.now) })

  // A locked goal accepts no new deposits, so an entry can't be turned into one.
  const becomesDeposit = updated.type === 'deposit' && entry.type !== 'deposit'
  if (becomesDeposit && !canAddEntry(goal, 'deposit')) throw conflict('goal_locked', LOCKED_MESSAGE)

  // The date is part of the sort key, so a date change moves the item: delete the old key, put the new one.
  const operations: WriteOperation[] =
    updated.date === entry.date
      ? [putOperation(entryKey(updated), updated, { type: 'exists' })]
      : [
          deleteOperation(entryKey(entry), { type: 'exists' }),
          putOperation(entryKey(updated), updated, { type: 'not_exists' }),
        ]
  if (becomesDeposit) operations.unshift(requireGoalActive(ctx, goal.goal_id))
  await commitOrConflict(ctx, operations, (operationIndex) =>
    becomesDeposit && operationIndex === 0 ? conflict('goal_locked', LOCKED_MESSAGE) : notFound('Entry not found.'),
  )
  return { status: 200, body: updated }
}

export const deleteEntry: RouteHandler = async (ctx) => {
  const goal = await requireGoal(ctx, param(ctx, 'goal_id'))
  const entry = await requireEntry(ctx, goal.goal_id, param(ctx, 'entry_id'))
  await commitOrConflict(ctx, [deleteOperation(entryKey(entry), { type: 'exists' })], () =>
    notFound('Entry not found.'),
  )
  return { status: 204 }
}
