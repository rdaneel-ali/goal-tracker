import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { ConditionFailedError } from './store.ts'
import type { Condition, Key, Store, StoredItem, WriteOperation } from './store.ts'

type Sender = Pick<DynamoDBDocumentClient, 'send'>

interface ConditionParts {
  ConditionExpression: string
  ExpressionAttributeNames?: Record<string, string>
  ExpressionAttributeValues?: Record<string, string>
}

function toDynamoKey(key: Key): { PK: string; SK: string } {
  return { PK: key.pk, SK: key.sk }
}

function removeKeyAttributes(item: Record<string, unknown>): StoredItem {
  const domainItem = { ...item }
  delete domainItem['PK']
  delete domainItem['SK']
  return domainItem
}

// "status" is a DynamoDB reserved word, so it goes through an attribute name placeholder.
export function buildCondition(condition: Condition): ConditionParts {
  switch (condition.type) {
    case 'exists':
      return { ConditionExpression: 'attribute_exists(PK)' }
    case 'not_exists':
      return { ConditionExpression: 'attribute_not_exists(PK)' }
    case 'status_is':
      return {
        ConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': condition.status },
      }
  }
}

function buildOptionalCondition(condition: Condition | undefined): Partial<ConditionParts> {
  return condition === undefined ? {} : buildCondition(condition)
}

function toTransactItem(operation: WriteOperation, tableName: string) {
  switch (operation.type) {
    case 'put':
      return {
        Put: {
          TableName: tableName,
          Item: { ...operation.item, ...toDynamoKey(operation.key) },
          ...buildOptionalCondition(operation.condition),
        },
      }
    case 'delete':
      return {
        Delete: {
          TableName: tableName,
          Key: toDynamoKey(operation.key),
          ...buildOptionalCondition(operation.condition),
        },
      }
    case 'check':
      return {
        ConditionCheck: {
          TableName: tableName,
          Key: toDynamoKey(operation.key),
          ...buildCondition(operation.condition),
        },
      }
  }
}

export class DynamoStore implements Store {
  private readonly client: Sender
  private readonly tableName: string

  constructor(client: Sender, tableName: string) {
    this.client = client
    this.tableName = tableName
  }

  async get(key: Key): Promise<StoredItem | null> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: toDynamoKey(key), ConsistentRead: true }),
    )
    return result.Item ? removeKeyAttributes(result.Item) : null
  }

  async query(pk: string, skPrefix: string): Promise<StoredItem[]> {
    const items: StoredItem[] = []
    let startKey: Record<string, unknown> | undefined
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': skPrefix },
          ConsistentRead: true,
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      )
      for (const item of result.Items ?? []) items.push(removeKeyAttributes(item))
      startKey = result.LastEvaluatedKey
    } while (startKey)
    return items
  }

  async put(key: Key, item: StoredItem): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: { ...item, ...toDynamoKey(key) } }))
  }

  async transact(operations: readonly WriteOperation[]): Promise<void> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: operations.map((operation) => toTransactItem(operation, this.tableName)),
        }),
      )
    } catch (e) {
      if (e instanceof TransactionCanceledException) {
        const failedIndex = e.CancellationReasons?.findIndex((reason) => reason.Code === 'ConditionalCheckFailed')
        if (failedIndex !== undefined && failedIndex !== -1) throw new ConditionFailedError(failedIndex)
      }
      throw e
    }
  }
}
