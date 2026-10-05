import React, { useEffect, useState } from 'react'
import { Plus, Pin, FileText, Trash2, Lock, KeyRound, Archive, ArchiveRestore } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { groupByMonth } from '../lib/dateGroups'
import { useListFilters } from '../lib/tags'
import { useSelection } from '../lib/selection'
import { ListToolbar, TagChips } from '../components/TagUI'
import RowMenu from '../components/RowMenu'
import BulkBar, { RowCheck } from '../components/BulkBar'

interface NoteItem {
  id: string
  title: string
  updated_at: number
  archived_at: number | null
  is_pinned: number
  is_locked: number
  has_password: number
  all_work_items_done: number
}

export default function Notes(): React.JSX.Element {
  const { openTab, closeTab, tabs, showConfirm } = useAppStore()
  const [notes, setNotes] = useState<NoteItem[]>([])
  const filters = useListFilters('note')
  const { showArchived } = filters

  useEffect(() => {
    loadNotes()
  }, [])

  async function loadNotes(): Promise<void> {
    const all: NoteItem[] = (await window.api?.notes.getAll()) || []
    setNotes(all)
  }

  async function createNote(): Promise<void> {
    const note = await window.api?.notes.create({ title: 'Untitled' })
    if (note) {
      setNotes((prev) => [note, ...prev])
      openTab({ entityType: 'note', entityId: note.id, title: note.title })
    }
  }

  const filtered = filters.applyFilters(notes)
  const pinned = filtered.filter((n) => n.is_pinned)
  const active = filtered.filter((n) => !n.is_pinned && !n.all_work_items_done)
  const done = filtered.filter((n) => !n.is_pinned && n.all_work_items_done)

  // Sections in display order; selection ranges follow this order
  const archivedGroups = groupByMonth(filtered, (n) => n.archived_at as number)
  const monthGroups = groupByMonth(active, (n) => n.updated_at)
  const visibleIds = showArchived
    ? archivedGroups.flatMap((g) => g.items.map((n) => n.id))
    : [...pinned, ...monthGroups.flatMap((g) => g.items), ...done].map((n) => n.id)
  const sel = useSelection(visibleIds)

  async function togglePin(note: NoteItem): Promise<void> {
    await window.api?.notes.togglePin(note.id)
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_pinned: n.is_pinned ? 0 : 1 } : n)))
  }

  async function toggleLock(note: NoteItem): Promise<void> {
    await window.api?.notes.toggleLock(note.id)
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_locked: n.is_locked ? 0 : 1 } : n)))
  }

  async function setArchived(note: NoteItem, archived: boolean): Promise<void> {
    const res = await window.api?.archive.set('note', note.id, archived)
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, archived_at: res?.archivedAt ?? null } : n)))
  }

  async function archiveCompleted(): Promise<void> {
    if (!await showConfirm(`Archive ${done.length} completed note${done.length === 1 ? '' : 's'}? You can restore them from the Archived view.`)) return
    await window.api?.archive.archiveCompletedNotes()
    await loadNotes()
  }

  function closeTabsFor(ids: string[]): void {
    for (const id of ids) {
      const tab = tabs.find((t) => t.entityType === 'note' && t.entityId === id)
      if (tab) closeTab(tab.id)
    }
  }

  async function deleteNote(note: NoteItem): Promise<void> {
    if (!await showConfirm(`Delete "${note.title || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.notes.delete(note.id)
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    closeTabsFor([note.id])
  }

  // ─── Bulk actions ───────────────────────────────────────────────────────────

  async function bulkArchiveToggle(): Promise<void> {
    const ids = sel.selectedIds
    const archive = !showArchived
    const results = await Promise.all(ids.map((id) => window.api?.archive.set('note', id, archive)))
    const at = new Map(ids.map((id, i) => [id, results[i]?.archivedAt ?? null]))
    setNotes((prev) => prev.map((n) => (at.has(n.id) ? { ...n, archived_at: at.get(n.id) ?? null } : n)))
    sel.clear()
  }

  async function bulkDelete(): Promise<void> {
    // Locked notes are protected from deletion, so they are skipped
    const chosen = notes.filter((n) => sel.selected.has(n.id))
    const deletable = chosen.filter((n) => !n.is_locked)
    const skipped = chosen.length - deletable.length
    if (deletable.length === 0) {
      await showConfirm(`The ${chosen.length === 1 ? 'selected note is' : 'selected notes are'} locked. Unlock to delete.`)
      return
    }
    const msg =
      `Delete ${deletable.length} note${deletable.length === 1 ? '' : 's'}? This cannot be undone.` +
      (skipped > 0 ? ` ${skipped} locked note${skipped === 1 ? '' : 's'} will be skipped.` : '')
    if (!await showConfirm(msg)) return
    const ids = deletable.map((n) => n.id)
    await Promise.all(ids.map((id) => window.api?.notes.delete(id)))
    const gone = new Set(ids)
    setNotes((prev) => prev.filter((n) => !gone.has(n.id)))
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
  const renderNoteRow = (note: NoteItem): React.JSX.Element => {
    const noteTags = filters.tagsFor(note.id)
    const archived = !!note.archived_at
    const isSel = sel.isSelected(note.id)
    return (
      <div
        key={note.id}
        className={`flex items-center gap-1 rounded-lg transition-all group select-none ${
          isSel ? 'bg-th-bg-5' : 'hover:bg-th-bg-5'
        } ${(note.all_work_items_done || archived) && !isSel ? 'opacity-50 hover:opacity-100' : ''}`}
      >
        <RowCheck checked={isSel} visible={sel.isSelecting} onClick={(e) => sel.toggle(note.id, e)} />
        <button
          onClick={(e) => {
            if (sel.rowClick(note.id, e)) return
            openTab({ entityType: 'note', entityId: note.id, title: note.title })
          }}
          className="flex-1 flex items-center gap-3 pl-2 pr-3 py-2.5 text-left min-w-0"
        >
          <FileText size={14} className="text-th-tx-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-th-tx-1 truncate">{note.title || 'Untitled'}</p>
          </div>
          <TagChips tags={noteTags} />
          <span className="text-xs text-th-tx-4 flex-shrink-0">
            {formatDate(archived ? (note.archived_at as number) : note.updated_at)}
          </span>
        </button>
        {/* Status indicators: only shown when active. Everything else lives in the menu. */}
        {note.has_password ? (
          <span className="flex-shrink-0 text-[#e8b800]" title="Password protected"><KeyRound size={12} /></span>
        ) : null}
        {note.is_locked ? (
          <span className="flex-shrink-0 text-[#e8b800]" title="Locked (protected from deletion)"><Lock size={12} /></span>
        ) : null}
        {note.is_pinned && !archived ? (
          <span className="flex-shrink-0 text-accent" title="Pinned"><Pin size={12} /></span>
        ) : null}
        <RowMenu
          tags={{
            allTags: filters.tags,
            assigned: noteTags,
            onAssign: (t) => filters.assign(note.id, t),
            onUnassign: (id) => filters.unassign(note.id, id),
            onCreate: (name) => filters.createAndAssign(note.id, name)
          }}
          items={[
            ...(archived
              ? []
              : [
                  {
                    label: note.is_pinned ? 'Unpin' : 'Pin',
                    icon: <Pin size={13} />,
                    onClick: () => togglePin(note)
                  },
                  {
                    label: note.is_locked ? 'Unlock' : 'Lock',
                    icon: <Lock size={13} />,
                    onClick: () => toggleLock(note)
                  }
                ]),
            {
              label: archived ? 'Restore' : 'Archive',
              icon: archived ? <ArchiveRestore size={13} /> : <Archive size={13} />,
              onClick: () => setArchived(note, !archived)
            },
            {
              label: 'Delete',
              icon: <Trash2 size={13} />,
              danger: true,
              divider: true,
              disabled: !!note.is_locked,
              hint: note.is_locked ? 'Locked' : undefined,
              onClick: () => deleteNote(note)
            }
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-th-bd-2 flex-shrink-0">
        <h1 className="text-sm font-medium text-th-tx-2">{showArchived ? 'Notes: Archived' : 'Notes'}</h1>
        <button
          onClick={createNote}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-black text-xs font-medium transition-all"
        >
          <Plus size={13} />
          New Note
        </button>
      </div>

      <ListToolbar filters={filters} placeholder="Search notes..." />

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

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {showArchived ? (
          archivedGroups.map((g) => (
            <div key={g.key} className="mb-2">
              {heading(g.label)}
              {g.items.map(renderNoteRow)}
            </div>
          ))
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="mb-2">
                {heading('Pinned')}
                {pinned.map(renderNoteRow)}
              </div>
            )}
            {monthGroups.map((g) => (
              <div key={g.key} className="mb-2">
                {heading(g.label)}
                {g.items.map(renderNoteRow)}
              </div>
            ))}
            {done.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between pr-3">
                  {heading('Completed')}
                  <button
                    onClick={archiveCompleted}
                    className="text-[11px] text-th-tx-4 hover:text-accent transition-colors"
                    title="Move all completed notes to the archive"
                  >
                    Archive all
                  </button>
                </div>
                {done.map(renderNoteRow)}
              </div>
            )}
          </>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-th-tx-5 text-xs py-8">
            {showArchived
              ? 'Nothing archived.'
              : filters.hasActiveFilters
                ? 'No notes match these filters.'
                : 'No notes yet. Create one above.'}
          </p>
        )}
      </div>
    </div>
  )
}
