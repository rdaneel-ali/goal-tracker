import { ConditionFailedError } from './store.ts'
import type { Condition, Key, Store, StoredItem, WriteOperation } from './store.ts'

const KEY_SEPARATOR = '\u0000'

function toMapKey(key: Key): string {
  return `${key.pk}${KEY_SEPARATOR}${key.sk}`
}

function isConditionMet(existing: StoredItem | undefined, condition: Condition): boolean {
  switch (condition.type) {
    case 'exists':
      return existing !== undefined
    case 'not_exists':
      return existing === undefined
    case 'status_is':
      return existing?.['status'] === condition.status
  }
}

// Test double that follows the DynamoDB rules the handlers rely on: consistent reads, queries in
// sort key order, all-or-nothing transactions, and no two operations on one item in a transaction.
export class MemoryStore implements Store {
  private readonly items = new Map<string, { key: Key; item: StoredItem }>()

  get(key: Key): Promise<StoredItem | null> {
    const found = this.items.get(toMapKey(key))
    return Promise.resolve(found ? structuredClone(found.item) : null)
  }

  query(pk: string, skPrefix: string): Promise<StoredItem[]> {
    const matches = [...this.items.values()]
      .filter(({ key }) => key.pk === pk && key.sk.startsWith(skPrefix))
      .sort((a, b) => (a.key.sk < b.key.sk ? -1 : a.key.sk > b.key.sk ? 1 : 0))
    return Promise.resolve(matches.map(({ item }) => structuredClone(item)))
  }

  put(key: Key, item: StoredItem): Promise<void> {
    this.write(key, item)
    return Promise.resolve()
  }

  transact(operations: readonly WriteOperation[]): Promise<void> {
    const mapKeys = operations.map((operation) => toMapKey(operation.key))
    if (new Set(mapKeys).size !== mapKeys.length) {
      return Promise.reject(new Error('Transaction has two operations on the same item'))
    }
    const failedIndex = operations.findIndex((operation, i) => {
      const condition = operation.condition
      return condition !== undefined && !isConditionMet(this.items.get(mapKeys[i] ?? '')?.item, condition)
    })
    if (failedIndex !== -1) return Promise.reject(new ConditionFailedError(failedIndex))
    for (const operation of operations) {
      if (operation.type === 'put') this.write(operation.key, operation.item)
      else if (operation.type === 'delete') this.items.delete(toMapKey(operation.key))
    }
    return Promise.resolve()
  }

  private write(key: Key, item: StoredItem): void {
    this.items.set(toMapKey(key), { key, item: structuredClone(item) })
  }
}
