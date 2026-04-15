import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2,
  Plus, ExternalLink, CheckSquare, Square, Link2, Clipboard, X, Pin, Trash2
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface WorkItem {
  id: string
  url: string
  item_number: string
  is_done: number
}

export default function NoteEditor({ noteId }: { noteId: string }): React.JSX.Element {
  const { updateTabTitle, closeTab, tabs, setActiveSection } = useAppStore()
  const [title, setTitle] = useState('')
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [newItemUrl, setNewItemUrl] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  // Refs to avoid stale closures in async callbacks
  const titleRef = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContent = useRef<any>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Underline,
      Placeholder.configure({ placeholder: 'Start writing...' })
    ],
    content: '',
    onUpdate: ({ editor }) => {
      scheduleSave(titleRef.current, editor.getJSON())
    }
  })

  // Load note whenever noteId changes
  useEffect(() => {
    pendingContent.current = null
    loadNote()
    loadWorkItems()
  }, [noteId])

  // Once editor is ready, apply any pending content
  useEffect(() => {
    if (editor && pendingContent.current !== null) {
      editor.commands.setContent(pendingContent.current, false)
      pendingContent.current = null
    }
  }, [editor])

  async function loadNote(): Promise<void> {
    const note = await window.api?.notes.get(noteId)
    if (!note) return

    const t = note.title || ''
    setTitle(t)
    titleRef.current = t
    setIsPinned(!!note.is_pinned)
    updateTabTitle(noteId, t || 'Untitled')

    if (note.content && note.content !== '{}') {
      try {
        const parsed = JSON.parse(note.content)
        if (editor) {
          editor.commands.setContent(parsed, false)
        } else {
          pendingContent.current = parsed
        }
      } catch {
        // plain text fallback
      }
    }
  }

  async function loadWorkItems(): Promise<void> {
    const items = await window.api?.workItems.getForEntity('note', noteId)
    setWorkItems(items || [])
  }

  const scheduleSave = useCallback((currentTitle: string, content: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.api?.notes.update(noteId, {
        title: currentTitle,
        content: JSON.stringify(content)
      })
    }, 500)
  }, [noteId])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value
    setTitle(val)
    titleRef.current = val
    updateTabTitle(noteId, val || 'Untitled')
    if (editor) scheduleSave(val, editor.getJSON())
  }

  const togglePin = async (): Promise<void> => {
    await window.api?.notes.togglePin(noteId)
    setIsPinned((p) => !p)
  }

  const deleteNote = async (): Promise<void> => {
    if (!window.confirm(`Delete "${titleRef.current || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.notes.delete(noteId)
    const tab = tabs.find((t) => t.entityType === 'note' && t.entityId === noteId)
    if (tab) closeTab(tab.id)
    setActiveSection('notes')
  }

  const addWorkItem = async (url?: string): Promise<void> => {
    const target = url || newItemUrl.trim()
    if (!target) return
    const item = await window.api?.workItems.create(target, 'note', noteId)
    if (item) {
      setWorkItems((prev) => [...prev, item])
      setNewItemUrl('')
      setShowAddItem(false)
    }
  }

  const pasteWorkItem = async (): Promise<void> => {
    const text = await navigator.clipboard.readText()
    if (text.trim()) await addWorkItem(text.trim())
  }

  const toggleWorkItem = async (id: string): Promise<void> => {
    await window.api?.workItems.toggleDone(id)
    setWorkItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_done: i.is_done ? 0 : 1 } : i)))
  }

  const removeWorkItem = async (workItemId: string): Promise<void> => {
    await window.api?.workItems.unlink(workItemId, 'note', noteId)
    setWorkItems((prev) => prev.filter((i) => i.id !== workItemId))
  }

  const allDone = workItems.length > 0 && workItems.every((i) => i.is_done)

  const toolbarBtn = (active: boolean): string =>
    `p-1.5 rounded transition-all ${active ? 'bg-[#383838] text-white' : 'text-[#888] hover:text-[#ddd] hover:bg-[#2a2a2a]'}`

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#303030] bg-[#141414] flex-shrink-0">
          <button onClick={() => editor?.chain().focus().toggleBold().run()} className={toolbarBtn(!!editor?.isActive('bold'))} title="Bold (Ctrl+B)">
            <Bold size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={toolbarBtn(!!editor?.isActive('italic'))} title="Italic (Ctrl+I)">
            <Italic size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleUnderline().run()} className={toolbarBtn(!!editor?.isActive('underline'))} title="Underline (Ctrl+U)">
            <UnderlineIcon size={13} />
          </button>
          <div className="w-px h-4 bg-[#383838] mx-1" />
          <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={toolbarBtn(!!editor?.isActive('heading', { level: 1 }))} title="Heading 1">
            <Heading1 size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={toolbarBtn(!!editor?.isActive('heading', { level: 2 }))} title="Heading 2">
            <Heading2 size={13} />
          </button>
          <div className="flex-1" />
          <button onClick={togglePin} className={`p-1.5 rounded transition-all ${isPinned ? 'text-accent' : 'text-[#666] hover:text-[#ddd]'}`} title={isPinned ? 'Unpin' : 'Pin note'}>
            <Pin size={13} />
          </button>
          <button onClick={deleteNote} className="p-1.5 rounded transition-all text-[#666] hover:text-red-400 hover:bg-[#2a1a1a]" title="Delete note">
            <Trash2 size={13} />
          </button>
        </div>

        {/* Title */}
        <div className="px-8 pt-6 pb-2 flex-shrink-0 border-b border-[#252525]">
          <input
            value={title}
            onChange={handleTitleChange}
            onKeyDown={(e) => e.key === 'Enter' && editor?.commands.focus()}
            placeholder="Untitled"
            className="w-full bg-transparent text-2xl font-semibold text-white placeholder-[#444] outline-none caret-accent"
          />
        </div>

        {/* Editor body */}
        <div
          className="flex-1 overflow-y-auto px-8 py-5 cursor-text"
          onClick={() => editor?.commands.focus()}
        >
          <EditorContent
            editor={editor}
            className="tiptap text-[15px] text-[#d8d8d8] leading-relaxed min-h-full"
          />
        </div>
      </div>

      {/* Work items panel */}
      <div className={`w-60 flex-shrink-0 border-l border-[#303030] bg-[#111111] flex flex-col transition-opacity ${allDone ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-[#282828]">
          <div className="flex items-center gap-1.5">
            <Link2 size={12} className="text-[#666]" />
            <span className="text-xs text-[#888] font-medium uppercase tracking-wide">Work Items</span>
            {allDone && <span className="text-xs text-accent ml-1">✓ Done</span>}
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={pasteWorkItem} title="Paste from clipboard" className="p-1.5 rounded text-[#555] hover:text-[#bbb] hover:bg-[#222] transition-all">
              <Clipboard size={12} />
            </button>
            <button onClick={() => setShowAddItem(!showAddItem)} className="p-1.5 rounded text-[#555] hover:text-[#bbb] hover:bg-[#222] transition-all">
              <Plus size={12} />
            </button>
          </div>
        </div>

        {showAddItem && (
          <div className="px-3 py-2 border-b border-[#282828]">
            <input
              value={newItemUrl}
              onChange={(e) => setNewItemUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWorkItem()}
              placeholder="Paste Azure DevOps URL..."
              autoFocus
              className="w-full bg-[#1a1a1a] border border-[#383838] rounded px-2 py-1.5 text-xs text-[#e5e5e5] placeholder-[#444] outline-none focus:border-accent"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {workItems.length === 0 ? (
            <p className="text-xs text-[#333] text-center py-6">No linked work items</p>
          ) : (
            workItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 group hover:bg-[#1a1a1a] transition-all">
                <button onClick={() => toggleWorkItem(item.id)} className="flex-shrink-0 text-[#555] hover:text-accent transition-colors">
                  {item.is_done ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                </button>
                <button
                  onClick={() => window.api?.shell.openExternal(item.url)}
                  className={`flex-1 text-left text-xs truncate transition-all hover:text-accent ${item.is_done ? 'line-through text-[#444]' : 'text-[#bbb]'}`}
                >
                  #{item.item_number}
                </button>
                <button onClick={() => window.api?.shell.openExternal(item.url)} className="flex-shrink-0 text-[#333] group-hover:text-[#666] transition-colors">
                  <ExternalLink size={11} />
                </button>
                <button onClick={() => removeWorkItem(item.id)} className="flex-shrink-0 text-[#333] group-hover:text-[#666] hover:!text-red-400 transition-colors">
                  <X size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
