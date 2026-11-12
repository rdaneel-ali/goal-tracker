import type { Settings } from '@goal-tracker/shared/types'
import type { RouteHandler } from '../context.ts'
import { HttpError } from '../errors.ts'
import { parsePutSettings } from '../validation.ts'

export const getSettings: RouteHandler = async (ctx) => {
  const settings = await ctx.deps.repo.getSettings(ctx.userId)
  if (settings === null) throw new HttpError(404, 'settings_not_found', 'Settings have not been set up yet.')
  return { status: 200, body: settings }
}

export const putSettings: RouteHandler = async (ctx) => {
  const request = parsePutSettings(ctx.body)
  const settings: Settings = {
    user_id: ctx.userId,
    pay_cadence: 'biweekly',
    anchor_payday: request.anchor_payday,
    timezone: request.timezone,
    currency: 'USD',
  }
  await ctx.deps.repo.putSettings(settings)
  return { status: 200, body: settings }
}
