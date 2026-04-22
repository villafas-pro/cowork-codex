import React, { useEffect, useState, useCallback, useRef } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import Editor from '@monaco-editor/react'
import { Code2, Copy, Check, ExternalLink, X, ChevronDown } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'csharp', 'sql',
  'html', 'css', 'json', 'markdown', 'bash', 'yaml', 'go', 'rust',
  'java', 'php', 'ruby', 'cpp', 'xml', 'powershell',
]

export default function CodeEmbedView({ node, deleteNode, selected }: NodeViewProps): React.JSX.Element {
  const { blockId } = node.attrs
  const { openTab } = useAppStore()

  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('plaintext')
  const [content, setContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const titleRef = useRef('')
  const languageRef = useRef('plaintext')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!blockId) return
    window.api?.code.get(blockId).then((block: any) => {
      if (!block) return
      const t = block.title || ''
      setTitle(t)
      titleRef.current = t
      setLanguage(block.language || 'plaintext')
      languageRef.current = block.language || 'plaintext'
      setContent(block.content || '')
      setLoaded(true)
    })
  }, [blockId])

  const scheduleSave = useCallback((t: string, lang: string, c: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api?.code.update(blockId, { title: t, language: lang, content: c })
    }, 500)
  }, [blockId])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value
    setTitle(val)
    titleRef.current = val
    scheduleSave(val, languageRef.current, content)
  }

  const handleContentChange = (value: string | undefined): void => {
    const val = value || ''
    setContent(val)
    scheduleSave(titleRef.current, languageRef.current, val)
  }

  const handleLanguageChange = (lang: string): void => {
    setLanguage(lang)
    languageRef.current = lang
    setShowLangPicker(false)
    scheduleSave(titleRef.current, lang, content)
  }

  const copyContent = async (): Promise<void> => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const openFull = (): void => {
    openTab({ entityType: 'code', entityId: blockId, title: title || 'Untitled' })
  }

  const remove = async (): Promise<void> => {
    await window.api?.code.unlinkNote(blockId)
    deleteNode()
  }

  return (
    <NodeViewWrapper>
      <div
        className={`my-3 rounded-lg border overflow-hidden bg-[#1e1e1e] transition-all ${selected ? 'border-accent shadow-[0_0_0_1px_#e8b800]' : 'border-th-bd-2'}`}
        contentEditable={false}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={() => setShowLangPicker(false)}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-th-bg-2 border-b border-th-bd-1">
          <Code2 size={12} className="text-th-tx-5 flex-shrink-0" />
          <input
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            onMouseDown={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-xs text-th-tx-1 placeholder-th-tx-5 outline-none caret-accent min-w-0"
          />

          {/* Language picker */}
          <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowLangPicker((v) => !v)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-th-bg-5 border border-th-bd-2 text-[10px] text-th-tx-4 hover:text-th-tx-2 hover:border-th-bd-3 transition-all"
            >
              {language}
              <ChevronDown size={9} />
            </button>
            {showLangPicker && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-th-bg-4 border border-th-bd-3 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="max-h-48 overflow-y-auto py-1">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => handleLanguageChange(lang)}
                      className={`w-full text-left px-3 py-1 text-[11px] transition-colors ${lang === language ? 'text-accent bg-th-bg-6' : 'text-th-tx-2 hover:bg-th-bg-6 hover:text-th-tx-1'}`}
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
            title="Copy all"
            className={`p-1 rounded transition-all flex-shrink-0 ${copied ? 'text-accent' : 'text-th-tx-5 hover:text-th-tx-2'}`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            onClick={openFull}
            title="Open in full page"
            className="p-1 rounded text-th-tx-5 hover:text-th-tx-2 transition-all flex-shrink-0"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={remove}
            title="Remove from note"
            className="p-1 rounded text-th-tx-5 hover:text-red-400 transition-all flex-shrink-0"
          >
            <X size={12} />
          </button>
        </div>

        {/* Monaco editor — only rendered once data is loaded */}
        {loaded ? (
          <div onMouseDown={(e) => e.stopPropagation()}>
          <Editor
            height="200px"
            language={language}
            value={content}
            onChange={handleContentChange}
            theme="vs-dark"
            options={{
              fontSize: 12,
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 10, bottom: 10 },
              renderLineHighlight: 'none',
              smoothScrolling: true,
              tabSize: 2,
              automaticLayout: true,
              scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
            }}
          />
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center">
            <span className="text-xs text-th-tx-6">Loading…</span>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}
