/** Apply a requested card order: listed cards first, unlisted ones after in their old order. */
export function applyOrder(current: string[], requested: string[]): string[] {
  const have = new Set(current)
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of requested) {
    if (have.has(k) && !seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  for (const k of current) if (!seen.has(k)) out.push(k)
  return out
}
