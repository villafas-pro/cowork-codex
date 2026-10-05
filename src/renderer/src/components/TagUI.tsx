import React, { useMemo, useRef, useState } from 'react'
import { Tag as TagIcon, Check, Minus, Plus, X, Search, Archive } from 'lucide-react'
import { tagColor, type Tag, type useListFilters } from '../lib/tags'
import Popover from './Popover'

// ─── Chips ────────────────────────────────────────────────────────────────────

export function TagChip({
  tag,
  onRemove,
  onClick,
  active,
  title
}: {
  tag: Tag
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
  title?: string
}): React.JSX.Element {
  const c = tagColor(tag.color)
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        color: c.fg,
        backgroundColor: c.bg,
        boxShadow: active ? `inset 0 0 0 1px ${c.fg}` : undefined
      }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap ${onClick ? 'cursor-pointer hover:brightness-125' : ''}`}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="opacity-60 hover:opacity-100"
          title="Remove tag"
        >
          <X size={10} />
        </button>
      )}
    </span>
  )
}

/** Compact chips for list rows: first few, then "+N". */
export function TagChips({ tags, max = 3 }: { tags: Tag[]; max?: number }): React.JSX.Element | null {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max)
  const rest = tags.length - shown.length
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {shown.map((t) => <TagChip key={t.id} tag={t} />)}
      {rest > 0 && (
        <span className="text-[11px] text-th-tx-5" title={tags.slice(max).map((t) => t.name).join(', ')}>
          +{rest}
        </span>
      )}
    </div>
  )
}

// ─── Panel (find / toggle / create tags). Shared by row picker, row menu and bulk bar ───

export type TagState = 'none' | 'some' | 'all'

export function TagPanel({
  allTags,
  stateOf,
  onToggle,
  onCreate
}: {
  allTags: Tag[]
  /** 'some' only occurs when several items are selected and only part of them have the tag */
  stateOf: (tagId: string) => TagState
  onToggle: (tag: Tag, current: TagState) => void
  onCreate: (name: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const q = query.trim().replace(/^#/, '').toLowerCase()
  const slug = q.replace(/\s+/g, '-')
  const matches = useMemo(
    () => allTags.filter((t) => !q || t.name.toLowerCase().includes(q)),
    [allTags, q]
  )
  const exact = allTags.some((t) => t.name.toLowerCase() === slug)

  return (
    <div>
      <div className="p-2 border-b border-th-bd-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q) {
              const hit = allTags.find((t) => t.name.toLowerCase() === slug)
              if (hit) onToggle(hit, stateOf(hit.id))
              else onCreate(query)
              setQuery('')
            }
          }}
          placeholder="Find or create tag..."
          className="w-full bg-th-bg-2 border border-th-bd-2 rounded px-2 py-1 text-xs text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent"
        />
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {matches.map((t) => {
          const s = stateOf(t.id)
          return (
            <button
              key={t.id}
              onClick={() => onToggle(t, s)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-th-bg-5"
            >
              <span className="w-3 flex-shrink-0">
                {s === 'all' && <Check size={12} className="text-accent" />}
                {s === 'some' && <Minus size={12} className="text-th-tx-4" />}
              </span>
              <TagChip tag={t} />
            </button>
          )
        })}
        {q && !exact && (
          <button
            onClick={() => {
              onCreate(query)
              setQuery('')
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-th-tx-2 hover:bg-th-bg-5"
          >
            <Plus size={12} className="text-accent" />
            Create "{slug}"
          </button>
        )}
        {matches.length === 0 && !q && (
          <p className="px-3 py-3 text-xs text-th-tx-5">No tags yet. Type a name to create one.</p>
        )}
      </div>
    </div>
  )
}

// ─── Picker button for one item (used in editors; rows use the "..." menu) ────

export function TagPicker({
  allTags,
  assigned,
  onAssign,
  onUnassign,
  onCreate,
  buttonClassName,
  label
}: {
  allTags: Tag[]
  assigned: Tag[]
  onAssign: (tag: Tag) => void
  onUnassign: (tagId: string) => void
  onCreate: (name: string) => void
  buttonClassName?: string
  label?: string
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const assignedIds = useMemo(() => new Set(assigned.map((t) => t.id)), [assigned])

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation()
          setAnchor(anchor ? null : btnRef.current?.getBoundingClientRect() ?? null)
        }}
        className={
          buttonClassName ??
          'flex-shrink-0 p-1.5 rounded transition-colors text-transparent group-hover:text-th-tx-6 hover:!text-accent'
        }
        title="Tags"
      >
        <TagIcon size={13} />
        {label && <span className="ml-1 text-xs">{label}</span>}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={240} estimatedHeight={300}>
          <TagPanel
            allTags={allTags}
            stateOf={(id) => (assignedIds.has(id) ? 'all' : 'none')}
            onToggle={(tag, s) => (s === 'all' ? onUnassign(tag.id) : onAssign(tag))}
            onCreate={onCreate}
          />
        </Popover>
      )}
    </>
  )
}

// ─── Toolbar: search + tag filters + archived toggle ──────────────────────────

type Filters = ReturnType<typeof useListFilters>

export function ListToolbar({
  filters,
  placeholder
}: {
  filters: Filters
  placeholder: string
}): React.JSX.Element {
  const {
    tags, search, setSearch, selected, toggleTag, mode, setMode, untagged, setUntagged,
    showArchived, setShowArchived, clearFilters, hasActiveFilters
  } = filters
  const [showAll, setShowAll] = useState(false)

  // Suggestions while typing a #token
  const lastToken = search.split(/\s+/).pop() ?? ''
  const suggestions = useMemo(() => {
    if (!lastToken.startsWith('#')) return []
    const prefix = lastToken.slice(1).toLowerCase()
    return tags.filter((t) => t.name.toLowerCase().startsWith(prefix)).slice(0, 6)
  }, [lastToken, tags])

  function applySuggestion(tag: Tag): void {
    const words = search.split(/\s+/)
    words[words.length - 1] = `#${tag.name}`
    setSearch(words.join(' ') + ' ')
  }

  // Most-used tags first; keep the bar short unless expanded. Selected tags always show.
  const sorted = useMemo(
    () => [...tags].filter((t) => (t.count ?? 0) > 0 || selected.includes(t.id))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name)),
    [tags, selected]
  )
  const LIMIT = 8
  const visible = showAll ? sorted : sorted.slice(0, LIMIT)
  const hidden = sorted.length - visible.length

  return (
    <div className="px-4 py-2 flex-shrink-0 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-th-bg-3 border border-th-bd-2 rounded-lg focus-within:border-th-bd-3 transition-colors">
            <Search size={12} className="text-th-tx-4 flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`${placeholder} (use #tag to filter)`}
              className="flex-1 bg-transparent text-xs text-th-tx-1 placeholder-th-tx-5 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-th-tx-6 hover:text-th-tx-3 transition-colors flex-shrink-0">
                <X size={11} />
              </button>
            )}
          </div>
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-th-bd-2 bg-th-bg-3 shadow-lg py-1">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applySuggestion(t)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-th-bg-5"
                >
                  <TagChip tag={t} />
                  <span className="text-[11px] text-th-tx-5">{t.count ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowArchived(!showArchived)}
          title={showArchived ? 'Back to active items' : 'Show archived items'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors flex-shrink-0 ${
            showArchived
              ? 'border-accent text-accent bg-th-bg-3'
              : 'border-th-bd-2 text-th-tx-3 hover:text-th-tx-1 hover:bg-th-bg-5'
          }`}
        >
          <Archive size={12} />
          Archived
        </button>
      </div>

      {(sorted.length > 0 || untagged) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {visible.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              active={selected.includes(t.id)}
              onClick={() => toggleTag(t.id)}
              title={`${t.count ?? 0} item${t.count === 1 ? '' : 's'} across notes, code and flows`}
            />
          ))}
          {hidden > 0 && (
            <button onClick={() => setShowAll(true)} className="text-[11px] text-th-tx-4 hover:text-th-tx-2">
              +{hidden} more
            </button>
          )}
          {showAll && sorted.length > LIMIT && (
            <button onClick={() => setShowAll(false)} className="text-[11px] text-th-tx-4 hover:text-th-tx-2">
              less
            </button>
          )}
          <button
            onClick={() => setUntagged(!untagged)}
            className={`rounded-full px-2 py-0.5 text-[11px] border ${
              untagged ? 'border-accent text-accent' : 'border-th-bd-2 text-th-tx-4 hover:text-th-tx-2'
            }`}
          >
            Untagged
          </button>
          {selected.length >= 2 && (
            <button
              onClick={() => setMode(mode === 'and' ? 'or' : 'and')}
              className="rounded px-1.5 py-0.5 text-[11px] border border-th-bd-2 text-th-tx-3 hover:text-th-tx-1"
              title="Match all selected tags (AND) or any of them (OR)"
            >
              Match {mode === 'and' ? 'all' : 'any'}
            </button>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-[11px] text-th-tx-4 hover:text-th-tx-2 underline">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
