import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import { TransactWriteCommand, QueryCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoStore, buildCondition } from '../src/dynamo-store.ts'
import { MemoryStore } from '../src/memory-store.ts'
import { ConditionFailedError } from '../src/store.ts'
import type { Key } from '../src/store.ts'

const A: Key = { pk: 'USER#1', sk: 'BUCKET#a' }
const B: Key = { pk: 'USER#1', sk: 'BUCKET#b' }

test('memory store: get and query return copies, queries are scoped by pk and prefix and sorted', async () => {
  const store = new MemoryStore()
  await store.put({ pk: 'USER#1', sk: 'GOAL#2' }, { n: 2 })
  await store.put({ pk: 'USER#1', sk: 'GOAL#1' }, { n: 1 })
  await store.put({ pk: 'USER#1', sk: 'BUCKET#1' }, { n: 3 })
  await store.put({ pk: 'USER#2', sk: 'GOAL#1' }, { n: 4 })
  assert.deepEqual(await store.query('USER#1', 'GOAL#'), [{ n: 1 }, { n: 2 }])
  const [first] = await store.query('USER#1', 'GOAL#')
  assert.ok(first)
  first['n'] = 99
  assert.deepEqual(await store.get({ pk: 'USER#1', sk: 'GOAL#1' }), { n: 1 })
  assert.equal(await store.get({ pk: 'USER#3', sk: 'GOAL#1' }), null)
})

test('memory store: a failing condition rejects the whole transaction and reports the index', async () => {
  const store = new MemoryStore()
  await store.put(A, { status: 'available' })
  await assert.rejects(
    store.transact([
      { type: 'put', key: B, item: { status: 'new' }, condition: { type: 'not_exists' } },
      { type: 'put', key: A, item: { status: 'in_use' }, condition: { type: 'status_is', status: 'in_use' } },
    ]),
    (e: unknown) => e instanceof ConditionFailedError && e.operationIndex === 1,
  )
  assert.equal(await store.get(B), null)
  assert.deepEqual(await store.get(A), { status: 'available' })
})

test('memory store: conditions exists, not_exists and status_is, plus delete and check', async () => {
  const store = new MemoryStore()
  await assert.rejects(
    store.transact([{ type: 'delete', key: A, condition: { type: 'exists' } }]),
    ConditionFailedError,
  )
  await store.transact([{ type: 'put', key: A, item: { status: 'available' }, condition: { type: 'not_exists' } }])
  await assert.rejects(
    store.transact([{ type: 'put', key: A, item: {}, condition: { type: 'not_exists' } }]),
    ConditionFailedError,
  )
  await assert.rejects(
    store.transact([{ type: 'check', key: A, condition: { type: 'status_is', status: 'retired' } }]),
    ConditionFailedError,
  )
  await store.transact([{ type: 'check', key: A, condition: { type: 'status_is', status: 'available' } }])
  await store.transact([{ type: 'delete', key: A, condition: { type: 'exists' } }])
  assert.equal(await store.get(A), null)
})

test('memory store: two operations on one item in a transaction are refused, as DynamoDB does', async () => {
  const store = new MemoryStore()
  await assert.rejects(
    store.transact([
      { type: 'delete', key: A },
      { type: 'put', key: A, item: {} },
    ]),
    /same item/,
  )
})

test('dynamo store: builds the conditional transaction commands', async () => {
  const sent: unknown[] = []
  const store = new DynamoStore(
    { send: (command: unknown) => (sent.push(command), Promise.resolve({})) } as never,
    'tbl',
  )
  await store.transact([
    { type: 'check', key: A, condition: { type: 'status_is', status: 'active' } },
    { type: 'put', key: B, item: { n: 1 }, condition: { type: 'not_exists' } },
    { type: 'delete', key: A },
  ])
  const command = sent[0]
  assert.ok(command instanceof TransactWriteCommand)
  assert.deepEqual(command.input.TransactItems, [
    {
      ConditionCheck: {
        TableName: 'tbl',
        Key: { PK: 'USER#1', SK: 'BUCKET#a' },
        ConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'active' },
      },
    },
    {
      Put: {
        TableName: 'tbl',
        Item: { n: 1, PK: 'USER#1', SK: 'BUCKET#b' },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    { Delete: { TableName: 'tbl', Key: { PK: 'USER#1', SK: 'BUCKET#a' } } },
  ])
  assert.equal(buildCondition({ type: 'exists' }).ConditionExpression, 'attribute_exists(PK)')
})

test('dynamo store: a cancelled transaction with a failed condition becomes ConditionFailedError', async () => {
  const cancelled = new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
  })
  const store = new DynamoStore({ send: () => Promise.reject(cancelled) } as never, 'tbl')
  await assert.rejects(
    store.transact([{ type: 'delete', key: A }]),
    (e: unknown) => e instanceof ConditionFailedError && e.operationIndex === 1,
  )
  const other = new DynamoStore({ send: () => Promise.reject(new Error('boom')) } as never, 'tbl')
  await assert.rejects(other.transact([{ type: 'delete', key: A }]), /boom/)
})

test('dynamo store: reads are consistent, strip the key attributes and follow pagination', async () => {
  const sent: unknown[] = []
  const pages = [
    { Items: [{ PK: 'USER#1', SK: 'GOAL#1', n: 1 }], LastEvaluatedKey: { PK: 'USER#1', SK: 'GOAL#1' } },
    { Items: [{ PK: 'USER#1', SK: 'GOAL#2', n: 2 }] },
  ]
  const store = new DynamoStore(
    {
      send: (command: unknown) => {
        sent.push(command)
        if (command instanceof GetCommand) return Promise.resolve({ Item: { PK: 'USER#1', SK: 'GOAL#1', n: 1 } })
        return Promise.resolve(pages.shift() ?? {})
      },
    } as never,
    'tbl',
  )
  assert.deepEqual(await store.get({ pk: 'USER#1', sk: 'GOAL#1' }), { n: 1 })
  assert.deepEqual(await store.query('USER#1', 'GOAL#'), [{ n: 1 }, { n: 2 }])
  await store.put({ pk: 'USER#1', sk: 'SETTINGS' }, { timezone: 'UTC' })

  const [get, firstQuery, secondQuery, put] = sent
  assert.ok(get instanceof GetCommand && get.input.ConsistentRead === true)
  assert.ok(firstQuery instanceof QueryCommand && firstQuery.input.ConsistentRead === true)
  assert.equal(firstQuery.input.KeyConditionExpression, 'PK = :pk AND begins_with(SK, :prefix)')
  assert.ok(secondQuery instanceof QueryCommand)
  assert.deepEqual(secondQuery.input.ExclusiveStartKey, { PK: 'USER#1', SK: 'GOAL#1' })
  assert.ok(put instanceof PutCommand)
  assert.deepEqual(put.input.Item, { timezone: 'UTC', PK: 'USER#1', SK: 'SETTINGS' })
})
