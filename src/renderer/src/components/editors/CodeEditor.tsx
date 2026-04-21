import React, { useEffect, useState, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Pin, Trash2, ChevronDown, Link2, Plus, Clipboard, CheckSquare, Square, ExternalLink, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import WorkItemSearch from '../WorkItemSearch'

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'csharp', 'sql',
  'html', 'css', 'json', 'markdown', 'bash', 'yaml', 'go', 'rust',
  'java', 'php', 'ruby', 'cpp', 'xml', 'powershell'
]

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

export default function CodeEditor({ blockId }: { blockId: string }): React.JSX.Element {
  const { updateTabTitle, closeTab, tabs, setActiveSection, openTab } = useAppStore()
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('plaintext')
  const [content, setContent] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [newItemUrl, setNewItemUrl] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [adoConfigured, setAdoConfigured] = useState(false)

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
    await window.api?.workItems.unlink(workItemId, 'code', blockId)
    setWorkItems((prev) => prev.filter((i) => i.id !== workItemId))
  }

  const allDone = workItems.length > 0 && workItems.every((i) => i.is_done)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#303030] bg-[#141414] flex-shrink-0">
          {/* Title */}
          <input
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            className="flex-1 bg-transparent text-sm font-medium text-white placeholder-[#444] outline-none caret-accent min-w-0"
          />

          {/* Language picker */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowLangPicker((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#252525] border border-[#383838] text-xs text-[#ccc] hover:text-white hover:border-[#505050] transition-all"
            >
              {language}
              <ChevronDown size={11} />
            </button>
            {showLangPicker && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-[#222] border border-[#404040] rounded-lg shadow-xl z-20 overflow-hidden">
                <div className="max-h-56 overflow-y-auto py-1">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => handleLanguageChange(lang)}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        lang === language ? 'text-accent bg-[#2a2a2a]' : 'text-[#ccc] hover:bg-[#2a2a2a] hover:text-white'
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
            onClick={togglePin}
            className={`p-1.5 rounded transition-all flex-shrink-0 ${isPinned ? 'text-accent' : 'text-[#666] hover:text-[#ddd]'}`}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={13} />
          </button>
          <button
            onClick={deleteBlock}
            className="p-1.5 rounded transition-all text-[#666] hover:text-red-400 hover:bg-[#2a1a1a] flex-shrink-0"
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
            <p className="text-xs text-[#333] text-center py-6">No linked work items</p>
          ) : (
            workItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2 px-3 py-2 group hover:bg-[#1a1a1a] transition-all">
                <button onClick={() => toggleWorkItem(item.id)} className="flex-shrink-0 text-[#555] hover:text-accent transition-colors mt-0.5">
                  {item.is_done ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
                </button>
                <button
                  onClick={() => openTab({ entityType: 'work-item', entityId: item.item_number, title: item.cached_title || `#${item.item_number}` })}
                  className={`flex-1 text-left min-w-0 transition-all hover:text-accent ${item.is_done ? 'opacity-40' : ''}`}
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
