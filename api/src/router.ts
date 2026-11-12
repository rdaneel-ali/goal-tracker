import type { RouteHandler } from './context.ts'
import { notFound } from './errors.ts'
import { createBucket, getBucketLeftover, listBuckets, retireBucket, updateBucket } from './handlers/buckets.ts'
import { createEntry, deleteEntry, updateEntry } from './handlers/entries.ts'
import { exportAll } from './handlers/export.ts'
import {
  cancelGoalHandler,
  completeGoalHandler,
  createGoal,
  getGoal,
  listGoals,
  reopenGoalHandler,
  updateGoal,
} from './handlers/goals.ts'
import { getSettings, putSettings } from './handlers/settings.ts'
import { parseId } from './validation.ts'

interface Route {
  method: string
  pattern: string
  handler: RouteHandler
}

export interface RouteMatch {
  handler: RouteHandler
  params: Record<string, string>
}

// Paths keep the /api prefix: CloudFront forwards them to API Gateway unchanged.
const ROUTES: readonly Route[] = [
  { method: 'GET', pattern: '/api/settings', handler: getSettings },
  { method: 'PUT', pattern: '/api/settings', handler: putSettings },
  { method: 'GET', pattern: '/api/buckets', handler: listBuckets },
  { method: 'POST', pattern: '/api/buckets', handler: createBucket },
  { method: 'PATCH', pattern: '/api/buckets/:bucket_id', handler: updateBucket },
  { method: 'POST', pattern: '/api/buckets/:bucket_id/retire', handler: retireBucket },
  { method: 'GET', pattern: '/api/buckets/:bucket_id/leftover', handler: getBucketLeftover },
  { method: 'GET', pattern: '/api/goals', handler: listGoals },
  { method: 'POST', pattern: '/api/goals', handler: createGoal },
  { method: 'GET', pattern: '/api/goals/:goal_id', handler: getGoal },
  { method: 'PATCH', pattern: '/api/goals/:goal_id', handler: updateGoal },
  { method: 'POST', pattern: '/api/goals/:goal_id/complete', handler: completeGoalHandler },
  { method: 'POST', pattern: '/api/goals/:goal_id/cancel', handler: cancelGoalHandler },
  { method: 'POST', pattern: '/api/goals/:goal_id/reopen', handler: reopenGoalHandler },
  { method: 'POST', pattern: '/api/goals/:goal_id/entries', handler: createEntry },
  { method: 'PATCH', pattern: '/api/goals/:goal_id/entries/:entry_id', handler: updateEntry },
  { method: 'DELETE', pattern: '/api/goals/:goal_id/entries/:entry_id', handler: deleteEntry },
  { method: 'GET', pattern: '/api/export', handler: exportAll },
]

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '')
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternSegments = splitPath(pattern)
  const pathSegments = splitPath(path)
  if (patternSegments.length !== pathSegments.length) return null
  const params: Record<string, string> = {}
  for (const [i, patternSegment] of patternSegments.entries()) {
    const pathSegment = pathSegments[i] ?? ''
    if (patternSegment.startsWith(':')) params[patternSegment.slice(1)] = pathSegment
    else if (patternSegment !== pathSegment) return null
  }
  return params
}

// Throws 404 for an unknown route or method, and 400 for a path ID that isn't a valid ID.
export function findRoute(method: string, path: string): RouteMatch {
  for (const route of ROUTES) {
    if (route.method !== method) continue
    const params = matchPattern(route.pattern, path)
    if (params === null) continue
    for (const [name, value] of Object.entries(params)) parseId(value, name)
    return { handler: route.handler, params }
  }
  throw notFound('No such endpoint.')
}
