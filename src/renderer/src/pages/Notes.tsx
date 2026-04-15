import React, { useEffect, useState } from 'react'
import { Plus, Search, Pin, FileText } from 'lucide-react'
import { useAppStore } from '../store/appStore'

interface NoteItem {
  id: string
  title: string
  updated_at: number
  is_pinned: number
  all_work_items_done: number
}

export default function Notes(): React.JSX.Element {
  const { openTab } = useAppStore()
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

  const formatDate = (ts: number): string => {
    const diff = Date.now() - ts
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  const NoteRow = ({ note }: { note: NoteItem }): React.JSX.Element => (
    <button
      onClick={() => openTab({ entityType: 'note', entityId: note.id, title: note.title })}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left
        hover:bg-[#242424] group
        ${note.all_work_items_done ? 'opacity-50' : ''}
      `}
    >
      <FileText size={14} className="text-[#444] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#e5e5e5] truncate">{note.title || 'Untitled'}</p>
      </div>
      <span className="text-xs text-[#333] flex-shrink-0">{formatDate(note.updated_at)}</span>
      {note.is_pinned === 1 && <Pin size={11} className="text-accent flex-shrink-0" />}
    </button>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] flex-shrink-0">
        <h1 className="text-sm font-medium text-[#aaa]">Notes</h1>
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
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
          <Search size={12} className="text-[#444]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 bg-transparent text-xs text-[#e5e5e5] placeholder-[#333] outline-none"
          />
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {pinned.length > 0 && (
          <div className="mb-2">
            <p className="px-3 py-1 text-xs text-[#333] uppercase tracking-wider">Pinned</p>
            {pinned.map((n) => <NoteRow key={n.id} note={n} />)}
          </div>
        )}
        {active.map((n) => <NoteRow key={n.id} note={n} />)}
        {done.length > 0 && (
          <div className="mt-4">
            <p className="px-3 py-1 text-xs text-[#333] uppercase tracking-wider">Completed</p>
            {done.map((n) => <NoteRow key={n.id} note={n} />)}
          </div>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-[#333] text-xs py-8">No notes yet. Create one above.</p>
        )}
      </div>
    </div>
  )
}
