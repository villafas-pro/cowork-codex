import React, { useEffect, useState, useCallback, useRef } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import Editor from '@monaco-editor/react'
import { Code2, Copy, Check, ExternalLink, X, ChevronDown, GripVertical } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'csharp', 'sql',
  'html', 'css', 'json', 'markdown', 'bash', 'yaml', 'go', 'rust',
  'java', 'php', 'ruby', 'cpp', 'xml', 'powershell',
]

const MIN_HEIGHT = 200

export default function CodeEmbedView({ node, deleteNode, selected, getPos, editor }: NodeViewProps): React.JSX.Element {
  const { blockId } = node.attrs
  const { openTab } = useAppStore()

  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('plaintext')
  const [content, setContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [editorHeight, setEditorHeight] = useState(MIN_HEIGHT)

  const titleRef = useRef('')
  const languageRef = useRef('plaintext')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragFromGrip = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const embedFocusedRef = useRef(false)

  // Native capture-phase listener on the editor DOM so we can call
  // dataTransfer.setData() while the drag data store is still writable
  // (React synthetic onDragStart fires too late — after propagation ends).
  useEffect(() => {
    const editorDom = editor.view.dom
    const handler = (e: DragEvent): void => {
      const pos = getPos()
      if (pos === undefined) return
      // Only handle dragstart events that target THIS embed's NodeViewWrapper
      if (e.target !== editor.view.nodeDOM(pos)) return

      if (!dragFromGrip.current) {
        e.preventDefault() // cancel drags not initiated from the grip
        return
      }
      dragFromGrip.current = false
      if (!e.dataTransfer) return
      e.dataTransfer.clearData()
      e.dataTransfer.setData('application/cowork-embed', JSON.stringify({ pos, nodeSize: node.nodeSize }))
      e.dataTransfer.effectAllowed = 'move'
    }
    editorDom.addEventListener('dragstart', handler, true) // capture = before ProseMirror
    return () => editorDom.removeEventListener('dragstart', handler, true)
  }, [editor, getPos, node.nodeSize])

  // Use a ref so the wheel handler always reads the live focused value
  // without needing to re-register on every focus change.
  useEffect(() => {
    const focusHandler = (e: MouseEvent): void => {
      embedFocusedRef.current = !!wrapperRef.current?.contains(e.target as Node)
    }
    document.addEventListener('mousedown', focusHandler, true)

    const wrapper = wrapperRef.current
    const wheelHandler = (e: WheelEvent): void => {
      if (embedFocusedRef.current) return
      e.stopPropagation()
      e.preventDefault()
      let parent = wrapper?.parentElement
      while (parent) {
        const overflow = window.getComputedStyle(parent).overflowY
        if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight) {
          parent.scrollTop += e.deltaY
          break
        }
        parent = parent.parentElement
      }
    }
    wrapper?.addEventListener('wheel', wheelHandler, { capture: true, passive: false })

    return () => {
      document.removeEventListener('mousedown', focusHandler, true)
      wrapper?.removeEventListener('wheel', wheelHandler, true)
    }
  }, [])

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

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const startH = editorHeight
    const onMouseMove = (ev: MouseEvent): void => {
      const next = Math.max(MIN_HEIGHT, startH + (ev.clientY - startY))
      setEditorHeight(next)
    }
    const onMouseUp = (): void => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [editorHeight])

  return (
    <NodeViewWrapper>
      <div
        ref={wrapperRef}
        className={`my-3 rounded-lg border overflow-hidden bg-[#1e1e1e] transition-all ${selected ? 'border-accent shadow-[0_0_0_1px_#e8b800]' : 'border-th-bd-2'}`}
        contentEditable={false}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={() => setShowLangPicker(false)}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-th-bg-2 border-b border-th-bd-1 select-none">
          <GripVertical
            size={12}
            className="text-th-tx-6 hover:text-th-tx-4 flex-shrink-0 cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => { e.stopPropagation(); dragFromGrip.current = true }}
          />
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
          <div
            style={{ position: 'relative', height: editorHeight }}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.stopPropagation()}
          >
            <Editor
              height={editorHeight}
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
            {/* Resize handle */}
            <div
              onMouseDown={onResizeMouseDown}
              className="absolute bottom-0 right-0 w-5 h-5 cursor-ns-resize flex items-end justify-end pb-1 pr-1 z-10 group"
              title="Drag to resize"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" className="text-th-tx-6 group-hover:text-th-tx-3 transition-colors">
                <path d="M 9 1 L 1 9 M 9 5 L 5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        ) : (
          <div style={{ height: editorHeight }} className="flex items-center justify-center">
            <span className="text-xs text-th-tx-6">Loading…</span>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}
