import type { ErrorCode } from '@goal-tracker/shared/api'

export class HttpError extends Error {
  readonly status: number
  readonly code: ErrorCode

  constructor(status: number, code: ErrorCode, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export function invalidInput(message: string): HttpError {
  return new HttpError(400, 'invalid_input', message)
}

export function notFound(message: string): HttpError {
  return new HttpError(404, 'not_found', message)
}

export function conflict(code: ErrorCode, message: string): HttpError {
  return new HttpError(409, code, message)
}
