import React, { useEffect, useState, useRef } from 'react'
import { FileText, Clock, AlertCircle, Pin, Search, Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks, Quote, CheckSquare } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useAppStore } from '../store/appStore'
import { TYPE_COLORS, STATE_COLORS, DONE_STATES } from '../lib/workItemUtils'

interface NoteItem {
  id: string
  title: string
  updated_at: number
  is_pinned: number
  linked_work_item_count: number
  active_work_item_count: number
}

interface WorkItemSummary {
  item_number: string
  cached_title: string | null
  cached_type: string | null
  cached_state: string | null
  cached_assigned_to: string | null
  is_ado: number
}

export default function Home(): React.JSX.Element {
  const { openTab, setSearchOpen } = useAppStore()
  const [recentNotes, setRecentNotes] = useState<NoteItem[]>([])
  const [activeNotes, setActiveNotes] = useState<NoteItem[]>([])
  const [openWorkItems, setOpenWorkItems] = useState<WorkItemSummary[]>([])
  const scratchSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scratchLoaded = useRef(false)
  const pendingScratch = useRef<any>(null)

  const scratchEditor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Quick notes, links, anything...' })
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!scratchLoaded.current) return
      if (scratchSaveTimer.current) clearTimeout(scratchSaveTimer.current)
      scratchSaveTimer.current = setTimeout(() => {
        window.api?.todo.save(JSON.stringify(editor.getJSON()))
      }, 500)
    }
  })

  useEffect(() => {
    loadNotes()
    loadScratch()
    loadOpenWorkItems()
  }, [])

  // Apply pending scratch content once editor is ready
  useEffect(() => {
    if (scratchEditor && pendingScratch.current !== null) {
      scratchEditor.commands.setContent(pendingScratch.current, false)
      pendingScratch.current = null
      scratchLoaded.current = true
    }
  }, [scratchEditor])

  async function loadScratch(): Promise<void> {
    const row = await window.api?.todo.get()
    if (!row?.content || row.content === '{}') {
      scratchLoaded.current = true
      return
    }
    try {
      const parsed = JSON.parse(row.content)
      if (scratchEditor) {
        scratchEditor.commands.setContent(parsed, false)
        scratchLoaded.current = true
      } else {
        pendingScratch.current = parsed
      }
    } catch {
      scratchLoaded.current = true
    }
  }

  async function loadOpenWorkItems(): Promise<void> {
    const all: WorkItemSummary[] = (await window.api?.workItems.getAll()) || []
    const open = all.filter((wi) => {
      if (wi.is_ado && wi.cached_state) return !DONE_STATES.has(wi.cached_state)
      return true // non-ADO items without state always show
    }).slice(0, 8)
    setOpenWorkItems(open)
  }

  async function loadNotes(): Promise<void> {
    const all: NoteItem[] = (await window.api?.notes.getAll()) || []
    const recent = [...all].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8)
    const active = all.filter((n) => n.active_work_item_count > 0 && n.is_pinned === 0).slice(0, 8)
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
      className="flex items-center gap-3 p-3 rounded-lg bg-th-bg-4 hover:bg-th-bg-6 border border-th-bd-2 hover:border-th-bd-3 transition-all text-left w-full group"
    >
      <FileText size={14} className="text-th-tx-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-th-tx-1 truncate">{note.title || 'Untitled'}</p>
        <p className="text-xs text-th-tx-4 mt-0.5">{formatDate(note.updated_at)}</p>
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
          className="w-full flex items-center gap-3 px-4 py-3 bg-th-bg-4 border border-th-bd-2 rounded-xl text-th-tx-4 hover:border-th-bd-3 hover:text-th-tx-2 transition-all text-left"
        >
          <Search size={15} />
          <span className="text-sm">Search everything...</span>
          <span className="ml-auto text-xs text-th-tx-5">Ctrl+T</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className={`grid gap-8 max-w-5xl ${openWorkItems.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {/* Recently opened */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={13} className="text-th-tx-4" />
              <h2 className="text-xs font-medium text-th-tx-4 uppercase tracking-wider">Recently Opened</h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {recentNotes.length === 0 ? (
                <p className="text-xs text-th-tx-5 py-2">No notes yet</p>
              ) : (
                recentNotes.map((note) => <NoteCard key={note.id} note={note} />)
              )}
            </div>
          </section>

          {/* Still active */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={13} className="text-th-tx-4" />
              <h2 className="text-xs font-medium text-th-tx-4 uppercase tracking-wider">Still Active</h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {activeNotes.length === 0 ? (
                <p className="text-xs text-th-tx-5 py-2">All caught up</p>
              ) : (
                activeNotes.map((note) => <NoteCard key={note.id} note={note} />)
              )}
            </div>
          </section>

          {/* Open work items */}
          {openWorkItems.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckSquare size={13} className="text-th-tx-4" />
                <h2 className="text-xs font-medium text-th-tx-4 uppercase tracking-wider">Open Work Items</h2>
              </div>
              <div className="flex flex-col gap-1.5">
                {openWorkItems.map((wi) => {
                  const typeColor = TYPE_COLORS[wi.cached_type || ''] || '#555'
                  const stateColor = STATE_COLORS[wi.cached_state || ''] || '#888'
                  return (
                    <button
                      key={wi.item_number}
                      onClick={() => openTab({ entityType: 'work-item', entityId: wi.item_number, title: wi.cached_title || `#${wi.item_number}` })}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-th-bg-4 hover:bg-th-bg-6 border border-th-bd-2 hover:border-th-bd-3 transition-all text-left w-full"
                    >
                      <CheckSquare size={13} className="text-th-tx-6 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-th-tx-1 truncate">{wi.cached_title || `#${wi.item_number}`}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {wi.cached_type && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                              style={{ background: typeColor + '22', color: typeColor, border: `1px solid ${typeColor}44` }}>
                              {wi.cached_type}
                            </span>
                          )}
                          {wi.cached_state && (
                            <span className="text-[10px]" style={{ color: stateColor }}>
                              {wi.cached_state}
                            </span>
                          )}
                          {wi.cached_assigned_to && (
                            <span className="text-[10px] text-th-tx-6 truncate">{wi.cached_assigned_to}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Quick Scratch Pad */}
        <div className="mt-8 max-w-4xl">
          <h2 className="text-xs font-medium text-th-tx-4 uppercase tracking-wider mb-3">
            Quick Scratch Pad
          </h2>
          <div className="bg-th-bg-4 border border-th-bd-2 rounded-xl overflow-hidden">
            {/* Compact toolbar */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#2e2e2e]">
              {(
                [
                  { icon: <Bold size={12} />, cmd: () => scratchEditor?.chain().focus().toggleBold().run(), active: !!scratchEditor?.isActive('bold'), title: 'Bold' },
                  { icon: <Italic size={12} />, cmd: () => scratchEditor?.chain().focus().toggleItalic().run(), active: !!scratchEditor?.isActive('italic'), title: 'Italic' },
                  { icon: <UnderlineIcon size={12} />, cmd: () => scratchEditor?.chain().focus().toggleUnderline().run(), active: !!scratchEditor?.isActive('underline'), title: 'Underline' },
                  { icon: <Strikethrough size={12} />, cmd: () => scratchEditor?.chain().focus().toggleStrike().run(), active: !!scratchEditor?.isActive('strike'), title: 'Strikethrough' },
                ] as const
              ).map((b, i) => (
                <button key={i} onClick={b.cmd} title={b.title}
                  className={`p-1 rounded transition-all ${b.active ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-5 hover:text-th-tx-2 hover:bg-th-bg-6'}`}>
                  {b.icon}
                </button>
              ))}
              <div className="w-px h-3 bg-th-bd-2 mx-0.5" />
              {(
                [
                  { icon: <List size={12} />, cmd: () => scratchEditor?.chain().focus().toggleBulletList().run(), active: !!scratchEditor?.isActive('bulletList'), title: 'Bullet list' },
                  { icon: <ListOrdered size={12} />, cmd: () => scratchEditor?.chain().focus().toggleOrderedList().run(), active: !!scratchEditor?.isActive('orderedList'), title: 'Numbered list' },
                  { icon: <ListChecks size={12} />, cmd: () => scratchEditor?.chain().focus().toggleTaskList().run(), active: !!scratchEditor?.isActive('taskList'), title: 'Task list' },
                ] as const
              ).map((b, i) => (
                <button key={i} onClick={b.cmd} title={b.title}
                  className={`p-1 rounded transition-all ${b.active ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-5 hover:text-th-tx-2 hover:bg-th-bg-6'}`}>
                  {b.icon}
                </button>
              ))}
              <div className="w-px h-3 bg-th-bd-2 mx-0.5" />
              <button onClick={() => scratchEditor?.chain().focus().toggleBlockquote().run()} title="Blockquote"
                className={`p-1 rounded transition-all ${scratchEditor?.isActive('blockquote') ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-5 hover:text-th-tx-2 hover:bg-th-bg-6'}`}>
                <Quote size={12} />
              </button>
            </div>
            {/* Editor content */}
            <div
              className="px-5 py-4 min-h-[120px] cursor-text"
              onClick={() => scratchEditor?.commands.focus()}
            >
              <EditorContent
                editor={scratchEditor}
                className="tiptap text-[14px] text-th-tx-2 leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
