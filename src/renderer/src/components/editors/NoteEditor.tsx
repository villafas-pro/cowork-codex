import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2,
  Plus, ExternalLink, CheckSquare, Square, Link2, Clipboard, X, Pin
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface WorkItem {
  id: string
  url: string
  item_number: string
  is_done: number
}

interface NoteEditorProps {
  noteId: string
}

export default function NoteEditor({ noteId }: NoteEditorProps): React.JSX.Element {
  const { updateTabTitle } = useAppStore()
  const [title, setTitle] = useState('')
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [newItemUrl, setNewItemUrl] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLoaded = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] }
      }),
      Underline,
      Placeholder.configure({
        placeholder: 'Start writing...'
      })
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!isLoaded.current) return
      scheduleSave(title, editor.getJSON())
    }
  })

  // Load note on mount
  useEffect(() => {
    isLoaded.current = false
    loadNote()
    loadWorkItems()
  }, [noteId])

  async function loadNote(): Promise<void> {
    const note = await window.api?.notes.get(noteId)
    if (!note) return
    setTitle(note.title || '')
    setIsPinned(!!note.is_pinned)
    if (editor && note.content && note.content !== '{}') {
      try {
        const parsed = JSON.parse(note.content)
        editor.commands.setContent(parsed, false)
      } catch {
        editor.commands.setContent(note.content, false)
      }
    }
    isLoaded.current = true
  }

  async function loadWorkItems(): Promise<void> {
    const items = await window.api?.workItems.getForEntity('note', noteId)
    setWorkItems(items || [])
  }

  // Debounced auto-save
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
    const newTitle = e.target.value
    setTitle(newTitle)
    updateTabTitle(noteId, newTitle || 'Untitled')
    if (editor) scheduleSave(newTitle, editor.getJSON())
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      editor?.commands.focus()
    }
  }

  const togglePin = async (): Promise<void> => {
    await window.api?.notes.togglePin(noteId)
    setIsPinned(!isPinned)
  }

  // Work item actions
  const addWorkItem = async (url?: string): Promise<void> => {
    const targetUrl = url || newItemUrl.trim()
    if (!targetUrl) return
    const item = await window.api?.workItems.create(targetUrl, 'note', noteId)
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
    setWorkItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, is_done: i.is_done ? 0 : 1 } : i))
    )
  }

  const removeWorkItem = async (workItemId: string): Promise<void> => {
    await window.api?.workItems.unlink(workItemId, 'note', noteId)
    setWorkItems((prev) => prev.filter((i) => i.id !== workItemId))
  }

  // TipTap handles Ctrl+B, Ctrl+I, Ctrl+U natively via its extensions

  const allDone = workItems.length > 0 && workItems.every((i) => i.is_done)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#2a2a2a] flex-shrink-0">
          <button
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded text-xs transition-all ${editor?.isActive('bold') ? 'bg-[#2a2a2a] text-white' : 'text-[#555] hover:text-[#aaa]'}`}
            title="Bold (Ctrl+B)"
          >
            <Bold size={13} />
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded text-xs transition-all ${editor?.isActive('italic') ? 'bg-[#2a2a2a] text-white' : 'text-[#555] hover:text-[#aaa]'}`}
            title="Italic (Ctrl+I)"
          >
            <Italic size={13} />
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded text-xs transition-all ${editor?.isActive('underline') ? 'bg-[#2a2a2a] text-white' : 'text-[#555] hover:text-[#aaa]'}`}
            title="Underline (Ctrl+U)"
          >
            <UnderlineIcon size={13} />
          </button>
          <div className="w-px h-4 bg-[#2a2a2a] mx-1" />
          <button
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded text-xs transition-all ${editor?.isActive('heading', { level: 1 }) ? 'bg-[#2a2a2a] text-white' : 'text-[#555] hover:text-[#aaa]'}`}
            title="Heading 1"
          >
            <Heading1 size={13} />
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded text-xs transition-all ${editor?.isActive('heading', { level: 2 }) ? 'bg-[#2a2a2a] text-white' : 'text-[#555] hover:text-[#aaa]'}`}
            title="Heading 2"
          >
            <Heading2 size={13} />
          </button>
          <div className="flex-1" />
          <button
            onClick={togglePin}
            className={`p-1.5 rounded transition-all ${isPinned ? 'text-accent' : 'text-[#444] hover:text-[#aaa]'}`}
            title={isPinned ? 'Unpin' : 'Pin note'}
          >
            <Pin size={13} />
          </button>
        </div>

        {/* Title */}
        <div className="px-8 pt-6 pb-2 flex-shrink-0">
          <input
            value={title}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            className="w-full bg-transparent text-2xl font-semibold text-[#e5e5e5] placeholder-[#333] outline-none"
          />
        </div>

        {/* Editor */}
        <div
          className="flex-1 overflow-y-auto px-8 py-4 cursor-text"
          onClick={() => editor?.commands.focus()}
        >
          <EditorContent
            editor={editor}
            className="tiptap text-sm text-[#d0d0d0] leading-relaxed min-h-full"
          />
        </div>
      </div>

      {/* Work items panel */}
      <div className={`w-64 flex-shrink-0 border-l border-[#2a2a2a] flex flex-col ${allDone ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-1.5">
            <Link2 size={12} className="text-[#444]" />
            <span className="text-xs text-[#555] font-medium">Work Items</span>
            {allDone && <span className="text-xs text-accent ml-1">✓ All done</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={pasteWorkItem}
              title="Paste from clipboard"
              className="p-1 rounded text-[#444] hover:text-[#aaa] transition-all"
            >
              <Clipboard size={12} />
            </button>
            <button
              onClick={() => setShowAddItem(!showAddItem)}
              className="p-1 rounded text-[#444] hover:text-[#aaa] transition-all"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>

        {/* Add work item input */}
        {showAddItem && (
          <div className="px-3 py-2 border-b border-[#2a2a2a]">
            <input
              value={newItemUrl}
              onChange={(e) => setNewItemUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWorkItem()}
              placeholder="Paste URL..."
              autoFocus
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-[#e5e5e5] placeholder-[#333] outline-none focus:border-accent"
            />
          </div>
        )}

        {/* Work items list */}
        <div className="flex-1 overflow-y-auto py-1">
          {workItems.length === 0 ? (
            <p className="text-xs text-[#2a2a2a] text-center py-4">No work items</p>
          ) : (
            workItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-1.5 group hover:bg-[#1e1e1e] transition-all"
              >
                <button
                  onClick={() => toggleWorkItem(item.id)}
                  className="flex-shrink-0 text-[#444] hover:text-accent transition-colors"
                >
                  {item.is_done ? (
                    <CheckSquare size={13} className="text-accent" />
                  ) : (
                    <Square size={13} />
                  )}
                </button>
                <button
                  onClick={() => window.api?.shell.openExternal(item.url)}
                  className={`flex-1 text-left text-xs transition-all hover:text-accent truncate ${
                    item.is_done ? 'line-through text-[#333]' : 'text-[#aaa]'
                  }`}
                >
                  #{item.item_number}
                </button>
                <button
                  onClick={() => window.api?.shell.openExternal(item.url)}
                  className="flex-shrink-0 text-[#2a2a2a] group-hover:text-[#444] transition-colors"
                >
                  <ExternalLink size={11} />
                </button>
                <button
                  onClick={() => removeWorkItem(item.id)}
                  className="flex-shrink-0 text-[#2a2a2a] group-hover:text-[#444] hover:text-red-400 transition-colors"
                >
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
