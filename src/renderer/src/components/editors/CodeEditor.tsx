import React, { useEffect, useState, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Pin, Trash2, ChevronDown, Link2, Plus, Clipboard, X, Copy, Check, FileText } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import WorkItemSearch from '../WorkItemSearch'
import { type WorkItem, effectiveDone } from '../../lib/workItemUtils'
import WorkItemRow from '../WorkItemRow'

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'csharp', 'sql',
  'html', 'css', 'json', 'markdown', 'bash', 'yaml', 'go', 'rust',
  'java', 'php', 'ruby', 'cpp', 'xml', 'powershell'
]

export default function CodeEditor({ blockId }: { blockId: string }): React.JSX.Element {
  const { updateTabTitle, closeTab, tabs, setActiveSection, openTab, adoStatus } = useAppStore()
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('plaintext')
  const [content, setContent] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [newItemUrl, setNewItemUrl] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [adoConfigured, setAdoConfigured] = useState(false)
  const [copied, setCopied] = useState(false)
  const [linkedNote, setLinkedNote] = useState<{ id: string; title: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'notes' | 'work-items'>('notes')
  const [allNotes, setAllNotes] = useState<Array<{ id: string; title: string }>>([])
  const [noteSearch, setNoteSearch] = useState('')

  const titleRef = useRef('')
  const languageRef = useRef('plaintext')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadBlock()
    loadWorkItems()
    loadAllNotes()
    window.api?.ado.isConfigured().then(setAdoConfigured)
  }, [blockId])

  async function loadBlock(): Promise<void> {
    const block = await window.api?.code.get(blockId)
    if (!block) return
    const t = block.title || ''
    setTitle(t)
    titleRef.current = t
    setLanguage(block.language || 'plaintext')
    languageRef.current = block.language || 'plaintext'
    setContent(block.content || '')
    setIsPinned(!!block.is_pinned)
    updateTabTitle(blockId, t || 'Untitled')
    if (block.note_id) {
      const note = await window.api?.notes.get(block.note_id)
      setLinkedNote(note ? { id: note.id, title: note.title || 'Untitled' } : null)
    } else {
      setLinkedNote(null)
    }
  }

  async function loadWorkItems(): Promise<void> {
    const items = await window.api?.workItems.getForEntity('code', blockId)
    setWorkItems(items || [])
  }

  async function loadAllNotes(): Promise<void> {
    const notes = await window.api?.notes.getAll()
    setAllNotes(notes || [])
  }

  const appendToNote = async (note: { id: string; title: string }): Promise<void> => {
    const full = await window.api?.notes.get(note.id)
    let doc: any = { type: 'doc', content: [{ type: 'paragraph' }] }
    if (full?.content && full.content !== '{}') {
      try { doc = JSON.parse(full.content) } catch { /* keep default */ }
    }
    doc.content = [...(doc.content || []), { type: 'codeEmbed', attrs: { blockId } }, { type: 'paragraph' }]
    await window.api?.notes.update(note.id, { content: JSON.stringify(doc) })
    await window.api?.code.linkNote(blockId, note.id)
    setLinkedNote({ id: note.id, title: note.title || 'Untitled' })
    openTab({ entityType: 'note', entityId: note.id, title: note.title || 'Untitled' })
  }

  const createNewNote = async (): Promise<void> => {
    const noteContent = JSON.stringify({
      type: 'doc',
      content: [{ type: 'codeEmbed', attrs: { blockId } }, { type: 'paragraph' }],
    })
    const note = await window.api?.notes.create({ title: '', content: noteContent })
    if (!note) return
    await window.api?.code.linkNote(blockId, note.id)
    setLinkedNote({ id: note.id, title: note.title || 'Untitled' })
    await loadAllNotes()
    openTab({ entityType: 'note', entityId: note.id, title: 'Untitled' })
  }

  const unlinkNote = async (): Promise<void> => {
    await window.api?.code.unlinkNote(blockId)
    setLinkedNote(null)
  }

  const scheduleSave = useCallback((t: string, lang: string, c: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await window.api?.code.update(blockId, { title: t, language: lang, content: c })
    }, 500)
  }, [blockId])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value
    setTitle(val)
    titleRef.current = val
    updateTabTitle(blockId, val || 'Untitled')
    scheduleSave(val, languageRef.current, content)
  }

  const handleLanguageChange = (lang: string): void => {
    setLanguage(lang)
    languageRef.current = lang
    setShowLangPicker(false)
    scheduleSave(titleRef.current, lang, content)
  }

  const handleContentChange = (value: string | undefined): void => {
    const val = value || ''
    setContent(val)
    scheduleSave(titleRef.current, languageRef.current, val)
  }

  const copyContent = async (): Promise<void> => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const togglePin = async (): Promise<void> => {
    await window.api?.code.togglePin(blockId)
    setIsPinned((p) => !p)
  }

  const deleteBlock = async (): Promise<void> => {
    if (!window.confirm(`Delete "${titleRef.current || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.code.delete(blockId)
    const tab = tabs.find((t) => t.entityType === 'code' && t.entityId === blockId)
    if (tab) closeTab(tab.id)
    setActiveSection('code')
  }

  const addWorkItem = async (url?: string): Promise<void> => {
    const target = url || newItemUrl.trim()
    if (!target) return
    const item = await window.api?.workItems.create(target, 'code', blockId)
    if (item) {
      setNewItemUrl('')
      setShowAddItem(false)
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
    await window.api?.workItems.unlink(workItemId, 'code', blockId)
    setWorkItems((prev) => prev.filter((i) => i.id !== workItemId))
  }

  const allDone = workItems.length > 0 && workItems.every(effectiveDone)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-th-bd-1 bg-th-bg-1 flex-shrink-0">
          {/* Title */}
          <input
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            className="flex-1 bg-transparent text-sm text-th-tx-1 placeholder-th-tx-5 outline-none caret-accent min-w-0"
          />

          {/* Language picker */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowLangPicker((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-th-bg-5 border border-th-bd-2 text-xs text-th-tx-2 hover:text-th-tx-1 hover:border-th-bd-3 transition-all"
            >
              {language}
              <ChevronDown size={11} />
            </button>
            {showLangPicker && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-th-bg-4 border border-th-bd-3 rounded-lg shadow-xl z-20 overflow-hidden">
                <div className="max-h-56 overflow-y-auto py-1">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => handleLanguageChange(lang)}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        lang === language ? 'text-accent bg-th-bg-6' : 'text-th-tx-2 hover:bg-th-bg-6 hover:text-th-tx-1'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={copyContent}
            className={`p-1.5 rounded transition-all flex-shrink-0 ${copied ? 'text-accent' : 'text-th-tx-5 hover:text-th-tx-2'}`}
            title="Copy all"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            onClick={togglePin}
            className={`p-1.5 rounded transition-all flex-shrink-0 ${isPinned ? 'text-accent' : 'text-th-tx-5 hover:text-th-tx-2'}`}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={13} />
          </button>
          <button
            onClick={deleteBlock}
            className="p-1.5 rounded transition-all text-th-tx-5 hover:text-red-400 hover:bg-th-danger flex-shrink-0"
            title="Delete block"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Monaco editor */}
        <div className="flex-1 overflow-hidden" onClick={() => setShowLangPicker(false)}>
          <Editor
            height="100%"
            language={language}
            value={content}
            onChange={handleContentChange}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
              renderLineHighlight: 'gutter',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              tabSize: 2,
              automaticLayout: true,
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
            }}
          />
        </div>
      </div>

      {/* Right panel */}
      <div className="w-60 flex-shrink-0 border-l border-th-bd-1 bg-th-bg-1 flex flex-col">

        {/* Tab bar */}
        <div className="flex border-b border-th-bd-1 flex-shrink-0">
          {([
            { id: 'notes',      icon: <FileText size={11} />, label: 'Notes' },
            { id: 'work-items', icon: <Link2 size={11} />,    label: 'Work Items' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setNoteSearch('') }}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-medium uppercase tracking-wide transition-colors border-b-2 ${
                activeTab === tab.id ? 'text-accent border-accent' : 'text-th-tx-5 border-transparent hover:text-th-tx-3'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Notes tab */}
        {activeTab === 'notes' && (<>
          <div className="px-3 py-2 border-b border-th-bd-1 flex-shrink-0 flex items-center gap-2">
            <input
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-th-bg-3 border border-th-bd-2 rounded px-2 py-1 text-xs text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent"
            />
            <button onClick={createNewNote} title="New note with this block" className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all flex-shrink-0">
              <Plus size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Linked */}
            {linkedNote && (!noteSearch || (linkedNote.title || 'Untitled').toLowerCase().includes(noteSearch.toLowerCase())) && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] text-th-tx-6 uppercase tracking-wide">Linked</p>
                <div className="flex items-center gap-1 px-2 group">
                  <button
                    onClick={() => openTab({ entityType: 'note', entityId: linkedNote.id, title: linkedNote.title })}
                    className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-th-bg-3 transition-all text-left min-w-0"
                  >
                    <FileText size={12} className="text-th-tx-5 flex-shrink-0" />
                    <span className="text-xs text-th-tx-2 truncate hover:text-accent transition-colors">{linkedNote.title || 'Untitled'}</span>
                  </button>
                  <button onClick={unlinkNote} title="Unlink" className="p-1 rounded text-th-tx-6 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                    <X size={11} />
                  </button>
                </div>
              </>
            )}
            {/* All notes */}
            {(() => {
              const others = allNotes.filter(n =>
                n.id !== linkedNote?.id &&
                (!noteSearch || (n.title || 'Untitled').toLowerCase().includes(noteSearch.toLowerCase()))
              )
              if (!others.length) return null
              return (
                <>
                  <p className="px-3 pt-2 pb-1 text-[10px] text-th-tx-6 uppercase tracking-wide">All</p>
                  {others.map((n) => (
                    <div key={n.id} className="flex items-center gap-1 px-2 group">
                      <button
                        onClick={() => openTab({ entityType: 'note', entityId: n.id, title: n.title })}
                        className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-th-bg-3 transition-all text-left min-w-0"
                      >
                        <FileText size={12} className="text-th-tx-6 flex-shrink-0" />
                        <span className="text-xs text-th-tx-4 truncate group-hover:text-th-tx-2 transition-colors">{n.title || 'Untitled'}</span>
                      </button>
                      <button onClick={() => appendToNote(n)} title="Append to this note" className="p-1 rounded text-th-tx-6 hover:text-accent transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                        <Plus size={11} />
                      </button>
                    </div>
                  ))}
                </>
              )
            })()}
            {!linkedNote && allNotes.length === 0 && (
              <p className="text-xs text-th-tx-6 text-center py-6">No notes yet</p>
            )}
          </div>
        </>)}

        {/* Work Items tab */}
        {activeTab === 'work-items' && (<>
          <div className={`flex flex-col flex-1 overflow-hidden transition-opacity ${allDone ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-th-bd-1 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-th-tx-4 font-medium">Linked items</span>
                {allDone && <span className="text-xs text-accent ml-1">✓ Done</span>}
              </div>
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
            </div>
            {adoConfigured && (
              <div className="px-3 py-2 border-b border-th-bd-1">
                <WorkItemSearch onAdd={(url) => { addWorkItem(url) }} />
              </div>
            )}
            {showAddItem && !adoConfigured && (
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
            <div className="flex-1 overflow-y-auto py-1">
              {workItems.length === 0 ? (
                <p className="text-xs text-th-tx-6 text-center py-6">No linked work items</p>
              ) : (
                workItems.map((item) => (
                  <WorkItemRow
                    key={item.id}
                    item={item}
                    adoStatus={adoStatus}
                    onToggle={toggleWorkItem}
                    onOpen={(i) => openTab({ entityType: 'work-item', entityId: i.item_number, title: i.cached_title || `#${i.item_number}` })}
                    onRemove={removeWorkItem}
                  />
                ))
              )}
            </div>
          </div>
        </>)}

      </div>
    </div>
  )
}
