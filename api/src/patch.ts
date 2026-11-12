type Changes<T> = { [K in keyof T]?: T[K] | null }

// PATCH semantics: an omitted field is unchanged, null removes an optional field, and any other
// value replaces the field whole (an object is never merged).
export function applyChanges<T extends object>(record: T, changes: Changes<T>): T {
  const fields = new Map<string, unknown>(Object.entries(record))
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue
    if (value === null) fields.delete(key)
    else fields.set(key, value)
  }
  return Object.fromEntries(fields) as T
}

export function sortOldestFirst<T extends { created_at: string }>(items: readonly T[], idOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => a.created_at.localeCompare(b.created_at) || idOf(a).localeCompare(idOf(b)))
}
