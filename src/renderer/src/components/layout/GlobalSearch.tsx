import React, { useState, useEffect, useRef } from 'react'
import { Search, FileText, Code2, GitBranch, CheckSquare, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface SearchResult {
  id: string
  title: string
  type: 'note' | 'code' | 'flow' | 'work-item'
  snippet: string
  updated_at: number
}

const typeIcon = {
  note: <FileText size={14} />,
  code: <Code2 size={14} />,
  flow: <GitBranch size={14} />,
  'work-item': <CheckSquare size={14} />
}

const typeLabel = {
  note: 'Note',
  code: 'Code',
  flow: 'Flow',
  'work-item': 'Work Item'
}

export default function GlobalSearch(): React.JSX.Element {
  const { searchOpen, setSearchOpen, openTab } = useAppStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) {
      setQuery('')
      setResults([])
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [searchOpen])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      const res = await window.api?.search.global(query)
      setResults(res || [])
      setSelected(0)
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (result: SearchResult): void => {
    openTab({ entityType: result.type, entityId: result.id, title: result.title })
    setSearchOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && results[selected]) {
      handleSelect(results[selected])
    } else if (e.key === 'Escape') {
      setSearchOpen(false)
    }
  }

  if (!searchOpen) return <></>

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60"
      onClick={() => setSearchOpen(false)}
    >
      <div
        className="w-[600px] bg-[#222] border border-[#484848] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#383838]">
          <Search size={16} className="text-[#aaa]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search everything..."
            className="flex-1 bg-transparent text-[#f0f0f0] placeholder-[#777] text-sm outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[#888] hover:text-[#ddd]">
              <X size={14} />
            </button>
          )}
          <span className="text-[#777] text-xs">Esc</span>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-1">
            {results.map((result, i) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-all ${
                  i === selected ? 'bg-[#2e2e2e]' : 'hover:bg-[#282828]'
                }`}
              >
                <span className="text-[#aaa] mt-0.5 flex-shrink-0">{typeIcon[result.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#f0f0f0] truncate">{result.title}</span>
                    <span className="text-xs text-[#888] flex-shrink-0">{typeLabel[result.type]}</span>
                  </div>
                  {result.snippet && (
                    <p
                      className="text-xs text-[#aaa] mt-0.5 truncate"
                      dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {query && results.length === 0 && (
          <div className="px-4 py-6 text-center text-[#888] text-sm">No results for "{query}"</div>
        )}

        {!query && (
          <div className="px-4 py-4 text-center text-[#777] text-xs">
            Type to search notes, code, flows, and ADO work items
          </div>
        )}
      </div>
    </div>
  )
}
