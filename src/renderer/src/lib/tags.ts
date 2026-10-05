import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type TaggableType = 'note' | 'code' | 'flow'

export interface Tag {
  id: string
  name: string
  color: string
  count?: number
}

export const TAG_COLORS: Record<string, { fg: string; bg: string }> = {
  red: { fg: '#f87171', bg: 'rgba(248,113,113,0.16)' },
  orange: { fg: '#fb923c', bg: 'rgba(251,146,60,0.16)' },
  yellow: { fg: '#e8b800', bg: 'rgba(232,184,0,0.16)' },
  green: { fg: '#4ade80', bg: 'rgba(74,222,128,0.16)' },
  teal: { fg: '#2dd4bf', bg: 'rgba(45,212,191,0.16)' },
  blue: { fg: '#60a5fa', bg: 'rgba(96,165,250,0.16)' },
  purple: { fg: '#a78bfa', bg: 'rgba(167,139,250,0.16)' },
  pink: { fg: '#f472b6', bg: 'rgba(244,114,182,0.16)' },
  gray: { fg: '#9ca3af', bg: 'rgba(156,163,175,0.16)' }
}

export function tagColor(color: string): { fg: string; bg: string } {
  return TAG_COLORS[color] ?? TAG_COLORS.gray
}

// ─── Per-page filter state ────────────────────────────────────────────────────

type FilterMode = 'and' | 'or'

// The archived view is deliberately not remembered: returning to a list should show active items.
interface PersistedFilters {
  selected: string[]
  mode: FilterMode
}

function loadPersisted(type: TaggableType): PersistedFilters {
  try {
    const raw = localStorage.getItem(`filters:${type}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { selected: Array.isArray(parsed.selected) ? parsed.selected : [], mode: parsed.mode === 'or' ? 'or' : 'and' }
    }
  } catch { /* ignore */ }
  return { selected: [], mode: 'and' }
}

function savePersisted(type: TaggableType, value: PersistedFilters): void {
  try {
    localStorage.setItem(`filters:${type}`, JSON.stringify(value))
  } catch { /* ignore */ }
}

/**
 * Splits a search string into plain text and `#tag` tokens. Each #token matches tags whose
 * name starts with it (so partially typed tags work), and an item must have at least one
 * tag from every token's match set.
 */
export function parseSearch(search: string, tags: Tag[]): { text: string; tagGroups: string[][] } {
  const words = search.split(/\s+/).filter(Boolean)
  const textWords: string[] = []
  const tagGroups: string[][] = []
  for (const w of words) {
    if (w.startsWith('#') && w.length > 1) {
      const prefix = w.slice(1).toLowerCase()
      tagGroups.push(tags.filter((t) => t.name.toLowerCase().startsWith(prefix)).map((t) => t.id))
    } else {
      textWords.push(w)
    }
  }
  return { text: textWords.join(' ').toLowerCase(), tagGroups }
}

interface Filterable {
  id: string
  title: string
  archived_at?: number | null
}

export function useListFilters(type: TaggableType): {
  tags: Tag[]
  tagsFor: (entityId: string) => Tag[]
  search: string
  setSearch: (s: string) => void
  selected: string[]
  toggleTag: (id: string) => void
  mode: FilterMode
  setMode: (m: FilterMode) => void
  untagged: boolean
  setUntagged: (v: boolean) => void
  showArchived: boolean
  setShowArchived: (v: boolean) => void
  clearFilters: () => void
  hasActiveFilters: boolean
  applyFilters: <T extends Filterable>(items: T[]) => T[]
  assign: (entityId: string, tag: Tag) => Promise<void>
  unassign: (entityId: string, tagId: string) => Promise<void>
  createAndAssign: (entityId: string, name: string) => Promise<void>
  assignMany: (entityIds: string[], tag: Tag) => Promise<void>
  unassignMany: (entityIds: string[], tagId: string) => Promise<void>
  createAndAssignMany: (entityIds: string[], name: string) => Promise<void>
  countWithTag: (entityIds: string[], tagId: string) => number
} {
  const initial = useMemo(() => loadPersisted(type), [type])
  const [tags, setTags] = useState<Tag[]>([])
  const [assignments, setAssignments] = useState<Map<string, string[]>>(new Map())
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>(initial.selected)
  const [mode, setMode] = useState<FilterMode>(initial.mode)
  const [showArchived, setShowArchived] = useState(false)
  const [untagged, setUntagged] = useState(false)

  const load = useCallback(async () => {
    const [allTags, rows] = await Promise.all([
      window.api?.tags.getAll() ?? [],
      window.api?.tags.getAssignments(type) ?? []
    ])
    setTags(allTags as Tag[])
    const map = new Map<string, string[]>()
    for (const r of rows as { tag_id: string; entity_id: string }[]) {
      const list = map.get(r.entity_id) ?? []
      list.push(r.tag_id)
      map.set(r.entity_id, list)
    }
    setAssignments(map)
    // Drop selected tags that no longer exist (deleted or merged elsewhere)
    setSelected((prev) => prev.filter((id) => (allTags as Tag[]).some((t) => t.id === id)))
  }, [type])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    savePersisted(type, { selected, mode })
  }, [type, selected, mode])

  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  const tagsFor = useCallback(
    (entityId: string): Tag[] =>
      (assignments.get(entityId) ?? [])
        .map((id) => tagMap.get(id))
        .filter((t): t is Tag => !!t)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [assignments, tagMap]
  )

  const toggleTag = useCallback((id: string) => {
    setUntagged(false)
    setSelected((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }, [])

  const clearFilters = useCallback(() => {
    setSelected([])
    setUntagged(false)
    setSearch('')
  }, [])

  const applyFilters = useCallback(
    <T extends Filterable>(items: T[]): T[] => {
      const { text, tagGroups } = parseSearch(search, tags)
      return items.filter((item) => {
        // Active view hides archived items; archived view shows only archived ones
        if (showArchived ? !item.archived_at : !!item.archived_at) return false
        if (text && !(item.title || 'Untitled').toLowerCase().includes(text)) return false

        const ids = assignments.get(item.id) ?? []
        if (untagged && ids.length > 0) return false
        if (selected.length > 0) {
          const ok =
            mode === 'and' ? selected.every((t) => ids.includes(t)) : selected.some((t) => ids.includes(t))
          if (!ok) return false
        }
        for (const group of tagGroups) {
          if (!group.some((t) => ids.includes(t))) return false
        }
        return true
      })
    },
    [search, tags, assignments, selected, mode, untagged, showArchived]
  )

  // Latest assignments for async callbacks, so bulk edits only count items that actually change
  const assignmentsRef = useRef(assignments)
  assignmentsRef.current = assignments

  const assignMany = useCallback(async (entityIds: string[], tag: Tag) => {
    const todo = entityIds.filter((id) => !(assignmentsRef.current.get(id) ?? []).includes(tag.id))
    if (todo.length === 0) return
    await Promise.all(todo.map((id) => window.api?.tags.assign(type, id, tag.id)))
    setAssignments((prev) => {
      const next = new Map(prev)
      for (const id of todo) next.set(id, [...new Set([...(prev.get(id) ?? []), tag.id])])
      return next
    })
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, count: (t.count ?? 0) + todo.length } : t)))
  }, [type])

  const unassignMany = useCallback(async (entityIds: string[], tagId: string) => {
    const todo = entityIds.filter((id) => (assignmentsRef.current.get(id) ?? []).includes(tagId))
    if (todo.length === 0) return
    await Promise.all(todo.map((id) => window.api?.tags.unassign(type, id, tagId)))
    setAssignments((prev) => {
      const next = new Map(prev)
      for (const id of todo) next.set(id, (prev.get(id) ?? []).filter((t) => t !== tagId))
      return next
    })
    setTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, count: Math.max(0, (t.count ?? 0) - todo.length) } : t)))
  }, [type])

  const assign = useCallback((entityId: string, tag: Tag) => assignMany([entityId], tag), [assignMany])
  const unassign = useCallback((entityId: string, tagId: string) => unassignMany([entityId], tagId), [unassignMany])

  const createAndAssignMany = useCallback(async (entityIds: string[], name: string) => {
    const tag: Tag | null = await window.api?.tags.create(name)
    if (!tag) return
    setTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, { ...tag, count: 0 }]))
    await assignMany(entityIds, tag)
  }, [assignMany])

  const createAndAssign = useCallback((entityId: string, name: string) => createAndAssignMany([entityId], name), [createAndAssignMany])

  /** How many of these items currently have the tag (drives the all / some / none check marks) */
  const countWithTag = useCallback(
    (entityIds: string[], tagId: string): number =>
      entityIds.filter((id) => (assignments.get(id) ?? []).includes(tagId)).length,
    [assignments]
  )

  return {
    tags,
    tagsFor,
    search,
    setSearch,
    selected,
    toggleTag,
    mode,
    setMode,
    untagged,
    setUntagged: (v: boolean) => {
      setUntagged(v)
      if (v) setSelected([])
    },
    showArchived,
    setShowArchived,
    clearFilters,
    hasActiveFilters: selected.length > 0 || untagged || search.trim().length > 0,
    applyFilters,
    assign,
    unassign,
    createAndAssign,
    assignMany,
    unassignMany,
    createAndAssignMany,
    countWithTag
  }
}
