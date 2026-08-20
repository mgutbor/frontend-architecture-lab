// Session-only id generation following the domain id pattern (`entity-NNN`,
// see domain-model.md §1). These helpers exist on the React side because the
// domain package is frozen for the MVP and the fixture is never mutated:
// new entities created during the session need the next id in the sequence.

export function nextEntityId(ids: readonly string[], prefix: string): string {
  let max = 0
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  for (const id of ids) {
    const match = pattern.exec(id)
    if (match) {
      max = Math.max(max, Number(match[1]))
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}
