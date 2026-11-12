import type { Bucket, Entry, Goal, Settings } from '@goal-tracker/shared/types'
import type { Condition, Key, Store, WriteOperation } from './store.ts'

// Item layout (see the spec's DynamoDB table). Every key starts with the caller's user ID, so a
// lookup can only ever reach that user's own records.
const SETTINGS_SK = 'SETTINGS'
const BUCKET_PREFIX = 'BUCKET#'
const GOAL_PREFIX = 'GOAL#'
const ENTRY_PREFIX = 'ENTRY#'

function userPk(userId: string): string {
  return `USER#${userId}`
}

export function settingsKey(userId: string): Key {
  return { pk: userPk(userId), sk: SETTINGS_SK }
}

export function bucketKey(userId: string, bucketId: string): Key {
  return { pk: userPk(userId), sk: `${BUCKET_PREFIX}${bucketId}` }
}

export function goalKey(userId: string, goalId: string): Key {
  return { pk: userPk(userId), sk: `${GOAL_PREFIX}${goalId}` }
}

export function entryKey(entry: Pick<Entry, 'user_id' | 'goal_id' | 'date' | 'entry_id'>): Key {
  return { pk: userPk(entry.user_id), sk: `${ENTRY_PREFIX}${entry.goal_id}#${entry.date}#${entry.entry_id}` }
}

export function putOperation(key: Key, item: object, condition?: Condition): WriteOperation {
  const operation: WriteOperation = { type: 'put', key, item: { ...item } }
  if (condition) operation.condition = condition
  return operation
}

export function deleteOperation(key: Key, condition?: Condition): WriteOperation {
  const operation: WriteOperation = { type: 'delete', key }
  if (condition) operation.condition = condition
  return operation
}

export function checkOperation(key: Key, condition: Condition): WriteOperation {
  return { type: 'check', key, condition }
}

// Typed reads over the store. The cast is safe because only this API writes these items, always from
// the shared types, under keys that name the item kind.
export class Repository {
  private readonly store: Store

  constructor(store: Store) {
    this.store = store
  }

  async getSettings(userId: string): Promise<Settings | null> {
    return (await this.store.get(settingsKey(userId))) as Settings | null
  }

  async putSettings(settings: Settings): Promise<void> {
    await this.store.put(settingsKey(settings.user_id), { ...settings })
  }

  async listBuckets(userId: string): Promise<Bucket[]> {
    return (await this.store.query(userPk(userId), BUCKET_PREFIX)) as unknown as Bucket[]
  }

  async getBucket(userId: string, bucketId: string): Promise<Bucket | null> {
    return (await this.store.get(bucketKey(userId, bucketId))) as Bucket | null
  }

  async putBucket(bucket: Bucket): Promise<void> {
    await this.store.put(bucketKey(bucket.user_id, bucket.bucket_id), { ...bucket })
  }

  async listGoals(userId: string): Promise<Goal[]> {
    return (await this.store.query(userPk(userId), GOAL_PREFIX)) as unknown as Goal[]
  }

  async getGoal(userId: string, goalId: string): Promise<Goal | null> {
    return (await this.store.get(goalKey(userId, goalId))) as Goal | null
  }

  // One goal's entries, in date order. The query is scoped to the goal, as calculateBalance requires.
  async listGoalEntries(userId: string, goalId: string): Promise<Entry[]> {
    return (await this.store.query(userPk(userId), `${ENTRY_PREFIX}${goalId}#`)) as unknown as Entry[]
  }

  async listAllEntries(userId: string): Promise<Entry[]> {
    return (await this.store.query(userPk(userId), ENTRY_PREFIX)) as unknown as Entry[]
  }

  async commit(operations: readonly WriteOperation[]): Promise<void> {
    await this.store.transact(operations)
  }
}
