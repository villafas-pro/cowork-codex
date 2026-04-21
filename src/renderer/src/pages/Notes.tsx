import React, { useEffect, useState } from 'react'
import { Plus, Search, Pin, FileText, Trash2, X, Lock, KeyRound } from 'lucide-react'
import { useAppStore } from '../store/appStore'

interface NoteItem {
  id: string
  title: string
  updated_at: number
  is_pinned: number
  is_locked: number
  has_password: number
  all_work_items_done: number
}

export default function Notes(): React.JSX.Element {
  const { openTab, closeTab, tabs } = useAppStore()
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [search, setSearch] = useState('')

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

  const filtered = notes.filter((n) =>
    n.title.toLowerCase().includes(search.toLowerCase())
  )

  const pinned = filtered.filter((n) => n.is_pinned)
  const active = filtered.filter((n) => !n.is_pinned && !n.all_work_items_done)
  const done = filtered.filter((n) => !n.is_pinned && n.all_work_items_done)

  async function togglePin(note: NoteItem, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    await window.api?.notes.togglePin(note.id)
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, is_pinned: n.is_pinned ? 0 : 1 } : n))
    )
  }

  async function toggleLock(note: NoteItem, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    await window.api?.notes.toggleLock(note.id)
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, is_locked: n.is_locked ? 0 : 1 } : n))
    )
  }

  async function deleteNote(note: NoteItem, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    if (!window.confirm(`Delete "${note.title || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.notes.delete(note.id)
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    // Close the tab if it's open
    const tab = tabs.find((t) => t.entityType === 'note' && t.entityId === note.id)
    if (tab) closeTab(tab.id)
  }

  const formatDate = (ts: number): string => {
    const diff = Date.now() - ts
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  const NoteRow = ({ note }: { note: NoteItem }): React.JSX.Element => (
    <div
      className={`
        flex items-center gap-1 rounded-lg transition-all group
        hover:bg-th-bg-5
        ${note.all_work_items_done ? 'opacity-50' : ''}
      `}
    >
      <button
        onClick={() => openTab({ entityType: 'note', entityId: note.id, title: note.title })}
        className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left min-w-0"
      >
        <FileText size={14} className="text-th-tx-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-th-tx-1 truncate">{note.title || 'Untitled'}</p>
        </div>
        <span className="text-xs text-th-tx-4 flex-shrink-0">{formatDate(note.updated_at)}</span>
      </button>
      {note.has_password ? (
        <span className="flex-shrink-0 p-1.5 text-[#e8b800]" title="Password protected">
          <KeyRound size={13} />
        </span>
      ) : null}
      <button
        onClick={(e) => toggleLock(note, e)}
        className={`flex-shrink-0 p-1.5 rounded transition-colors ${note.is_locked ? 'text-[#e8b800]' : 'text-transparent group-hover:text-th-tx-6 hover:!text-[#e8b800]'}`}
        title={note.is_locked ? 'Unlock note' : 'Lock note'}
      >
        <Lock size={13} />
      </button>
      <button
        onClick={(e) => togglePin(note, e)}
        className={`flex-shrink-0 p-1.5 rounded transition-colors ${note.is_pinned ? 'text-accent' : 'text-transparent group-hover:text-th-tx-6 hover:!text-accent'}`}
        title={note.is_pinned ? 'Unpin' : 'Pin'}
      >
        <Pin size={13} />
      </button>
      <button
        onClick={(e) => deleteNote(note, e)}
        className={`flex-shrink-0 p-1.5 mr-1 rounded transition-colors ${note.is_locked ? 'text-transparent cursor-not-allowed' : 'text-transparent group-hover:text-th-tx-6 hover:!text-red-400'}`}
        title={note.is_locked ? 'Unlock note to delete' : 'Delete note'}
        disabled={!!note.is_locked}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-th-bd-2 flex-shrink-0">
        <h1 className="text-sm font-medium text-th-tx-2">Notes</h1>
        <button
          onClick={createNote}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs transition-all"
        >
          <Plus size={13} />
          New Note
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-th-bg-3 border border-th-bd-2 rounded-lg focus-within:border-th-bd-3 transition-colors">
          <Search size={12} className="text-th-tx-4 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 bg-transparent text-xs text-th-tx-1 placeholder-th-tx-5 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-th-tx-6 hover:text-th-tx-3 transition-colors flex-shrink-0">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {pinned.length > 0 && (
          <div className="mb-2">
            <p className="px-3 py-1 text-xs text-th-tx-4 uppercase tracking-wider">Pinned</p>
            {pinned.map((n) => <NoteRow key={n.id} note={n} />)}
          </div>
        )}
        {active.map((n) => <NoteRow key={n.id} note={n} />)}
        {done.length > 0 && (
          <div className="mt-4">
            <p className="px-3 py-1 text-xs text-th-tx-4 uppercase tracking-wider">Completed</p>
            {done.map((n) => <NoteRow key={n.id} note={n} />)}
          </div>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-th-tx-5 text-xs py-8">No notes yet. Create one above.</p>
        )}
      </div>
    </div>
  )
}
