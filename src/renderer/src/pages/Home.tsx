import React, { useEffect, useState, useRef } from 'react'
import { FileText, Clock, AlertCircle, Pin, Search, Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks, Quote } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
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

  async function loadNotes(): Promise<void> {
    const all: NoteItem[] = (await window.api?.notes.getAll()) || []
    const recent = [...all].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8)
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
      className="flex items-center gap-3 p-3 rounded-lg bg-[#202020] hover:bg-[#282828] border border-[#383838] hover:border-[#484848] transition-all text-left w-full group"
    >
      <FileText size={14} className="text-[#888] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#f0f0f0] truncate">{note.title || 'Untitled'}</p>
        <p className="text-xs text-[#888] mt-0.5">{formatDate(note.updated_at)}</p>
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
          className="w-full flex items-center gap-3 px-4 py-3 bg-[#202020] border border-[#383838] rounded-xl text-[#888] hover:border-[#505050] hover:text-[#bbb] transition-all text-left"
        >
          <Search size={15} />
          <span className="text-sm">Search everything...</span>
          <span className="ml-auto text-xs text-[#666]">Ctrl+T</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="grid grid-cols-2 gap-8 max-w-4xl">
          {/* Recently opened */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={13} className="text-[#888]" />
              <h2 className="text-xs font-medium text-[#888] uppercase tracking-wider">
                Recently Opened
              </h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {recentNotes.length === 0 ? (
                <p className="text-xs text-[#666] py-2">No notes yet</p>
              ) : (
                recentNotes.map((note) => <NoteCard key={note.id} note={note} />)
              )}
            </div>
          </section>

          {/* Still active */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={13} className="text-[#888]" />
              <h2 className="text-xs font-medium text-[#888] uppercase tracking-wider">
                Still Active
              </h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {activeNotes.length === 0 ? (
                <p className="text-xs text-[#666] py-2">All caught up</p>
              ) : (
                activeNotes.map((note) => <NoteCard key={note.id} note={note} />)
              )}
            </div>
          </section>
        </div>

        {/* Quick Scratch Pad */}
        <div className="mt-8 max-w-4xl">
          <h2 className="text-xs font-medium text-[#888] uppercase tracking-wider mb-3">
            Quick Scratch Pad
          </h2>
          <div className="bg-[#202020] border border-[#383838] rounded-xl overflow-hidden">
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
                  className={`p-1 rounded transition-all ${b.active ? 'bg-[#383838] text-white' : 'text-[#666] hover:text-[#ccc] hover:bg-[#2a2a2a]'}`}>
                  {b.icon}
                </button>
              ))}
              <div className="w-px h-3 bg-[#383838] mx-0.5" />
              {(
                [
                  { icon: <List size={12} />, cmd: () => scratchEditor?.chain().focus().toggleBulletList().run(), active: !!scratchEditor?.isActive('bulletList'), title: 'Bullet list' },
                  { icon: <ListOrdered size={12} />, cmd: () => scratchEditor?.chain().focus().toggleOrderedList().run(), active: !!scratchEditor?.isActive('orderedList'), title: 'Numbered list' },
                  { icon: <ListChecks size={12} />, cmd: () => scratchEditor?.chain().focus().toggleTaskList().run(), active: !!scratchEditor?.isActive('taskList'), title: 'Task list' },
                ] as const
              ).map((b, i) => (
                <button key={i} onClick={b.cmd} title={b.title}
                  className={`p-1 rounded transition-all ${b.active ? 'bg-[#383838] text-white' : 'text-[#666] hover:text-[#ccc] hover:bg-[#2a2a2a]'}`}>
                  {b.icon}
                </button>
              ))}
              <div className="w-px h-3 bg-[#383838] mx-0.5" />
              <button onClick={() => scratchEditor?.chain().focus().toggleBlockquote().run()} title="Blockquote"
                className={`p-1 rounded transition-all ${scratchEditor?.isActive('blockquote') ? 'bg-[#383838] text-white' : 'text-[#666] hover:text-[#ccc] hover:bg-[#2a2a2a]'}`}>
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
                className="tiptap text-[14px] text-[#d8d8d8] leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
