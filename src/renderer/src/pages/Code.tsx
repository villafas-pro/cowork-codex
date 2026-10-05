import React, { useEffect, useState } from 'react'
import { Plus, Code2, Pin, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { groupByMonth } from '../lib/dateGroups'
import { useListFilters } from '../lib/tags'
import { useSelection } from '../lib/selection'
import { ListToolbar, TagChips } from '../components/TagUI'
import RowMenu from '../components/RowMenu'
import BulkBar, { RowCheck } from '../components/BulkBar'

interface CodeBlock {
  id: string
  title: string
  language: string
  note_id: string | null
  is_pinned: number
  archived_at: number | null
  created_at: number
  updated_at: number
}

export default function Code(): React.JSX.Element {
  const { openTab, closeTab, tabs, showConfirm } = useAppStore()
  const [blocks, setBlocks] = useState<CodeBlock[]>([])
  const filters = useListFilters('code')
  const { showArchived } = filters

  useEffect(() => {
    loadBlocks()
  }, [])

  async function loadBlocks(): Promise<void> {
    const all: CodeBlock[] = (await window.api?.code.getAll()) || []
    setBlocks(all)
  }

  async function createBlock(): Promise<void> {
    const block = await window.api?.code.create({ title: 'Untitled' })
    if (block) {
      setBlocks((prev) => [block, ...prev])
      openTab({ entityType: 'code', entityId: block.id, title: block.title })
    }
  }

  const filtered = filters.applyFilters(blocks)
  const pinned = filtered.filter((b) => b.is_pinned)
  const rest = filtered.filter((b) => !b.is_pinned)

  // Sections in display order; selection ranges follow this order
  const archivedGroups = groupByMonth(filtered, (b) => b.archived_at as number)
  const monthGroups = groupByMonth(rest, (b) => b.updated_at)
  const visibleIds = showArchived
    ? archivedGroups.flatMap((g) => g.items.map((b) => b.id))
    : [...pinned, ...monthGroups.flatMap((g) => g.items)].map((b) => b.id)
  const sel = useSelection(visibleIds)

  async function togglePin(block: CodeBlock): Promise<void> {
    await window.api?.code.togglePin(block.id)
    setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, is_pinned: b.is_pinned ? 0 : 1 } : b)))
  }

  async function setArchived(block: CodeBlock, archived: boolean): Promise<void> {
    const res = await window.api?.archive.set('code', block.id, archived)
    setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, archived_at: res?.archivedAt ?? null } : b)))
  }

  function closeTabsFor(ids: string[]): void {
    for (const id of ids) {
      const tab = tabs.find((t) => t.entityType === 'code' && t.entityId === id)
      if (tab) closeTab(tab.id)
    }
  }

  async function deleteBlock(block: CodeBlock): Promise<void> {
    if (!await showConfirm(`Delete "${block.title || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.code.delete(block.id)
    setBlocks((prev) => prev.filter((b) => b.id !== block.id))
    closeTabsFor([block.id])
  }

  // ─── Bulk actions ───────────────────────────────────────────────────────────

  async function bulkArchiveToggle(): Promise<void> {
    const ids = sel.selectedIds
    const archive = !showArchived
    const results = await Promise.all(ids.map((id) => window.api?.archive.set('code', id, archive)))
    const at = new Map(ids.map((id, i) => [id, results[i]?.archivedAt ?? null]))
    setBlocks((prev) => prev.map((b) => (at.has(b.id) ? { ...b, archived_at: at.get(b.id) ?? null } : b)))
    sel.clear()
  }

  async function bulkDelete(): Promise<void> {
    const ids = sel.selectedIds
    if (!await showConfirm(`Delete ${ids.length} code block${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    await Promise.all(ids.map((id) => window.api?.code.delete(id)))
    const gone = new Set(ids)
    setBlocks((prev) => prev.filter((b) => !gone.has(b.id)))
    closeTabsFor(ids)
    sel.clear()
  }

  const formatDate = (ts: number): string => {
    const diff = Date.now() - ts
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  // A plain function (not a component) so row state survives re-renders
  const renderBlockRow = (block: CodeBlock): React.JSX.Element => {
    const blockTags = filters.tagsFor(block.id)
    const archived = !!block.archived_at
    const isSel = sel.isSelected(block.id)
    return (
      <div
        key={block.id}
        className={`flex items-center gap-1 rounded-lg transition-all group select-none ${
          isSel ? 'bg-th-bg-5' : 'hover:bg-th-bg-5'
        } ${archived && !isSel ? 'opacity-50 hover:opacity-100' : ''}`}
      >
        <RowCheck checked={isSel} visible={sel.isSelecting} onClick={(e) => sel.toggle(block.id, e)} />
        <button
          onClick={(e) => {
            if (sel.rowClick(block.id, e)) return
            openTab({ entityType: 'code', entityId: block.id, title: block.title })
          }}
          className="flex-1 flex items-center gap-3 pl-2 pr-3 py-2.5 text-left min-w-0"
        >
          <Code2 size={14} className="text-th-tx-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-th-tx-1 truncate">{block.title || 'Untitled'}</p>
            <p className="text-xs text-th-tx-4">
              {block.language}
              {block.note_id ? ' · from note' : ''}
            </p>
          </div>
          <TagChips tags={blockTags} />
          <span className="text-xs text-th-tx-4 flex-shrink-0">
            {formatDate(archived ? (block.archived_at as number) : block.updated_at)}
          </span>
        </button>
        {block.is_pinned && !archived ? <Pin size={12} className="flex-shrink-0 text-accent" aria-label="Pinned" /> : null}
        <RowMenu
          tags={{
            allTags: filters.tags,
            assigned: blockTags,
            onAssign: (t) => filters.assign(block.id, t),
            onUnassign: (id) => filters.unassign(block.id, id),
            onCreate: (name) => filters.createAndAssign(block.id, name)
          }}
          items={[
            ...(archived
              ? []
              : [{
                  label: block.is_pinned ? 'Unpin' : 'Pin',
                  icon: <Pin size={13} />,
                  onClick: () => togglePin(block)
                }]),
            {
              label: archived ? 'Restore' : 'Archive',
              icon: archived ? <ArchiveRestore size={13} /> : <Archive size={13} />,
              onClick: () => setArchived(block, !archived)
            },
            { label: 'Delete', icon: <Trash2 size={13} />, danger: true, divider: true, onClick: () => deleteBlock(block) }
          ]}
        />
      </div>
    )
  }

  const heading = (text: string): React.JSX.Element => (
    <p className="px-3 py-1 text-xs text-th-tx-4 uppercase tracking-wider">{text}</p>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-th-bd-2 flex-shrink-0">
        <h1 className="text-sm font-medium text-th-tx-2">{showArchived ? 'Code: Archived' : 'Code'}</h1>
        <button
          onClick={createBlock}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-black text-xs font-medium transition-all"
        >
          <Plus size={13} />
          New Block
        </button>
      </div>

      <ListToolbar filters={filters} placeholder="Search code blocks..." />

      {sel.isSelecting && (
        <BulkBar
          count={sel.count}
          total={visibleIds.length}
          allTags={filters.tags}
          stateOf={(tagId) => {
            const c = filters.countWithTag(sel.selectedIds, tagId)
            return c === 0 ? 'none' : c === sel.count ? 'all' : 'some'
          }}
          onToggleTag={(tag, s) => (s === 'all' ? filters.unassignMany(sel.selectedIds, tag.id) : filters.assignMany(sel.selectedIds, tag))}
          onCreateTag={(name) => filters.createAndAssignMany(sel.selectedIds, name)}
          archivedView={showArchived}
          onArchiveToggle={bulkArchiveToggle}
          onDelete={bulkDelete}
          onSelectAll={sel.selectAll}
          onClear={sel.clear}
        />
      )}

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {showArchived ? (
          archivedGroups.map((g) => (
            <div key={g.key} className="mb-2">
              {heading(g.label)}
              {g.items.map(renderBlockRow)}
            </div>
          ))
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="mb-2">
                {heading('Pinned')}
                {pinned.map(renderBlockRow)}
              </div>
            )}
            {monthGroups.map((g) => (
              <div key={g.key} className="mb-2">
                {heading(g.label)}
                {g.items.map(renderBlockRow)}
              </div>
            ))}
          </>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-th-tx-5 text-xs py-8">
            {showArchived
              ? 'Nothing archived.'
              : filters.hasActiveFilters
                ? 'No code blocks match these filters.'
                : 'No code blocks yet.'}
          </p>
        )}
      </div>
    </div>
  )
}
