import type { ExportResponse } from '@goal-tracker/shared/api'
import type { RouteHandler } from '../context.ts'

// Everything the user owns. Settings are null before first-run setup, and the export doesn't need them.
export const exportAll: RouteHandler = async (ctx) => {
  const { repo } = ctx.deps
  const [settings, buckets, goals, entries] = await Promise.all([
    repo.getSettings(ctx.userId),
    repo.listBuckets(ctx.userId),
    repo.listGoals(ctx.userId),
    repo.listAllEntries(ctx.userId),
  ])
  const body: ExportResponse = { settings, buckets, goals, entries }
  return { status: 200, body }
}
