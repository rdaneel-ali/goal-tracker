import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { createHandler } from './app.ts'
import type { ApiEvent } from './app.ts'
import { seedDevData } from './dev-seed.ts'
import type { ApiCall } from './dev-seed.ts'
import { MemoryStore } from './memory-store.ts'
import { Repository } from './repository.ts'
import { findDateInTimeZone } from './time.ts'

// Local development only: an in-memory store, a stubbed sign-in and seed data. Never bundled for Lambda.
const LOCAL_USER = 'local-user'
const port = Number(process.env['PORT'] ?? 3001)

const handler = createHandler({
  repo: new Repository(new MemoryStore()),
  clock: () => new Date(),
  newId: () => randomUUID(),
})

async function readRequestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return chunks.length === 0 ? undefined : Buffer.concat(chunks).toString('utf8')
}

function buildEvent(request: IncomingMessage, body: string | undefined): ApiEvent {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(',') : value
  }
  return {
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    body,
    isBase64Encoded: false,
    requestContext: {
      http: { method: request.method ?? 'GET' },
      authorizer: { jwt: { claims: { sub: LOCAL_USER } } },
    },
  }
}

const seedCall: ApiCall = async (method, path, body) => {
  const response = await handler({
    rawPath: path,
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: {
      http: { method },
      authorizer: { jwt: { claims: { sub: LOCAL_USER } } },
    },
  })
  if (response.statusCode >= 300) {
    throw new Error(`Seed ${method} ${path} failed: ${response.body ?? response.statusCode}`)
  }
  return response.body === undefined ? undefined : (JSON.parse(response.body) as unknown)
}

await seedDevData(seedCall, findDateInTimeZone(new Date(), 'America/Los_Angeles'))

createServer((request, response) => {
  void readRequestBody(request)
    .then((body) => handler(buildEvent(request, body)))
    .then((result) => {
      response.writeHead(result.statusCode, result.headers)
      response.end(result.body)
    })
    .catch((e: unknown) => {
      console.error('Dev server error', e instanceof Error ? e.message : 'unknown')
      response.writeHead(500)
      response.end()
    })
}).listen(port, 'localhost', () => {
  console.log(`Goal Tracker API (in-memory, signed in as ${LOCAL_USER}) on http://localhost:${port}`)
})
