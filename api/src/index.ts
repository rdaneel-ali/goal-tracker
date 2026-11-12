import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { createHandler } from './app.ts'
import { DynamoStore } from './dynamo-store.ts'
import { Repository } from './repository.ts'

function readTableName(): string {
  const tableName = process.env['TABLE_NAME']
  if (tableName === undefined || tableName === '') throw new Error('TABLE_NAME is not set')
  return tableName
}

// Lambda entry point: index.handler
export const handler = createHandler({
  repo: new Repository(new DynamoStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), readTableName())),
  clock: () => new Date(),
  newId: () => randomUUID(),
})
