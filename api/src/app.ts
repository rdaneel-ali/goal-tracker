import type { ApiError } from '@goal-tracker/shared/api'
import type { Deps } from './context.ts'
import { HttpError } from './errors.ts'
import { findRoute } from './router.ts'

// The slice of an API Gateway HTTP API (payload format 2.0) event this API reads.
export interface ApiEvent {
  rawPath: string
  rawQueryString?: string | undefined
  headers?: Record<string, string> | undefined
  body?: string | undefined
  isBase64Encoded?: boolean | undefined
  requestContext: {
    http: { method: string }
    authorizer?: { jwt?: { claims?: Record<string, unknown> | undefined } | undefined } | undefined
  }
}

export interface ApiResponse {
  statusCode: number
  headers: Record<string, string>
  body?: string
}

const BASE_HEADERS = { 'Cache-Control': 'no-store' }

function respond(statusCode: number, body?: unknown): ApiResponse {
  if (body === undefined) return { statusCode, headers: BASE_HEADERS }
  return {
    statusCode,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function respondWithError(status: number, code: ApiError['error']['code'], message: string): ApiResponse {
  const body: ApiError = { error: { code, message } }
  return respond(status, body)
}

// The user comes only from the verified token claims. A request without one never reaches a handler.
function readUserId(event: ApiEvent): string {
  const sub = event.requestContext.authorizer?.jwt?.claims?.['sub']
  if (typeof sub !== 'string' || sub === '') throw new Error('Request has no authenticated user')
  return sub
}

function readBody(event: ApiEvent): string | undefined {
  if (event.body === undefined) return undefined
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
}

export function createHandler(deps: Deps): (event: ApiEvent) => Promise<ApiResponse> {
  return async (event) => {
    try {
      const { handler, params } = findRoute(event.requestContext.http.method, event.rawPath)
      const result = await handler({
        deps,
        userId: readUserId(event),
        now: deps.clock(),
        params,
        body: readBody(event),
      })
      return respond(result.status, result.body)
    } catch (e) {
      if (e instanceof HttpError) return respondWithError(e.status, e.code, e.message)
      // Log what failed, never the request, and send the client nothing about it.
      console.error('Unhandled error', e instanceof Error ? `${e.name}: ${e.message}` : 'unknown')
      return respondWithError(500, 'internal', 'Something went wrong.')
    }
  }
}
