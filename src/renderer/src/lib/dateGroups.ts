export interface MonthGroup<T> {
  key: string
  label: string
  items: T[]
}

/** Groups items by calendar month of a timestamp, newest month first, newest item first within each month. */
export function groupByMonth<T>(items: T[], getTs: (item: T) => number): MonthGroup<T>[] {
  const sorted = [...items].sort((a, b) => getTs(b) - getTs(a))
  const groups: MonthGroup<T>[] = []
  for (const item of sorted) {
    const d = new Date(getTs(item))
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      group = {
        key,
        label: d.toLocaleDateString(
          undefined,
          d.getFullYear() === new Date().getFullYear()
            ? { month: 'long' }
            : { month: 'long', year: 'numeric' }
        ),
        items: []
      }
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}
