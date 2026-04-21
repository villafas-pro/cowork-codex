import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader, User, Plus, ExternalLink, AlertCircle, Layers } from 'lucide-react'
import { useAppStore } from '../store/appStore'

interface WorkItemResult {
  id: number
  title: string
  type: string
  state: string
  assignedTo: string
  url: string
}

interface CachedDetails {
  description: string
  acceptance_criteria: string
  priority: number | null
  story_points: number | null
  assigned_to: string
  created_by: string
  iteration_path: string
  tags: string
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

const STATE_COLORS: Record<string, string> = {
  'Active': '#007acc',
  'In Progress': '#007acc',
  'New': '#888',
  'Resolved': '#009933',
  'Done': '#009933',
  'Closed': '#555',
}

const PRIORITY_LABELS: Record<number, string> = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' }
const PRIORITY_COLORS: Record<number, string> = { 1: '#cc3333', 2: '#e8b800', 3: '#007acc', 4: '#666' }

function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const POPUP_WIDTH = 288

export default function WorkItemSearch({ onAdd }: Props): React.JSX.Element {
  const { openTab } = useAppStore()
  const [search, setSearch] = useState('')
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [type, setType] = useState('')
  const [state, setState] = useState('')
  const [results, setResults] = useState<WorkItemResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')

  // Hover popup state
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [popupPos, setPopupPos] = useState({ top: 0, right: 0 })
  const [details, setDetails] = useState<CachedDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsVisible, setDetailsVisible] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  }

  const handleRowEnter = useCallback((item: WorkItemResult, el: HTMLDivElement) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    if (enterTimer.current) clearTimeout(enterTimer.current)

    // Position popup to the left of the panel
    const rect = el.getBoundingClientRect()
    const top = Math.min(rect.top, window.innerHeight - 280)
    const right = window.innerWidth - rect.left + 8

    setPopupPos({ top, right })
    setHoveredId(item.id)
    setDetails(null)
    setDetailsVisible(false)

    // Fetch details after short delay
    enterTimer.current = setTimeout(async () => {
      setDetailsLoading(true)
      try {
        const cached = await window.api?.ado.fetchWorkItem(item.id)
        if (cached) {
          setDetails(cached)
          // Let the DOM paint at opacity:0 first, then fade in
          requestAnimationFrame(() => requestAnimationFrame(() => setDetailsVisible(true)))
        }
      } catch { /* silently fail */ }
      finally { setDetailsLoading(false) }
    }, 280)
  }, [])

  const handleRowLeave = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current)
    leaveTimer.current = setTimeout(() => {
      setHoveredId(null)
      setDetails(null)
    }, 120)
  }, [])

  const handlePopupEnter = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
  }, [])

  const handlePopupLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => {
      setHoveredId(null)
      setDetails(null)
    }, 120)
  }, [])

  // Find the hovered result
  const hoveredResult = results.find((r) => r.id === hoveredId)

  const selectClass = 'bg-[#1a1a1a] border border-[#333] rounded px-1.5 py-1 text-xs text-[#ccc] outline-none focus:border-accent appearance-none cursor-pointer'

  return (
    <>
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
          <button
            onClick={() => setAssignedToMe((v) => !v)}
            title="Assigned to me"
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all ${assignedToMe ? 'border-accent text-accent bg-[#e8b80015]' : 'border-[#333] text-[#666] hover:text-[#aaa] hover:border-[#444]'}`}
          >
            <User size={10} />
            Me
          </button>
          <div className="relative">
            <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
              <option value="">All types</option>
              {WORK_ITEM_TYPES.filter(Boolean).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <select value={state} onChange={(e) => setState(e.target.value)} className={selectClass}>
              <option value="">All states</option>
              {WORK_ITEM_STATES.filter(Boolean).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        {error && <p className="text-xs text-red-400 px-1">{error}</p>}
        {!loading && searched && results.length === 0 && !error && (
          <p className="text-xs text-[#555] text-center py-3">No results</p>
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
            {results.map((item) => (
              <div
                key={item.id}
                ref={(el) => { if (el && hoveredId === item.id) { /* already tracking */ } }}
                onMouseEnter={(e) => handleRowEnter(item, e.currentTarget)}
                onMouseLeave={handleRowLeave}
                onClick={() => openTab({ entityType: 'work-item', entityId: String(item.id), title: `#${item.id}` })}
                className="flex items-center gap-1.5 px-2 py-2 rounded-lg hover:bg-[#252525] transition-all group border border-transparent hover:border-[#333] cursor-pointer"
              >
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0 mt-0.5"
                  style={{ background: TYPE_COLORS[item.type] || '#555' }}
                />
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
                <button
                  onClick={(e) => { e.stopPropagation(); onAdd(item.url, String(item.id)) }}
                  title="Link to current item"
                  className="flex-shrink-0 p-1 rounded text-[#444] hover:text-accent hover:bg-[#2a2a2a] transition-all opacity-0 group-hover:opacity-100"
                >
                  <Plus size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hover popup — rendered via fixed positioning to escape overflow clipping */}
      {hoveredId !== null && hoveredResult && (
        <div
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handlePopupLeave}
          style={{
            position: 'fixed',
            top: popupPos.top,
            right: popupPos.right,
            width: POPUP_WIDTH,
            zIndex: 9999,
          }}
          className="bg-[#242424] border border-[#484848] rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Type + state header */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-2.5">
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded"
              style={{
                background: (TYPE_COLORS[hoveredResult.type] || '#888') + '33',
                color: TYPE_COLORS[hoveredResult.type] || '#ccc',
                border: `1px solid ${(TYPE_COLORS[hoveredResult.type] || '#888')}66`
              }}
            >
              {hoveredResult.type}
            </span>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: (STATE_COLORS[hoveredResult.state] || '#888') + '33',
                color: STATE_COLORS[hoveredResult.state] || '#ccc',
              }}
            >
              {hoveredResult.state}
            </span>
            <span className="text-[10px] text-[#666] ml-auto">#{hoveredResult.id}</span>
          </div>

          {/* Title */}
          <p className="px-3 pb-3 text-[13px] font-semibold text-white leading-snug">
            {hoveredResult.title}
          </p>

          {/* Details area — animates height as content loads */}
          <div
            className="overflow-hidden"
            style={{
              maxHeight: details ? '420px' : detailsLoading ? '52px' : '0px',
              transition: 'max-height 1.1s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div className="border-t border-[#363636]">
              {detailsLoading && !details && (
                <div className="flex items-center gap-1.5 px-3 py-3">
                  <Loader size={10} className="text-[#888] animate-spin" />
                  <span className="text-[11px] text-[#888]">Loading details…</span>
                </div>
              )}

              {details && (
                <div
                  className="px-3 pt-4 pb-5 flex flex-col gap-4"
                  style={{
                    opacity: detailsVisible ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  {/* Assigned to */}
                  {(details.assigned_to || hoveredResult.assignedTo) && (
                    <div className="flex items-center gap-2">
                      <User size={11} className="text-[#777] flex-shrink-0" />
                      <span className="text-[11px] text-[#c0c0c0]">
                        {details.assigned_to || hoveredResult.assignedTo}
                      </span>
                    </div>
                  )}

                  {/* Priority + Story Points inline */}
                  {(details.priority != null || details.story_points != null) && (
                    <div className="flex items-center gap-4">
                      {details.priority != null && (
                        <div className="flex items-center gap-1.5">
                          <AlertCircle size={11} className="flex-shrink-0" style={{ color: PRIORITY_COLORS[details.priority] || '#aaa' }} />
                          <span className="text-[11px] font-medium" style={{ color: PRIORITY_COLORS[details.priority] || '#aaa' }}>
                            {PRIORITY_LABELS[details.priority] || `P${details.priority}`}
                          </span>
                        </div>
                      )}
                      {details.story_points != null && (
                        <div className="flex items-center gap-1.5">
                          <Layers size={11} className="text-[#777]" />
                          <span className="text-[11px] text-[#c0c0c0]">{details.story_points} pts</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Iteration */}
                  {details.iteration_path && (
                    <p className="text-[11px] text-[#999] truncate">
                      📅 {details.iteration_path.split('\\').pop()}
                    </p>
                  )}

                  {/* Description snippet */}
                  {details.description && (
                    <p className="text-[11px] text-[#b0b0b0] leading-relaxed line-clamp-3 border-t border-[#363636] pt-3">
                      {stripHtml(details.description).slice(0, 220)}
                      {stripHtml(details.description).length > 220 ? '…' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center border-t border-[#363636] bg-[#1c1c1c]">
            <button
              onClick={() => openTab({ entityType: 'work-item', entityId: String(hoveredResult.id), title: `#${hoveredResult.id}` })}
              className="flex-1 text-center text-[11px] font-medium text-[#c0c0c0] hover:text-white hover:bg-[#2a2a2a] transition-all py-2"
            >
              Open in app
            </button>
            <div className="w-px h-5 bg-[#363636]" />
            <button
              onClick={() => window.api?.shell.openExternal(hoveredResult.url)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#c0c0c0] hover:text-white hover:bg-[#2a2a2a] transition-all py-2 px-3"
            >
              <ExternalLink size={11} />
              Open in ADO
            </button>
          </div>
        </div>
      )}
    </>
  )
}
