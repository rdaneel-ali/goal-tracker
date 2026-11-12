// A small key-value port over the single DynamoDB table. The DynamoDB store and the in-memory
// store both implement it, so the handlers never see which one they run on.

export interface Key {
  pk: string
  sk: string
}

export type StoredItem = Record<string, unknown>

// What a write needs to find on the existing item (or lack of one) for the transaction to go ahead.
export type Condition = { type: 'exists' } | { type: 'not_exists' } | { type: 'status_is'; status: string }

export type WriteOperation =
  | { type: 'put'; key: Key; item: StoredItem; condition?: Condition }
  | { type: 'delete'; key: Key; condition?: Condition }
  | { type: 'check'; key: Key; condition: Condition }

// Thrown when a transaction was rejected because a condition failed. Nothing was written.
// `operationIndex` is the position of the first failing operation, or null when the store can't tell.
export class ConditionFailedError extends Error {
  readonly operationIndex: number | null

  constructor(operationIndex: number | null) {
    super('A write condition failed')
    this.name = 'ConditionFailedError'
    this.operationIndex = operationIndex
  }
}

export interface Store {
  get(key: Key): Promise<StoredItem | null>
  // Every item under `pk` whose sort key starts with `skPrefix`, in sort key order.
  query(pk: string, skPrefix: string): Promise<StoredItem[]>
  put(key: Key, item: StoredItem): Promise<void>
  // All-or-nothing. Throws ConditionFailedError when any condition fails.
  transact(operations: readonly WriteOperation[]): Promise<void>
}
