// Ordering of ticket keys such as OB-12 or a plain Azure DevOps id like 4521.

export type Direction = 'asc' | 'desc'

function parse(key: string): { prefix: string; num: number } | null {
  const m = key.match(/^([A-Za-z][A-Za-z0-9_]*)-(\d+)$/) ?? key.match(/^()(\d+)$/)
  return m ? { prefix: m[1].toUpperCase(), num: Number(m[2]) } : null
}

const cmp = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0)

/** Project prefix first, then ticket number as a number (OB-9 before OB-10). Unparseable keys go last. */
export function compareKeys(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  if (pa && pb) return cmp(pa.prefix, pb.prefix) || cmp(pa.num, pb.num) || cmp(a, b)
  if (pa) return -1
  if (pb) return 1
  return cmp(a, b)
}

export function sortKeys(keys: string[], dir: Direction): string[] {
  const asc = [...keys].sort(compareKeys)
  return dir === 'asc' ? asc : asc.reverse()
}

/** One button: sort ascending, and if the list is already ascending, flip to descending. */
export function nextDirection(current: string[]): Direction {
  const asc = sortKeys(current, 'asc')
  return asc.every((k, i) => k === current[i]) ? 'desc' : 'asc'
}
