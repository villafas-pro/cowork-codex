import React, { useEffect, useState } from 'react'
import { CheckSquare, Square, ExternalLink, Link2, FileText, Code2, Workflow, Plus, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import WorkItemSearch from '../components/WorkItemSearch'

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
  created_at: number
}

const TYPE_COLORS: Record<string, string> = {
  'Bug': '#cc3333', 'Task': '#007acc', 'User Story': '#009933',
  'Feature': '#773b93', 'Epic': '#ff6600', 'Test Case': '#004b50',
}

const STATE_COLORS: Record<string, string> = {
  'Active': '#007acc', 'In Progress': '#007acc', 'New': '#888',
  'Resolved': '#009933', 'Done': '#009933', 'Closed': '#555', 'Removed': '#555',
}

const DONE_STATES = new Set(['Closed', 'Resolved', 'Done', 'Removed'])

function effectiveDone(item: WorkItem): boolean {
  if (item.is_ado && item.cached_state) return DONE_STATES.has(item.cached_state)
  return !!item.is_done
}

export default function WorkItems(): React.JSX.Element {
  const { openTab, adoStatus } = useAppStore()
  const [items, setItems] = useState<WorkItem[]>([])
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all')
  const [adoConfigured, setAdoConfigured] = useState(false)
  // Track which card is showing create-entity actions
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    loadItems()
    window.api?.ado.isConfigured().then(setAdoConfigured)
  }, [])

  async function loadItems(): Promise<void> {
    const all: WorkItem[] = (await window.api?.workItems.getAll()) || []
    setItems(all)
  }

  async function toggleDone(id: string): Promise<void> {
    await window.api?.workItems.toggleDone(id)
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_done: i.is_done ? 0 : 1 } : i)))
  }

  function handleOpen(item: WorkItem): void {
    if (item.is_ado) {
      openTab({
        entityType: 'work-item',
        entityId: item.item_number,
        title: item.cached_title || `#${item.item_number}`
      })
    } else {
      window.api?.shell.openExternal(item.url)
    }
  }

  async function createLinked(item: WorkItem, entityType: 'note' | 'code' | 'flow'): Promise<void> {
    const title = item.cached_title || `#${item.item_number}`
    setCreating(item.id + entityType)
    try {
      let entity: any
      if (entityType === 'note') {
        entity = await window.api?.notes.create({ title })
      } else if (entityType === 'code') {
        entity = await window.api?.code.create({ title })
      } else {
        entity = await window.api?.flows.create({ title })
      }
      if (entity) {
        await window.api?.workItems.link(item.id, entityType, entity.id)
        openTab({ entityType, entityId: entity.id, title })
      }
    } finally {
      setCreating(null)
      setExpandedId(null)
    }
  }

  const filtered = items.filter((i) => {
    const done = effectiveDone(i)
    if (filter === 'open') return !done
    if (filter === 'done') return done
    return true
  })

  const openCount = items.filter((i) => !effectiveDone(i)).length
  const doneCount = items.filter((i) => effectiveDone(i)).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#303030] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-[#666]" />
          <h1 className="text-sm font-medium text-[#d0d0d0]">Work Items</h1>
          {openCount > 0 && (
            <span className="text-[10px] bg-[#252525] border border-[#383838] text-[#888] px-1.5 py-0.5 rounded-full">
              {openCount} open
            </span>
          )}
        </div>
      </div>

      {/* Search bar (ADO search to open items) */}
      {adoConfigured && (
        <div className="px-5 py-3 border-b border-[#282828] flex-shrink-0">
          <WorkItemSearch
            onAdd={(_url, itemNumber) => {
              openTab({ entityType: 'work-item', entityId: itemNumber, title: `#${itemNumber}` })
            }}
            placeholder="Search ADO work items..."
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 px-5 pt-3 pb-1 flex-shrink-0">
        {(['all', 'open', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md text-xs transition-all capitalize ${
              filter === f
                ? 'bg-[#252525] border border-[#404040] text-[#e0e0e0]'
                : 'text-[#666] hover:text-[#aaa]'
            }`}
          >
            {f}
            {f === 'open' && openCount > 0 && <span className="ml-1 text-[#555]">{openCount}</span>}
            {f === 'done' && doneCount > 0 && <span className="ml-1 text-[#555]">{doneCount}</span>}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Link2 size={24} className="text-[#333]" />
            <p className="text-sm text-[#555]">
              {filter === 'done' ? 'No completed items' : filter === 'open' ? 'No open items' : 'No work items yet'}
            </p>
            {filter === 'all' && (
              <p className="text-xs text-[#444]">Link an Azure DevOps item from a note, code block, or flow to see it here</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((item) => {
              const done = effectiveDone(item)
              const isExpanded = expandedId === item.id
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition-all ${
                    done
                      ? 'bg-[#161616] border-[#282828] opacity-50'
                      : 'bg-[#1e1e1e] border-[#303030] hover:border-[#404040]'
                  }`}
                >
                  <div className="flex items-start gap-3 p-3">
                    {/* Checkbox */}
                    {item.is_ado ? (
                      <span className="flex-shrink-0 text-[#555] mt-0.5 cursor-default" title="State managed by ADO">
                        {done ? <CheckSquare size={15} className="text-accent" /> : <Square size={15} />}
                      </span>
                    ) : (
                      <button
                        onClick={() => toggleDone(item.id)}
                        className="flex-shrink-0 text-[#555] hover:text-accent transition-colors mt-0.5"
                      >
                        {done ? <CheckSquare size={15} className="text-accent" /> : <Square size={15} />}
                      </button>
                    )}

                    {/* Content */}
                    <button
                      onClick={() => handleOpen(item)}
                      className="flex-1 text-left min-w-0 group/title"
                    >
                      {item.cached_title ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            {item.cached_type && (
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                style={{
                                  background: (TYPE_COLORS[item.cached_type] || '#555') + '22',
                                  color: TYPE_COLORS[item.cached_type] || '#aaa',
                                  border: `1px solid ${(TYPE_COLORS[item.cached_type] || '#555')}44`,
                                }}
                              >
                                {item.cached_type}
                              </span>
                            )}
                            {item.cached_state && (
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{ color: STATE_COLORS[item.cached_state] || '#888' }}
                              >
                                {item.cached_state}
                              </span>
                            )}
                            <span className="text-[10px] text-[#444] ml-auto">#{item.item_number}</span>
                          </div>
                          <p className={`text-sm leading-snug group-hover/title:text-accent transition-colors ${done ? 'line-through text-[#555]' : 'text-[#e0e0e0]'}`}>
                            {item.cached_title}
                          </p>
                          {item.cached_assigned_to && (
                            <p className="text-[11px] text-[#555] mt-1">{item.cached_assigned_to}</p>
                          )}
                        </>
                      ) : (
                        <p className={`text-sm group-hover/title:text-accent transition-colors ${done ? 'line-through text-[#555]' : 'text-[#ccc]'}`}>
                          #{item.item_number}
                        </p>
                      )}
                    </button>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                      {item.is_ado && adoStatus === 'error' && (
                        <span title="ADO connection error — data may be stale" className="text-amber-500 p-1">
                          <AlertTriangle size={13} />
                        </span>
                      )}
                      {/* Create-linked toggle */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        title="Create linked note/code/flow"
                        className={`p-1 rounded transition-all ${isExpanded ? 'text-accent bg-[#252525]' : 'text-[#333] hover:text-[#666]'}`}
                      >
                        <Plus size={13} />
                      </button>
                      {/* External link */}
                      <button
                        onClick={() => window.api?.shell.openExternal(item.url)}
                        title="Open in ADO"
                        className="p-1 rounded text-[#333] hover:text-[#666] transition-colors"
                      >
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Create-entity actions panel */}
                  {isExpanded && (
                    <div className="flex items-center gap-1.5 px-3 pb-3 pt-0">
                      <span className="text-[10px] text-[#555] mr-1">Create linked:</span>
                      {[
                        { type: 'note' as const, label: 'Note', Icon: FileText },
                        { type: 'code' as const, label: 'Code', Icon: Code2 },
                        { type: 'flow' as const, label: 'Flow', Icon: Workflow },
                      ].map(({ type, label, Icon }) => (
                        <button
                          key={type}
                          onClick={() => createLinked(item, type)}
                          disabled={creating === item.id + type}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-[#383838] text-[#aaa] hover:text-white hover:border-[#555] transition-all disabled:opacity-40"
                        >
                          <Icon size={10} />
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
