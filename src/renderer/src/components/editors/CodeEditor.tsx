import React, { useEffect, useState, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Pin, Trash2, ChevronDown, Link2, Plus, Clipboard, CheckSquare, Square, ExternalLink, X, AlertTriangle, Copy, Check, FileText } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import WorkItemSearch from '../WorkItemSearch'
import { type WorkItem, TYPE_COLORS, DONE_STATES } from '../../lib/workItemUtils'

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

  const titleRef = useRef('')
  const languageRef = useRef('plaintext')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadBlock()
    loadWorkItems()
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

  const unlinkNote = async (): Promise<void> => {
    await window.api?.code.unlinkNote(blockId)
    setLinkedNote(null)
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

  const effectiveDone = (i: WorkItem): boolean =>
    i.is_ado && i.cached_state ? DONE_STATES.has(i.cached_state) : !!i.is_done
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

      {/* Work items panel */}
      <div className={`w-60 flex-shrink-0 border-l border-th-bd-1 bg-th-bg-1 flex flex-col transition-opacity ${allDone ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-th-bd-1">
          <div className="flex items-center gap-1.5">
            <Link2 size={12} className="text-th-tx-5" />
            <span className="text-xs text-th-tx-4 font-medium uppercase tracking-wide">Work Items</span>
            {allDone && <span className="text-xs text-accent ml-1">✓ Done</span>}
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={pasteWorkItem} title="Paste from clipboard" className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all">
              <Clipboard size={12} />
            </button>
            {!adoConfigured && (
              <button
                onClick={() => setShowAddItem(!showAddItem)}
                className="p-1.5 rounded text-th-tx-6 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        </div>

        {adoConfigured && (
          <div className="px-3 py-2 border-b border-th-bd-1">
            <WorkItemSearch
              onAdd={(url) => { addWorkItem(url) }}
            />
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
                  <button onClick={() => removeWorkItem(item.id)} className="text-th-tx-6 group-hover:text-th-tx-5 hover:!text-red-400 transition-colors p-0.5">
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Linked in note */}
        {linkedNote && (
          <div className="border-t border-th-bd-1 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-2.5">
              <FileText size={12} className="text-th-tx-5" />
              <span className="text-xs text-th-tx-4 font-medium uppercase tracking-wide">Linked in</span>
            </div>
            <div className="flex items-center gap-1 px-2 pb-2 group">
              <button
                onClick={() => openTab({ entityType: 'note', entityId: linkedNote.id, title: linkedNote.title })}
                className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-th-bg-3 transition-all text-left min-w-0"
              >
                <FileText size={12} className="text-th-tx-5 flex-shrink-0" />
                <span className="text-xs text-th-tx-2 truncate hover:text-accent transition-colors">{linkedNote.title}</span>
              </button>
              <button
                onClick={unlinkNote}
                title="Unlink from note"
                className="p-1 rounded text-th-tx-6 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
