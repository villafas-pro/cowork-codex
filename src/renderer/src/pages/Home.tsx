import React, { useEffect, useState } from 'react'
import { FileText, Clock, AlertCircle, Pin, Search } from 'lucide-react'
import { useAppStore } from '../store/appStore'

interface NoteItem {
  id: string
  title: string
  updated_at: number
  is_pinned: number
  all_work_items_done: number
}

export default function Home(): React.JSX.Element {
  const { openTab, setSearchOpen } = useAppStore()
  const [recentNotes, setRecentNotes] = useState<NoteItem[]>([])
  const [activeNotes, setActiveNotes] = useState<NoteItem[]>([])

  useEffect(() => {
    loadNotes()
  }, [])

  async function loadNotes(): Promise<void> {
    const all: NoteItem[] = (await window.api?.notes.getAll()) || []
    // Recently opened: last 8 updated
    const recent = [...all].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8)
    // Still active: has undone work items
    const active = all.filter((n) => !n.all_work_items_done && n.is_pinned === 0).slice(0, 8)
    setRecentNotes(recent)
    setActiveNotes(active)
  }

  const formatDate = (ts: number): string => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - ts
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  }

  const NoteCard = ({ note }: { note: NoteItem }): React.JSX.Element => (
    <button
      onClick={() => openTab({ entityType: 'note', entityId: note.id, title: note.title })}
      className="flex items-center gap-3 p-3 rounded-lg bg-[#1e1e1e] hover:bg-[#242424] border border-[#2a2a2a] hover:border-[#333] transition-all text-left w-full group"
    >
      <FileText size={14} className="text-[#555] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#e5e5e5] truncate">{note.title || 'Untitled'}</p>
        <p className="text-xs text-[#444] mt-0.5">{formatDate(note.updated_at)}</p>
      </div>
      {note.is_pinned === 1 && <Pin size={11} className="text-accent flex-shrink-0" />}
    </button>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search bar */}
      <div className="px-8 pt-8 pb-4 flex-shrink-0">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl text-[#444] hover:border-[#333] hover:text-[#666] transition-all text-left"
        >
          <Search size={15} />
          <span className="text-sm">Search everything...</span>
          <span className="ml-auto text-xs text-[#2a2a2a]">Ctrl+T</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="grid grid-cols-2 gap-8 max-w-4xl">
          {/* Recently opened */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={13} className="text-[#555]" />
              <h2 className="text-xs font-medium text-[#555] uppercase tracking-wider">
                Recently Opened
              </h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {recentNotes.length === 0 ? (
                <p className="text-xs text-[#333] py-2">No notes yet</p>
              ) : (
                recentNotes.map((note) => <NoteCard key={note.id} note={note} />)
              )}
            </div>
          </section>

          {/* Still active */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={13} className="text-[#555]" />
              <h2 className="text-xs font-medium text-[#555] uppercase tracking-wider">
                Still Active
              </h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {activeNotes.length === 0 ? (
                <p className="text-xs text-[#333] py-2">All caught up</p>
              ) : (
                activeNotes.map((note) => <NoteCard key={note.id} note={note} />)
              )}
            </div>
          </section>
        </div>

        {/* To Do section */}
        <div className="mt-8 max-w-4xl">
          <h2 className="text-xs font-medium text-[#555] uppercase tracking-wider mb-3">
            Quick Scratch Pad
          </h2>
          <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4 min-h-[120px]">
            <p className="text-[#333] text-sm">Todo scratch pad coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
