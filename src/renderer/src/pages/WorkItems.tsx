import React, { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Square, ExternalLink, Link2, FileText, Code2, Workflow, Plus, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import WorkItemSearch from '../components/WorkItemSearch'
import {
  type WorkItem, TYPE_COLORS, stateColor, PROVIDER_LABELS, PROVIDER_SHORT, displayKey, effectiveDone
} from '../lib/workItemUtils'

type GroupBy = 'none' | 'project'

function loadGroupBy(): GroupBy {
  try {
    return localStorage.getItem('workItems:groupBy') === 'none' ? 'none' : 'project'
  } catch { return 'project' }
}

export default function WorkItems(): React.JSX.Element {
  const { openTab, integrationStatus } = useAppStore()
  const [items, setItems] = useState<WorkItem[]>([])
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all')
  const [configured, setConfigured] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>(loadGroupBy)
  const [projectFilter, setProjectFilter] = useState<string>('') // '' = all projects
  // Track which card is showing create-entity actions
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    loadItems()
    window.api?.integrations.isConfigured().then(setConfigured)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('workItems:groupBy', groupBy) } catch { /* ignore */ }
  }, [groupBy])

  async function loadItems(): Promise<void> {
    const all: WorkItem[] = (await window.api?.workItems.getAll()) || []
    setItems(all)
  }

  async function toggleDone(id: string): Promise<void> {
    await window.api?.workItems.toggleDone(id)
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_done: i.is_done ? 0 : 1 } : i)))
  }

  function handleOpen(item: WorkItem): void {
    if (item.is_tracked) {
      openTab({
        entityType: 'work-item',
        entityId: item.item_number,
        title: item.cached_title || displayKey(item.provider, item.item_number)
      })
    } else {
      window.api?.shell.openExternal(item.url)
    }
  }

  async function createLinked(item: WorkItem, entityType: 'note' | 'code' | 'flow'): Promise<void> {
    const title = item.cached_title || displayKey(item.provider, item.item_number)
    setCreating(item.id + entityType)
    try {
      let entity: { id: string } | null | undefined
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

  // Projects present in the data, with counts, for the filter chips
  const projects = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of items) {
      if (i.container) counts.set(i.container, (counts.get(i.container) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  // Clear a stale project filter (e.g. its last item was unlinked)
  useEffect(() => {
    if (projectFilter && !projects.some(([p]) => p === projectFilter)) setProjectFilter('')
  }, [projects, projectFilter])

  const showProviderBadge = useMemo(() => new Set(items.map((i) => i.provider)).size > 1, [items])

  const filtered = items.filter((i) => {
    if (projectFilter && i.container !== projectFilter) return false
    const done = effectiveDone(i)
    if (filter === 'open') return !done
    if (filter === 'done') return done
    return true
  })

  const scoped = projectFilter ? items.filter((i) => i.container === projectFilter) : items
  const openCount = scoped.filter((i) => !effectiveDone(i)).length
  const doneCount = scoped.filter((i) => effectiveDone(i)).length

  const groups: { key: string; label: string; items: WorkItem[] }[] = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', items: filtered }]
    const map = new Map<string, WorkItem[]>()
    for (const i of filtered) {
      const k = i.container || ''
      map.set(k, [...(map.get(k) ?? []), i])
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
      .map(([k, list]) => ({ key: k || 'other', label: k || 'Other', items: list }))
  }, [filtered, groupBy])

  function renderCard(item: WorkItem): React.JSX.Element {
    const done = effectiveDone(item)
    const isExpanded = expandedId === item.id
    const sourceName = PROVIDER_LABELS[item.provider]
    return (
      <div
        key={item.id}
        className={`rounded-xl border transition-all ${
          done
            ? 'bg-th-bg-2 border-th-bd-1 opacity-50'
            : 'bg-th-bg-3 border-th-bd-1 hover:border-th-bd-3'
        }`}
      >
        <div className="flex items-start gap-3 p-3">
          {/* Checkbox */}
          {item.is_tracked ? (
            <span className="flex-shrink-0 text-th-tx-6 mt-0.5 cursor-default" title={`State managed by ${sourceName}`}>
              {done ? <CheckSquare size={15} className="text-accent" /> : <Square size={15} />}
            </span>
          ) : (
            <button
              onClick={() => toggleDone(item.id)}
              className="flex-shrink-0 text-th-tx-6 hover:text-accent transition-colors mt-0.5"
            >
              {done ? <CheckSquare size={15} className="text-accent" /> : <Square size={15} />}
            </button>
          )}

          {/* Content */}
          <button onClick={() => handleOpen(item)} className="flex-1 text-left min-w-0 group/title">
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
                      style={{ color: stateColor(item.cached_state, item.cached_state_category) }}
                    >
                      {item.cached_state}
                    </span>
                  )}
                  {showProviderBadge && (
                    <span className="text-[9px] text-th-tx-5 border border-th-bd-2 rounded px-1">
                      {PROVIDER_SHORT[item.provider]}
                    </span>
                  )}
                  <span className="text-[10px] text-th-tx-6 ml-auto">{displayKey(item.provider, item.item_number)}</span>
                </div>
                <p className={`text-sm leading-snug group-hover/title:text-accent transition-colors ${done ? 'line-through text-th-tx-6' : 'text-th-tx-1'}`}>
                  {item.cached_title}
                </p>
                {item.cached_assigned_to && (
                  <p className="text-[11px] text-th-tx-6 mt-1">{item.cached_assigned_to}</p>
                )}
              </>
            ) : (
              <p className={`text-sm group-hover/title:text-accent transition-colors ${done ? 'line-through text-th-tx-6' : 'text-th-tx-2'}`}>
                {displayKey(item.provider, item.item_number)}
              </p>
            )}
          </button>

          {/* Actions */}
          <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
            {item.is_tracked && integrationStatus === 'error' && (
              <span title={`${sourceName} connection error. Data may be stale.`} className="text-amber-500 p-1">
                <AlertTriangle size={13} />
              </span>
            )}
            <button
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              title="Create linked note/code/flow"
              className={`p-1 rounded transition-all ${isExpanded ? 'text-accent bg-th-bg-5' : 'text-th-tx-6 hover:text-th-tx-5'}`}
            >
              <Plus size={13} />
            </button>
            <button
              onClick={() => window.api?.shell.openExternal(item.url)}
              title={item.is_tracked ? `Open in ${sourceName}` : 'Open link'}
              className="p-1 rounded text-th-tx-6 hover:text-th-tx-5 transition-colors"
            >
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="flex items-center gap-1.5 px-3 pb-3 pt-0">
            <span className="text-[10px] text-th-tx-6 mr-1">Create linked:</span>
            {[
              { type: 'note' as const, label: 'Note', Icon: FileText },
              { type: 'code' as const, label: 'Code', Icon: Code2 },
              { type: 'flow' as const, label: 'Flow', Icon: Workflow },
            ].map(({ type, label, Icon }) => (
              <button
                key={type}
                onClick={() => createLinked(item, type)}
                disabled={creating === item.id + type}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-th-bd-2 text-th-tx-3 hover:text-th-tx-1 hover:border-th-bd-3 transition-all disabled:opacity-40"
              >
                <Icon size={10} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-th-bd-1 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-th-tx-5" />
          <h1 className="text-sm font-medium text-th-tx-2">Work Items</h1>
          {openCount > 0 && (
            <span className="text-[10px] bg-th-bg-5 border border-th-bd-2 text-th-tx-4 px-1.5 py-0.5 rounded-full">
              {openCount} open
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-th-tx-5 mr-1">Group by</span>
          {(['project', 'none'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-2 py-1 rounded-md text-xs transition-all ${
                groupBy === g ? 'bg-th-bg-5 border border-th-bd-3 text-th-tx-1' : 'text-th-tx-5 hover:text-th-tx-3'
              }`}
            >
              {g === 'project' ? 'Project' : 'None'}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar (opens items from ADO and Jira) */}
      {configured && (
        <div className="px-5 py-3 border-b border-th-bd-1 flex-shrink-0">
          <WorkItemSearch
            mode="search"
            onAdd={(_url, itemNumber) => {
              openTab({ entityType: 'work-item', entityId: itemNumber, title: itemNumber })
            }}
            placeholder="Search work items (ADO and Jira)..."
          />
        </div>
      )}

      {/* Filter tabs + project chips */}
      <div className="flex items-center gap-3 px-5 pt-3 pb-1 flex-shrink-0 flex-wrap">
        <div className="flex gap-1">
          {(['all', 'open', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs transition-all capitalize ${
                filter === f
                  ? 'bg-th-bg-5 border border-th-bd-3 text-th-tx-1'
                  : 'text-th-tx-5 hover:text-th-tx-3'
              }`}
            >
              {f}
              {f === 'open' && openCount > 0 && <span className="ml-1 text-th-tx-6">{openCount}</span>}
              {f === 'done' && doneCount > 0 && <span className="ml-1 text-th-tx-6">{doneCount}</span>}
            </button>
          ))}
        </div>
        {projects.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setProjectFilter('')}
              className={`rounded-full px-2 py-0.5 text-[11px] border ${
                projectFilter === '' ? 'border-accent text-accent' : 'border-th-bd-2 text-th-tx-4 hover:text-th-tx-2'
              }`}
            >
              All projects
            </button>
            {projects.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setProjectFilter(projectFilter === name ? '' : name)}
                className={`rounded-full px-2 py-0.5 text-[11px] border ${
                  projectFilter === name ? 'border-accent text-accent' : 'border-th-bd-2 text-th-tx-4 hover:text-th-tx-2'
                }`}
              >
                {name} <span className="text-th-tx-6">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Link2 size={24} className="text-th-tx-6" />
            <p className="text-sm text-th-tx-6">
              {filter === 'done' ? 'No completed items' : filter === 'open' ? 'No open items' : 'No work items yet'}
            </p>
            {filter === 'all' && (
              <p className="text-xs text-th-tx-6">Link an Azure DevOps or Jira item from a note, code block, or flow to see it here</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.key}>
                {g.label && (
                  <p className="px-1 pb-1.5 text-xs text-th-tx-4 uppercase tracking-wider">
                    {g.label} <span className="text-th-tx-6 normal-case">{g.items.length}</span>
                  </p>
                )}
                <div className="flex flex-col gap-1.5">{g.items.map(renderCard)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
