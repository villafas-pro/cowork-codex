import React, { useState, useEffect, useRef } from 'react'
import { Search, Loader, User, Plus } from 'lucide-react'

interface WorkItemResult {
  id: number
  title: string
  type: string
  state: string
  assignedTo: string
  url: string
}

interface Props {
  onAdd: (url: string, itemNumber: string) => void
  onCancel?: () => void
}

const WORK_ITEM_TYPES = ['', 'Bug', 'Task', 'User Story', 'Feature', 'Epic', 'Test Case']
const WORK_ITEM_STATES = ['', 'Active', 'New', 'Resolved', 'Closed', 'In Progress', 'Done']

const TYPE_COLORS: Record<string, string> = {
  'Bug': '#cc3333',
  'Task': '#007acc',
  'User Story': '#009933',
  'Feature': '#773b93',
  'Epic': '#ff6600',
  'Test Case': '#004b50',
}

export default function WorkItemSearch({ onAdd }: Props): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [type, setType] = useState('')
  const [state, setState] = useState('')
  const [results, setResults] = useState<WorkItemResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  async function doSearch(): Promise<void> {
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await window.api?.ado.search({ search, assignedToMe, type, state })
      setResults(res || [])
    } catch (e: any) {
      setError('Search failed. Check your ADO settings.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') doSearch()
    if (e.key === 'Escape') onCancel()
  }

  const selectClass = 'bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-1 text-xs text-[#ccc] outline-none focus:border-accent appearance-none cursor-pointer'

  return (
    <div className="flex flex-col gap-2">
      {/* Search input */}
      <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#383838] rounded-lg px-2 focus-within:border-accent transition-colors">
        <Search size={11} className="text-[#555] flex-shrink-0" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="ID or title..."
          className="flex-1 bg-transparent text-xs text-[#e5e5e5] placeholder-[#444] outline-none focus:outline-none py-1.5"
        />
        {loading
          ? <Loader size={11} className="text-[#555] animate-spin flex-shrink-0" />
          : <button onClick={doSearch} className="text-[#555] hover:text-accent transition-colors flex-shrink-0">
              <Search size={11} />
            </button>
        }
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Assigned to me toggle */}
        <button
          onClick={() => setAssignedToMe((v) => !v)}
          title="Assigned to me"
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all ${assignedToMe ? 'border-accent text-accent bg-[#e8b80015]' : 'border-[#333] text-[#666] hover:text-[#aaa] hover:border-[#444]'}`}
        >
          <User size={10} />
          Me
        </button>

        {/* Type filter */}
        <div className="relative">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectClass}
          >
            <option value="">All types</option>
            {WORK_ITEM_TYPES.filter(Boolean).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* State filter */}
        <div className="relative">
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className={selectClass}
          >
            <option value="">All states</option>
            {WORK_ITEM_STATES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {error && (
        <p className="text-xs text-red-400 px-1">{error}</p>
      )}

      {!loading && searched && results.length === 0 && !error && (
        <p className="text-xs text-[#555] text-center py-3">No results</p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
          {results.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-1.5 px-2 py-2 rounded-lg hover:bg-[#252525] transition-all group border border-transparent hover:border-[#333]"
            >
              {/* Type dot */}
              <span
                className="w-2 h-2 rounded-sm flex-shrink-0 mt-0.5"
                style={{ background: TYPE_COLORS[item.type] || '#555' }}
              />
              {/* Info */}
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-xs text-[#e5e5e5] truncate">{item.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#666]">#{item.id}</span>
                  <span className="text-[10px] text-[#555]">{item.state}</span>
                  {item.assignedTo && (
                    <span className="text-[10px] text-[#555] truncate">{item.assignedTo.split(' ')[0]}</span>
                  )}
                </div>
              </div>
              {/* Add button */}
              <button
                onClick={() => onAdd(item.url, String(item.id))}
                title="Add work item"
                className="flex-shrink-0 p-1 rounded text-[#444] hover:text-accent hover:bg-[#2a2a2a] transition-all opacity-0 group-hover:opacity-100"
              >
                <Plus size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
