import React, { useEffect, useState } from 'react'
import { Plus, GitBranch, Pin, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { groupByMonth } from '../lib/dateGroups'
import { useListFilters } from '../lib/tags'
import { useSelection } from '../lib/selection'
import { ListToolbar, TagChips } from '../components/TagUI'
import RowMenu from '../components/RowMenu'
import BulkBar, { RowCheck } from '../components/BulkBar'

interface FlowItem {
  id: string
  title: string
  note_id: string | null
  is_pinned: number
  archived_at: number | null
  created_at: number
  updated_at: number
}

function formatDate(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString()
}

export default function Flow(): React.JSX.Element {
  const { openTab, closeTab, tabs, showConfirm } = useAppStore()
  const [flows, setFlows] = useState<FlowItem[]>([])
  const filters = useListFilters('flow')
  const { showArchived } = filters

  useEffect(() => {
    loadFlows()
  }, [])

  async function loadFlows(): Promise<void> {
    const all: FlowItem[] = (await window.api?.flows.getAll()) || []
    setFlows(all)
  }

  async function createFlow(): Promise<void> {
    const flow = await window.api?.flows.create({ title: 'Untitled Flow' })
    if (flow) {
      setFlows((prev) => [flow, ...prev])
      openTab({ entityType: 'flow', entityId: flow.id, title: flow.title })
    }
  }

  const filtered = filters.applyFilters(flows)
  const pinned = filtered.filter((f) => f.is_pinned === 1)
  const rest = filtered.filter((f) => f.is_pinned === 0)

  // Sections in display order; selection ranges follow this order
  const archivedGroups = groupByMonth(filtered, (f) => f.archived_at as number)
  const monthGroups = groupByMonth(rest, (f) => f.updated_at)
  const visibleIds = showArchived
    ? archivedGroups.flatMap((g) => g.items.map((f) => f.id))
    : [...pinned, ...monthGroups.flatMap((g) => g.items)].map((f) => f.id)
  const sel = useSelection(visibleIds)

  async function handleTogglePin(flow: FlowItem): Promise<void> {
    await window.api?.flows.togglePin(flow.id)
    setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, is_pinned: f.is_pinned ? 0 : 1 } : f)))
  }

  async function setArchived(flow: FlowItem, archived: boolean): Promise<void> {
    const res = await window.api?.archive.set('flow', flow.id, archived)
    setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, archived_at: res?.archivedAt ?? null } : f)))
  }

  function closeTabsFor(ids: string[]): void {
    for (const id of ids) {
      const tab = tabs.find((t) => t.entityType === 'flow' && t.entityId === id)
      if (tab) closeTab(tab.id)
    }
  }

  async function handleDelete(flow: FlowItem): Promise<void> {
    if (!await showConfirm(`Delete "${flow.title || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.flows.delete(flow.id)
    setFlows((prev) => prev.filter((f) => f.id !== flow.id))
    closeTabsFor([flow.id])
  }

  // ─── Bulk actions ───────────────────────────────────────────────────────────

  async function bulkArchiveToggle(): Promise<void> {
    const ids = sel.selectedIds
    const archive = !showArchived
    const results = await Promise.all(ids.map((id) => window.api?.archive.set('flow', id, archive)))
    const at = new Map(ids.map((id, i) => [id, results[i]?.archivedAt ?? null]))
    setFlows((prev) => prev.map((f) => (at.has(f.id) ? { ...f, archived_at: at.get(f.id) ?? null } : f)))
    sel.clear()
  }

  async function bulkDelete(): Promise<void> {
    const ids = sel.selectedIds
    if (!await showConfirm(`Delete ${ids.length} flow${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    await Promise.all(ids.map((id) => window.api?.flows.delete(id)))
    const gone = new Set(ids)
    setFlows((prev) => prev.filter((f) => !gone.has(f.id)))
    closeTabsFor(ids)
    sel.clear()
  }

  // A plain function (not a component) so row state survives re-renders
  const renderFlowRow = (flow: FlowItem): React.JSX.Element => {
    const flowTags = filters.tagsFor(flow.id)
    const archived = !!flow.archived_at
    const isSel = sel.isSelected(flow.id)
    return (
      <div
        key={flow.id}
        className={`flex items-center gap-1 rounded-lg transition-all group select-none ${
          isSel ? 'bg-th-bg-5' : 'hover:bg-th-bg-5'
        } ${archived && !isSel ? 'opacity-50 hover:opacity-100' : ''}`}
      >
        <RowCheck checked={isSel} visible={sel.isSelecting} onClick={(e) => sel.toggle(flow.id, e)} />
        <button
          onClick={(e) => {
            if (sel.rowClick(flow.id, e)) return
            openTab({ entityType: 'flow', entityId: flow.id, title: flow.title })
          }}
          className="flex-1 flex items-center gap-3 pl-2 pr-3 py-2.5 text-left min-w-0"
        >
          <GitBranch size={14} className="text-th-tx-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-th-tx-1 truncate">{flow.title || 'Untitled'}</p>
            {flow.note_id && <p className="text-xs text-th-tx-4">from note</p>}
          </div>
          <TagChips tags={flowTags} />
          <span className="text-xs text-th-tx-4 flex-shrink-0">
            {formatDate(archived ? (flow.archived_at as number) : flow.updated_at)}
          </span>
        </button>
        {flow.is_pinned && !archived ? <Pin size={12} className="flex-shrink-0 text-accent" aria-label="Pinned" /> : null}
        <RowMenu
          tags={{
            allTags: filters.tags,
            assigned: flowTags,
            onAssign: (t) => filters.assign(flow.id, t),
            onUnassign: (id) => filters.unassign(flow.id, id),
            onCreate: (name) => filters.createAndAssign(flow.id, name)
          }}
          items={[
            ...(archived
              ? []
              : [{
                  label: flow.is_pinned ? 'Unpin' : 'Pin',
                  icon: <Pin size={13} />,
                  onClick: () => handleTogglePin(flow)
                }]),
            {
              label: archived ? 'Restore' : 'Archive',
              icon: archived ? <ArchiveRestore size={13} /> : <Archive size={13} />,
              onClick: () => setArchived(flow, !archived)
            },
            { label: 'Delete', icon: <Trash2 size={13} />, danger: true, divider: true, onClick: () => handleDelete(flow) }
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
        <h1 className="text-sm font-medium text-th-tx-2">{showArchived ? 'Flow: Archived' : 'Flow'}</h1>
        <button
          onClick={createFlow}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-black text-xs font-medium transition-all"
        >
          <Plus size={13} />
          New Flow
        </button>
      </div>

      <ListToolbar filters={filters} placeholder="Search flows..." />

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
              {g.items.map(renderFlowRow)}
            </div>
          ))
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="mb-2">
                {heading('Pinned')}
                {pinned.map(renderFlowRow)}
              </div>
            )}
            {monthGroups.map((g) => (
              <div key={g.key} className="mb-2">
                {heading(g.label)}
                {g.items.map(renderFlowRow)}
              </div>
            ))}
          </>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-th-tx-5 text-xs py-8">
            {showArchived
              ? 'Nothing archived.'
              : filters.hasActiveFilters
                ? 'No flows match these filters.'
                : 'No flows yet. Create one to get started.'}
          </p>
        )}
      </div>
    </div>
  )
}
