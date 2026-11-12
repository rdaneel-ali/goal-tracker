import { MemoryStore } from '../src/memory-store.ts'
import type { WriteOperation } from '../src/store.ts'

// Lets a test change the data between a handler's reads and its transaction, to prove the
// transaction conditions catch concurrent requests.
export class RacingStore extends MemoryStore {
  beforeTransact: (() => Promise<void>) | undefined

  override async transact(operations: readonly WriteOperation[]): Promise<void> {
    const hook = this.beforeTransact
    this.beforeTransact = undefined
    if (hook) await hook()
    await super.transact(operations)
  }
}
