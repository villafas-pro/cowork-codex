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
  Plus, ExternalLink, CheckSquare, Square, Link2, Clipboard, X, Pin, Trash2, AlertTriangle,
  Lock, LockOpen, KeyRound, Eye, EyeOff, History, RotateCcw, Code2, GitBranch
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { NoteLink } from './extensions/NoteLink'
import { CodeEmbed } from './extensions/CodeEmbed'
import { FlowEmbed } from './extensions/FlowEmbed'
import WorkItemSearch from '../WorkItemSearch'
import { type WorkItem, TYPE_COLORS, DONE_STATES } from '../../lib/workItemUtils'

function PasswordField({
  label, value, onChange, visible, onToggle, onEnter
}: {
  label: string
  value: string
  onChange: (v: string) => void
  visible: boolean
  onToggle: () => void
  onEnter: () => void
}): React.JSX.Element {
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()}
        placeholder={label}
        className="w-full bg-th-bg-1 border border-th-bd-2 rounded-lg px-3 py-2 pr-9 text-sm text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent transition-colors"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-th-tx-6 hover:text-th-tx-3 transition-colors"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

export default function NoteEditor({ noteId }: { noteId: string }): React.JSX.Element {
  const { updateTabTitle, closeTab, tabs, setActiveSection, openTab, adoStatus } = useAppStore()
  const [title, setTitle] = useState('')
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [newItemUrl, setNewItemUrl] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [adoConfigured, setAdoConfigured] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  // Password protection
  const [isPasswordLocked, setIsPasswordLocked] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)
  const [unlockInput, setUnlockInput] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [unlockVisible, setUnlockVisible] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState<'set' | 'manage' | null>(null)
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwModalError, setPwModalError] = useState<string | null>(null)
  const [pwVisible, setPwVisible] = useState(false)
  // Version history
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<Array<{ id: string; created_at: number; content_json: string }>>([])
  const [selectedVersionIdx, setSelectedVersionIdx] = useState(0)
  const [versionPreview, setVersionPreview] = useState('')

  // Linked code/flow panel
  const [activePanel, setActivePanel] = useState<'work-items' | 'code' | 'flow'>('work-items')
  const [linkedCode, setLinkedCode] = useState<Array<{ id: string; title: string; language: string; updated_at: number }>>([])
  const [linkedFlows, setLinkedFlows] = useState<Array<{ id: string; title: string; updated_at: number }>>([])

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
      CodeEmbed,
      FlowEmbed,
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
    loadLinkedCode()
    loadLinkedFlows()
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
    const locked = !!note.is_locked
    setIsLocked(locked)
    const pwLocked = !!note.is_password_locked
    setIsPasswordLocked(pwLocked)
    setHasPassword(!!note.has_password)
    // If password-locked, don't load content into the editor — show the unlock UI instead
    if (pwLocked) {
      editor?.commands.setContent({}, false)
      editor?.setEditable(false)
      updateTabTitle(noteId, t || 'Untitled')
      return
    }
    editor?.setEditable(!locked)
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

  async function loadLinkedCode(): Promise<void> {
    const blocks = await window.api?.code.getForNote(noteId)
    setLinkedCode(blocks || [])
  }

  async function loadLinkedFlows(): Promise<void> {
    const flows = await window.api?.flows.getForNote(noteId)
    setLinkedFlows(flows || [])
  }

  async function createLinkedCode(): Promise<void> {
    const block = await window.api?.code.create({ title: 'Untitled', noteId })
    if (block) {
      setLinkedCode((prev) => [...prev, block])
      openTab({ entityType: 'code', entityId: block.id, title: block.title || 'Untitled' })
    }
  }

  async function createLinkedFlow(): Promise<void> {
    const flow = await window.api?.flows.create({ title: 'Untitled Flow', noteId })
    if (flow) {
      setLinkedFlows((prev) => [...prev, flow])
      openTab({ entityType: 'flow', entityId: flow.id, title: flow.title || 'Untitled Flow' })
    }
  }

  async function insertCodeEmbed(): Promise<void> {
    const block = await window.api?.code.create({ title: 'Untitled', noteId })
    if (!block) return
    setLinkedCode((prev) => [...prev, block])
    editor?.chain().focus().insertContent({ type: 'codeEmbed', attrs: { blockId: block.id } }).run()
  }

  async function insertFlowEmbed(): Promise<void> {
    const flow = await window.api?.flows.create({ title: 'Untitled Flow', noteId })
    if (!flow) return
    setLinkedFlows((prev) => [...prev, flow])
    editor?.chain().focus().insertContent({ type: 'flowEmbed', attrs: { flowId: flow.id } }).run()
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

  const toggleLock = async (): Promise<void> => {
    await window.api?.notes.toggleLock(noteId)
    setIsLocked((prev) => {
      const next = !prev
      editor?.setEditable(!next)
      return next
    })
  }

  const handleUnlock = async (): Promise<void> => {
    if (!unlockInput.trim()) return
    setUnlockError(null)
    const result = await window.api?.notes.unlock(noteId, unlockInput)
    if (!result?.success) {
      setUnlockError(result?.error || 'Incorrect password')
      return
    }
    // Load decrypted content into editor
    try {
      const parsed = JSON.parse(result.content)
      editor?.setEditable(!isLocked)
      editor?.commands.setContent(parsed, false)
    } catch {
      editor?.setEditable(!isLocked)
    }
    setIsPasswordLocked(false)
    setUnlockInput('')
  }

  const openPasswordModal = (): void => {
    setPwNew(''); setPwConfirm(''); setPwCurrent(''); setPwModalError(null); setPwVisible(false)
    setShowPasswordModal(hasPassword ? 'manage' : 'set')
  }

  const handleSetPassword = async (): Promise<void> => {
    if (pwNew.length < 4) { setPwModalError('Password must be at least 4 characters'); return }
    if (pwNew !== pwConfirm) { setPwModalError('Passwords do not match'); return }
    const result = await window.api?.notes.setPassword(noteId, pwNew)
    if (!result?.success) { setPwModalError(result?.error || 'Failed to set password'); return }
    setHasPassword(true)
    setShowPasswordModal(null)
  }

  const handleRemovePassword = async (): Promise<void> => {
    if (!pwCurrent.trim()) { setPwModalError('Enter your current password'); return }
    const result = await window.api?.notes.removePassword(noteId, pwCurrent)
    if (!result?.success) { setPwModalError(result?.error || 'Incorrect password'); return }
    setHasPassword(false)
    setShowPasswordModal(null)
  }

  const handleChangePassword = async (): Promise<void> => {
    if (pwNew.length < 4) { setPwModalError('New password must be at least 4 characters'); return }
    if (pwNew !== pwConfirm) { setPwModalError('Passwords do not match'); return }
    const result = await window.api?.notes.setPassword(noteId, pwNew)
    if (!result?.success) { setPwModalError(result?.error || 'Failed to change password'); return }
    setShowPasswordModal(null)
  }

  const openHistory = async (): Promise<void> => {
    const vers = await window.api?.notes.getVersions(noteId)
    if (!vers || vers.length === 0) return
    setVersions(vers)
    setSelectedVersionIdx(0)
    setVersionPreview(extractText(vers[0].content_json))
    setShowHistory(true)
  }

  const selectVersion = (idx: number): void => {
    setSelectedVersionIdx(idx)
    setVersionPreview(extractText(versions[idx].content_json))
  }

  const restoreVersion = async (): Promise<void> => {
    const ver = versions[selectedVersionIdx]
    if (!ver) return
    await window.api?.notes.update(noteId, {
      title: titleRef.current,
      content: ver.content_json
    })
    try {
      const parsed = JSON.parse(ver.content_json)
      editor?.commands.setContent(parsed, false)
    } catch { /* ignore */ }
    setShowHistory(false)
  }

  /** Extract plain text from a TipTap JSON string for preview */
  function extractText(json: string): string {
    try {
      type TNode = { type?: string; text?: string; content?: TNode[] }
      const walk = (node: TNode): string => {
        if (node.type === 'text') return node.text || ''
        return (node.content || []).map(walk).join(' ')
      }
      const parsed: TNode = JSON.parse(json)
      return walk(parsed).replace(/\s+/g, ' ').trim().slice(0, 600)
    } catch {
      return ''
    }
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

  const effectiveDone = (i: WorkItem): boolean =>
    i.is_ado && i.cached_state ? DONE_STATES.has(i.cached_state) : !!i.is_done
  const allDone = workItems.length > 0 && workItems.every(effectiveDone)

  const btn = (active: boolean): string =>
    `p-1.5 rounded transition-all ${active ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-4 hover:text-th-tx-2 hover:bg-th-bg-6'}`
  const div = <div className="w-px h-4 bg-th-bd-2 mx-0.5" />

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-th-bd-1 bg-th-bg-1 flex-shrink-0 flex-wrap">
          {/* Format buttons — hidden when locked */}
          {!isLocked && (<>
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
            {div}
            {/* Embeds */}
            <button onClick={insertCodeEmbed} className={btn(false)} title="Insert code block">
              <Code2 size={13} />
            </button>
            <button onClick={insertFlowEmbed} className={btn(false)} title="Insert flow diagram">
              <GitBranch size={13} />
            </button>
          </>)}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Lock badge when active */}
          {isLocked && (
            <span className="text-[10px] text-[#e8b800] bg-[#e8b80015] border border-[#e8b80033] rounded px-2 py-0.5 mr-1 font-medium tracking-wide">
              Read-only
            </span>
          )}

          {/* Note actions */}
          {!isPasswordLocked && (
            <button
              onClick={openHistory}
              className="p-1.5 rounded transition-all text-th-tx-5 hover:text-th-tx-2 hover:bg-th-bg-6"
              title="Version history"
            >
              <History size={13} />
            </button>
          )}
          <button
            onClick={openPasswordModal}
            className={`p-1.5 rounded transition-all ${hasPassword ? 'text-[#e8b800] hover:text-[#f5c842]' : 'text-th-tx-5 hover:text-th-tx-2'}`}
            title={hasPassword ? 'Manage password' : 'Set password'}
          >
            <KeyRound size={13} />
          </button>
          <button
            onClick={toggleLock}
            className={`p-1.5 rounded transition-all ${isLocked ? 'text-[#e8b800] hover:text-[#f5c842]' : 'text-th-tx-5 hover:text-th-tx-2'}`}
            title={isLocked ? 'Unlock note' : 'Lock note'}
          >
            {isLocked ? <Lock size={13} /> : <LockOpen size={13} />}
          </button>
          <button onClick={togglePin} className={`p-1.5 rounded transition-all ${isPinned ? 'text-accent' : 'text-th-tx-5 hover:text-th-tx-2'}`} title={isPinned ? 'Unpin' : 'Pin note'}>
            <Pin size={13} />
          </button>
          <button onClick={deleteNote} className="p-1.5 rounded transition-all text-th-tx-5 hover:text-red-400 hover:bg-th-danger" title="Delete note">
            <Trash2 size={13} />
          </button>
        </div>

        {/* Title */}
        <div className="px-8 pt-6 pb-2 flex-shrink-0 border-b border-th-bd-1">
          <input
            value={title}
            onChange={handleTitleChange}
            onKeyDown={(e) => e.key === 'Enter' && editor?.commands.focus()}
            placeholder="Untitled"
            disabled={isLocked || isPasswordLocked}
            className={`w-full bg-transparent text-2xl font-semibold placeholder-th-tx-5 outline-none caret-accent transition-colors ${(isLocked || isPasswordLocked) ? 'text-th-tx-4 cursor-default select-text' : 'text-th-tx-1'}`}
          />
        </div>

        {/* Password unlock overlay — shown when note is password-locked */}
        {isPasswordLocked ? (
          <div className="flex-1 flex items-center justify-center bg-th-bg-1">
            <div className="flex flex-col items-center gap-5 p-8 rounded-2xl bg-th-bg-3 border border-th-bd-1 w-80 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-[#e8b80015] border border-[#e8b80033] flex items-center justify-center">
                <KeyRound size={22} className="text-[#e8b800]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-th-tx-1">{title || 'Untitled'}</p>
                <p className="text-xs text-th-tx-5 mt-1">This note is password protected</p>
              </div>
              <div className="w-full relative">
                <input
                  type={unlockVisible ? 'text' : 'password'}
                  value={unlockInput}
                  onChange={(e) => { setUnlockInput(e.target.value); setUnlockError(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  placeholder="Enter password…"
                  autoFocus
                  className={`w-full bg-th-bg-1 border rounded-lg px-3 py-2.5 pr-9 text-sm text-th-tx-1 placeholder-th-tx-5 outline-none transition-colors ${unlockError ? 'border-red-500' : 'border-th-bd-2 focus:border-accent'}`}
                />
                <button
                  onClick={() => setUnlockVisible((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-th-tx-6 hover:text-th-tx-3 transition-colors"
                >
                  {unlockVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {unlockError && <p className="text-xs text-red-400 -mt-2">{unlockError}</p>}
              <button
                onClick={handleUnlock}
                className="w-full bg-accent hover:bg-accent-hover text-black rounded-lg py-2.5 text-sm font-semibold transition-colors"
              >
                Unlock
              </button>
            </div>
          </div>
        ) : (
          /* Normal editor body */
          <div
            className="flex-1 overflow-y-auto px-8 py-5 cursor-text"
            onClick={async (e) => {
              const target = e.target as HTMLElement
              if (target.classList.contains('note-link')) {
                const noteName = target.getAttribute('data-note-name')
                if (noteName) {
                  const all = await window.api?.notes.getAll()
                  const matches = (all || []).filter((n: { title: string; updated_at: number; id: string }) =>
                    (n.title || '').toLowerCase() === noteName.toLowerCase()
                  )
                  if (matches.length === 0) return
                  const best = matches.sort((a, b) => b.updated_at - a.updated_at)[0]
                  openTab({ entityType: 'note', entityId: best.id, title: best.title })
                }
                return
              }
              editor?.commands.focus()
            }}
          >
            <EditorContent
              editor={editor}
              className="tiptap text-th-tx-2 leading-relaxed min-h-full"
            />
          </div>
        )}
      </div>

      {/* Right panel — hidden when note is password-locked */}
      {!isPasswordLocked && (
        <div className="w-60 flex-shrink-0 border-l border-th-bd-1 bg-th-bg-1 flex flex-col">

          {/* Tab switcher */}
          <div className="flex border-b border-th-bd-1 flex-shrink-0">
            {([
              { id: 'work-items', icon: <Link2 size={11} />, label: 'Work Items' },
              { id: 'code',       icon: <Code2 size={11} />,     label: 'Code' },
              { id: 'flow',       icon: <GitBranch size={11} />, label: 'Flow' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-medium uppercase tracking-wide transition-colors border-b-2 ${
                  activePanel === tab.id
                    ? 'text-accent border-accent'
                    : 'text-th-tx-5 border-transparent hover:text-th-tx-3'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Work Items panel */}
          {activePanel === 'work-items' && (<>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-th-bd-1 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-th-tx-4 font-medium">Linked items</span>
                {allDone && <span className="text-xs text-accent">✓ Done</span>}
              </div>
              {!isLocked && (
                <div className="flex items-center gap-0.5">
                  <button onClick={pasteWorkItem} title="Paste from clipboard" className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all">
                    <Clipboard size={12} />
                  </button>
                  {!adoConfigured && (
                    <button onClick={() => setShowAddItem(!showAddItem)} className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all">
                      <Plus size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {!isLocked && adoConfigured && (
              <div className="px-3 py-2 border-b border-th-bd-1">
                <WorkItemSearch onAdd={(url) => { addWorkItem(url) }} />
              </div>
            )}

            {!isLocked && showAddItem && !adoConfigured && (
              <div className="px-3 py-2 border-b border-th-bd-1">
                <input
                  value={newItemUrl}
                  onChange={(e) => setNewItemUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addWorkItem()}
                  placeholder="Paste Azure DevOps URL..."
                  autoFocus
                  className="w-full bg-th-bg-3 border border-th-bd-2 rounded px-2 py-1.5 text-xs text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent"
                />
              </div>
            )}

            <div className={`flex-1 overflow-y-auto py-1 transition-opacity ${allDone ? 'opacity-50' : ''}`}>
              {workItems.length === 0 ? (
                <p className="text-xs text-th-tx-6 text-center py-6">No linked work items</p>
              ) : (
                workItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 px-3 py-2 group hover:bg-th-bg-3 transition-all">
                    {item.is_ado ? (
                      <span className="flex-shrink-0 text-th-tx-6 mt-0.5 cursor-default" title="State managed by ADO">
                        {effectiveDone(item) ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                      </span>
                    ) : (
                      <button onClick={() => toggleWorkItem(item.id)} className="flex-shrink-0 text-th-tx-6 hover:text-accent transition-colors mt-0.5">
                        {item.is_done ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                      </button>
                    )}
                    <button
                      onClick={() => openTab({ entityType: 'work-item', entityId: item.item_number, title: item.cached_title || `#${item.item_number}` })}
                      className={`flex-1 text-left min-w-0 transition-all hover:text-accent ${effectiveDone(item) ? 'opacity-40' : ''}`}
                    >
                      {item.cached_title ? (
                        <>
                          <p className="text-xs text-th-tx-2 truncate leading-snug">{item.cached_title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.cached_type && (
                              <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: TYPE_COLORS[item.cached_type] || '#666' }} />
                            )}
                            <span className="text-[10px] text-th-tx-6">#{item.item_number}</span>
                            {item.cached_state && <span className="text-[10px] text-th-tx-6">· {item.cached_state}</span>}
                          </div>
                        </>
                      ) : (
                        <p className={`text-xs truncate ${item.is_done ? 'line-through text-th-tx-6' : 'text-th-tx-2'}`}>#{item.item_number}</p>
                      )}
                    </button>
                    <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                      {item.is_ado && adoStatus === 'error' && (
                        <span title="ADO connection error — data may be stale" className="text-amber-500 p-0.5">
                          <AlertTriangle size={11} />
                        </span>
                      )}
                      <button onClick={() => window.api?.shell.openExternal(item.url)} title="Open in ADO" className="text-th-tx-6 group-hover:text-th-tx-5 transition-colors p-0.5">
                        <ExternalLink size={11} />
                      </button>
                      {!isLocked && (
                        <button onClick={() => removeWorkItem(item.id)} className="text-th-tx-6 group-hover:text-th-tx-5 hover:!text-red-400 transition-colors p-0.5">
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>)}

          {/* Code panel */}
          {activePanel === 'code' && (<>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-th-bd-1 flex-shrink-0">
              <span className="text-xs text-th-tx-4 font-medium">Code blocks</span>
              {!isLocked && (
                <button onClick={createLinkedCode} title="New code block" className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all">
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {linkedCode.length === 0 ? (
                <p className="text-xs text-th-tx-6 text-center py-6">No code blocks linked to this note</p>
              ) : (
                linkedCode.map((block) => (
                  <button
                    key={block.id}
                    onClick={() => openTab({ entityType: 'code', entityId: block.id, title: block.title || 'Untitled' })}
                    className="w-full flex items-center gap-2.5 px-3 py-2 group hover:bg-th-bg-3 transition-all text-left"
                  >
                    <Code2 size={13} className="text-th-tx-5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-th-tx-2 truncate group-hover:text-accent transition-colors">{block.title || 'Untitled'}</p>
                      <p className="text-[10px] text-th-tx-6">{block.language}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>)}

          {/* Flow panel */}
          {activePanel === 'flow' && (<>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-th-bd-1 flex-shrink-0">
              <span className="text-xs text-th-tx-4 font-medium">Flows</span>
              {!isLocked && (
                <button onClick={createLinkedFlow} title="New flow" className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all">
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {linkedFlows.length === 0 ? (
                <p className="text-xs text-th-tx-6 text-center py-6">No flows linked to this note</p>
              ) : (
                linkedFlows.map((flow) => (
                  <button
                    key={flow.id}
                    onClick={() => openTab({ entityType: 'flow', entityId: flow.id, title: flow.title || 'Untitled' })}
                    className="w-full flex items-center gap-2.5 px-3 py-2 group hover:bg-th-bg-3 transition-all text-left"
                  >
                    <GitBranch size={13} className="text-th-tx-5 flex-shrink-0" />
                    <p className="text-xs text-th-tx-2 truncate group-hover:text-accent transition-colors">{flow.title || 'Untitled'}</p>
                  </button>
                ))
              )}
            </div>
          </>)}

        </div>
      )}

      {/* ── Version history modal ──────────────────────────────────────── */}
      {showHistory && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowHistory(false)}
        >
          <div className="bg-th-bg-3 border border-th-bd-1 rounded-2xl shadow-2xl flex overflow-hidden"
            style={{ width: 640, maxHeight: '70vh' }}>
            {/* Left: version list */}
            <div className="w-48 flex-shrink-0 border-r border-th-bd-1 flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-th-bd-1">
                <History size={13} className="text-[#e8b800]" />
                <span className="text-xs font-semibold text-th-tx-1">History</span>
                <span className="ml-auto text-[10px] text-th-tx-6">{versions.length} saved</span>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {versions.map((ver, idx) => {
                  const d = new Date(ver.created_at)
                  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                  return (
                    <button
                      key={ver.id}
                      onClick={() => selectVersion(idx)}
                      className={`w-full text-left px-4 py-2.5 transition-colors ${idx === selectedVersionIdx ? 'bg-th-bg-5 border-l-2 border-accent' : 'hover:bg-th-bg-3'}`}
                    >
                      <p className="text-xs text-th-tx-2 font-medium">{dateStr}</p>
                      <p className="text-[10px] text-th-tx-6 mt-0.5">{timeStr}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right: preview + actions */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between px-5 py-3 border-b border-th-bd-1">
                <p className="text-xs text-th-tx-4">
                  {versions[selectedVersionIdx] ? new Date(versions[selectedVersionIdx].created_at).toLocaleString() : ''}
                </p>
                <button onClick={() => setShowHistory(false)} className="text-th-tx-6 hover:text-th-tx-3 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="text-xs text-th-tx-4 whitespace-pre-wrap leading-relaxed">
                  {versionPreview || <span className="italic text-th-tx-6">Empty version</span>}
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-th-bd-1">
                <button onClick={() => setShowHistory(false)} className="px-3 py-1.5 rounded-lg text-xs text-th-tx-4 bg-th-bg-5 hover:bg-th-bg-6 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={restoreVersion}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-black bg-accent hover:bg-accent-hover transition-colors"
                >
                  <RotateCcw size={11} />
                  Restore this version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Password modal ─────────────────────────────────────────────── */}
      {showPasswordModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowPasswordModal(null)}
        >
          <div className="bg-th-bg-3 border border-th-bd-1 rounded-2xl w-80 p-6 shadow-2xl flex flex-col gap-4">
            {showPasswordModal === 'set' ? (
              <>
                <div className="flex items-center gap-2">
                  <KeyRound size={16} className="text-[#e8b800]" />
                  <h3 className="text-sm font-semibold text-th-tx-1">Set password</h3>
                </div>
                <p className="text-xs text-th-tx-5 -mt-1">Content will be encrypted and only accessible with this password.</p>
                <PasswordField label="New password" value={pwNew} onChange={setPwNew} visible={pwVisible} onToggle={() => setPwVisible(v => !v)} onEnter={() => {}} />
                <PasswordField label="Confirm password" value={pwConfirm} onChange={setPwConfirm} visible={pwVisible} onToggle={() => setPwVisible(v => !v)} onEnter={handleSetPassword} />
                {pwModalError && <p className="text-xs text-red-400">{pwModalError}</p>}
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setShowPasswordModal(null)} className="flex-1 py-2 rounded-lg text-xs text-th-tx-4 bg-th-bg-5 hover:bg-th-bg-6 transition-colors">Cancel</button>
                  <button onClick={handleSetPassword} className="flex-1 py-2 rounded-lg text-xs font-semibold text-black bg-accent hover:bg-accent-hover transition-colors">Set password</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <KeyRound size={16} className="text-[#e8b800]" />
                  <h3 className="text-sm font-semibold text-th-tx-1">Manage password</h3>
                </div>

                {/* Change password */}
                <div className="flex flex-col gap-2 pb-4 border-b border-th-bd-1">
                  <p className="text-xs text-th-tx-4">Change password</p>
                  <PasswordField label="New password" value={pwNew} onChange={setPwNew} visible={pwVisible} onToggle={() => setPwVisible(v => !v)} onEnter={() => {}} />
                  <PasswordField label="Confirm password" value={pwConfirm} onChange={setPwConfirm} visible={pwVisible} onToggle={() => setPwVisible(v => !v)} onEnter={handleChangePassword} />
                  <button onClick={handleChangePassword} className="py-2 rounded-lg text-xs font-semibold text-black bg-accent hover:bg-accent-hover transition-colors">Update password</button>
                </div>

                {/* Remove password */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-th-tx-4">Remove password</p>
                  <PasswordField label="Current password" value={pwCurrent} onChange={setPwCurrent} visible={pwVisible} onToggle={() => setPwVisible(v => !v)} onEnter={handleRemovePassword} />
                  <button onClick={handleRemovePassword} className="py-2 rounded-lg text-xs text-red-400 bg-th-danger hover:bg-th-danger transition-colors">Remove password</button>
                </div>

                {pwModalError && <p className="text-xs text-red-400">{pwModalError}</p>}
                <button onClick={() => setShowPasswordModal(null)} className="py-2 rounded-lg text-xs text-th-tx-4 bg-th-bg-5 hover:bg-th-bg-6 transition-colors">Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
