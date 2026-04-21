import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2,
  List, ListOrdered, ListChecks, Quote, Strikethrough,
  Plus, ExternalLink, CheckSquare, Square, Link2, Clipboard, X, Pin, Trash2, AlertTriangle
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { NoteLink } from './extensions/NoteLink'
import WorkItemSearch from '../WorkItemSearch'

interface WorkItem {
  id: string
  url: string
  item_number: string
  is_done: number
  is_ado: number
  cached_title: string | null
  cached_type: string | null
  cached_state: string | null
  cached_assigned_to: string | null
}

const TYPE_COLORS: Record<string, string> = {
  'Bug': '#cc3333', 'Task': '#007acc', 'User Story': '#009933',
  'Feature': '#773b93', 'Epic': '#ff6600', 'Test Case': '#004b50',
}

export default function NoteEditor({ noteId }: { noteId: string }): React.JSX.Element {
  const { updateTabTitle, closeTab, tabs, setActiveSection, openTab, adoStatus } = useAppStore()
  const [title, setTitle] = useState('')
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [newItemUrl, setNewItemUrl] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [adoConfigured, setAdoConfigured] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  const titleRef = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContent = useRef<any>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
      NoteLink,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      scheduleSave(titleRef.current, editor.getJSON())
    }
  })

  useEffect(() => {
    pendingContent.current = null
    loadNote()
    loadWorkItems()
    window.api?.ado.isConfigured().then(setAdoConfigured)
  }, [noteId])

  // Image paste + drag-and-drop handler
  useEffect(() => {
    const insertImageBlob = (blob: Blob): void => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        editor?.chain().focus().setImage({ src: base64 }).run()
      }
      reader.readAsDataURL(blob)
    }

    const handlePaste = (e: ClipboardEvent): void => {
      if (!editor) return
      const items = Array.from(e.clipboardData?.items || [])
      const imageItems = items.filter((item) => item.type.startsWith('image/'))
      if (!imageItems.length) return
      // Prefer GIF so animation is preserved
      const imageItem = imageItems.find((i) => i.type === 'image/gif') ?? imageItems[0]
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (blob) insertImageBlob(blob)
    }

    const handleDrop = (e: DragEvent): void => {
      if (!editor) return
      const files = Array.from(e.dataTransfer?.files || [])
      const imageFile = files.find((f) => f.type.startsWith('image/'))
      if (!imageFile) return
      e.preventDefault()
      insertImageBlob(imageFile)
    }

    window.addEventListener('paste', handlePaste)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', (e) => e.preventDefault())
    return () => {
      window.removeEventListener('paste', handlePaste)
      window.removeEventListener('drop', handleDrop)
    }
  }, [editor])

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
      } catch { /* plain text fallback */ }
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
      setNewItemUrl('')
      setShowAddItem(false)
      // Fetch ADO cache first so the list shows enriched data immediately
      if (target.includes('dev.azure.com')) {
        await window.api?.ado.fetchWorkItem(parseInt(item.item_number, 10)).catch(() => {})
      }
      await loadWorkItems()
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

  const DONE_STATES = new Set(['Closed', 'Resolved', 'Done', 'Removed'])
  const effectiveDone = (i: WorkItem): boolean =>
    i.is_ado && i.cached_state ? DONE_STATES.has(i.cached_state) : !!i.is_done
  const allDone = workItems.length > 0 && workItems.every(effectiveDone)

  const btn = (active: boolean): string =>
    `p-1.5 rounded transition-all ${active ? 'bg-[#383838] text-white' : 'text-[#888] hover:text-[#ddd] hover:bg-[#2a2a2a]'}`
  const div = <div className="w-px h-4 bg-[#383838] mx-0.5" />

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-[#303030] bg-[#141414] flex-shrink-0 flex-wrap">
          {/* Text style */}
          <button onClick={() => editor?.chain().focus().toggleBold().run()} className={btn(!!editor?.isActive('bold'))} title="Bold (Ctrl+B)">
            <Bold size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={btn(!!editor?.isActive('italic'))} title="Italic (Ctrl+I)">
            <Italic size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleUnderline().run()} className={btn(!!editor?.isActive('underline'))} title="Underline (Ctrl+U)">
            <UnderlineIcon size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleStrike().run()} className={btn(!!editor?.isActive('strike'))} title="Strikethrough">
            <Strikethrough size={13} />
          </button>
          {div}
          {/* Headings */}
          <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(!!editor?.isActive('heading', { level: 1 }))} title="Heading 1">
            <Heading1 size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(!!editor?.isActive('heading', { level: 2 }))} title="Heading 2">
            <Heading2 size={13} />
          </button>
          {div}
          {/* Lists */}
          <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={btn(!!editor?.isActive('bulletList'))} title="Bullet list">
            <List size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={btn(!!editor?.isActive('orderedList'))} title="Numbered list">
            <ListOrdered size={13} />
          </button>
          <button onClick={() => editor?.chain().focus().toggleTaskList().run()} className={btn(!!editor?.isActive('taskList'))} title="Task list (checkboxes)">
            <ListChecks size={13} />
          </button>
          {div}
          {/* Block */}
          <button onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={btn(!!editor?.isActive('blockquote'))} title="Blockquote">
            <Quote size={13} />
          </button>
          {/* Spacer */}
          <div className="flex-1" />
          {/* Note actions */}
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
          onClick={async (e) => {
            const target = e.target as HTMLElement
            if (target.classList.contains('note-link')) {
              const noteName = target.getAttribute('data-note-name')
              if (noteName) {
                const all = await window.api?.notes.getAll()
                const matches = (all || []).filter((n: any) =>
                  (n.title || '').toLowerCase() === noteName.toLowerCase()
                )
                if (matches.length === 0) return
                // If duplicates exist, open the most recently updated one
                const best = matches.sort((a: any, b: any) => b.updated_at - a.updated_at)[0]
                openTab({ entityType: 'note', entityId: best.id, title: best.title })
              }
              return
            }
            editor?.commands.focus()
          }}
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
            {!adoConfigured && (
              <button
                onClick={() => setShowAddItem(!showAddItem)}
                className="p-1.5 rounded text-[#555] hover:text-[#bbb] hover:bg-[#222] transition-all"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>

        {adoConfigured && (
          <div className="px-3 py-2 border-b border-[#282828]">
            <WorkItemSearch
              onAdd={(url) => { addWorkItem(url) }}
            />
          </div>
        )}

        {showAddItem && !adoConfigured && (
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
            <p className="text-xs text-[#555] text-center py-6">No linked work items</p>
          ) : (
            workItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2 px-3 py-2 group hover:bg-[#1a1a1a] transition-all">
                {item.is_ado ? (
                  <span className="flex-shrink-0 text-[#555] mt-0.5 cursor-default" title="State managed by ADO">
                    {effectiveDone(item) ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                  </span>
                ) : (
                  <button onClick={() => toggleWorkItem(item.id)} className="flex-shrink-0 text-[#555] hover:text-accent transition-colors mt-0.5">
                    {item.is_done ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                  </button>
                )}
                <button
                  onClick={() => openTab({ entityType: 'work-item', entityId: item.item_number, title: item.cached_title || `#${item.item_number}` })}
                  className={`flex-1 text-left min-w-0 transition-all hover:text-accent ${effectiveDone(item) ? 'opacity-40' : ''}`}
                >
                  {item.cached_title ? (
                    <>
                      <p className="text-xs text-[#ddd] truncate leading-snug">{item.cached_title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {item.cached_type && (
                          <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: TYPE_COLORS[item.cached_type] || '#666' }} />
                        )}
                        <span className="text-[10px] text-[#555]">#{item.item_number}</span>
                        {item.cached_state && <span className="text-[10px] text-[#555]">· {item.cached_state}</span>}
                      </div>
                    </>
                  ) : (
                    <p className={`text-xs truncate ${item.is_done ? 'line-through text-[#444]' : 'text-[#bbb]'}`}>#{item.item_number}</p>
                  )}
                </button>
                <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                  {item.is_ado && adoStatus === 'error' && (
                    <span title="ADO connection error — data may be stale" className="text-amber-500 p-0.5">
                      <AlertTriangle size={11} />
                    </span>
                  )}
                  <button onClick={() => window.api?.shell.openExternal(item.url)} title="Open in ADO" className="text-[#333] group-hover:text-[#666] transition-colors p-0.5">
                    <ExternalLink size={11} />
                  </button>
                  <button onClick={() => removeWorkItem(item.id)} className="text-[#333] group-hover:text-[#666] hover:!text-red-400 transition-colors p-0.5">
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
