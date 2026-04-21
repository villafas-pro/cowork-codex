import React, { useEffect, useState } from 'react'
import { CheckSquare, Square, ExternalLink, Clipboard, Link2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'

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
  'Resolved': '#009933', 'Done': '#009933', 'Closed': '#555',
}

export default function WorkItems(): React.JSX.Element {
  const { openTab } = useAppStore()
  const [items, setItems] = useState<WorkItem[]>([])
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all')

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems(): Promise<void> {
    const all: WorkItem[] = (await window.api?.workItems.getAll()) || []
    setItems(all)
  }

  async function pasteFromClipboard(): Promise<void> {
    const text = await navigator.clipboard.readText()
    if (text.trim()) {
      const item = await window.api?.workItems.create(text.trim())
      if (item) setItems((prev) => [item, ...prev])
    }
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

  const filtered = items.filter((i) => {
    if (filter === 'open') return !i.is_done
    if (filter === 'done') return i.is_done
    return true
  })

  const openCount = items.filter((i) => !i.is_done).length
  const doneCount = items.filter((i) => i.is_done).length

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
        <button
          onClick={pasteFromClipboard}
          title="Paste URL from clipboard"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#383838] text-xs text-[#aaa] hover:text-white hover:border-[#555] transition-all"
        >
          <Clipboard size={12} />
          Paste link
        </button>
      </div>

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
              <p className="text-xs text-[#444]">Paste an Azure DevOps URL to add one</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all group ${
                  item.is_done
                    ? 'bg-[#161616] border-[#282828] opacity-50'
                    : 'bg-[#1e1e1e] border-[#303030] hover:border-[#404040]'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleDone(item.id)}
                  className="flex-shrink-0 text-[#555] hover:text-accent transition-colors mt-0.5"
                >
                  {item.is_done
                    ? <CheckSquare size={15} className="text-accent" />
                    : <Square size={15} />
                  }
                </button>

                {/* Content */}
                <button
                  onClick={() => handleOpen(item)}
                  className="flex-1 text-left min-w-0 group/title"
                >
                  {item.cached_title ? (
                    <>
                      {/* Type badge + state */}
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
                            style={{
                              color: STATE_COLORS[item.cached_state] || '#888',
                            }}
                          >
                            {item.cached_state}
                          </span>
                        )}
                        <span className="text-[10px] text-[#444] ml-auto">#{item.item_number}</span>
                      </div>

                      {/* Title */}
                      <p className={`text-sm leading-snug group-hover/title:text-accent transition-colors ${item.is_done ? 'line-through text-[#555]' : 'text-[#e0e0e0]'}`}>
                        {item.cached_title}
                      </p>

                      {/* Assignee */}
                      {item.cached_assigned_to && (
                        <p className="text-[11px] text-[#555] mt-1">{item.cached_assigned_to}</p>
                      )}
                    </>
                  ) : (
                    /* Non-ADO or not yet cached */
                    <p className={`text-sm group-hover/title:text-accent transition-colors ${item.is_done ? 'line-through text-[#555]' : 'text-[#ccc]'}`}>
                      #{item.item_number}
                    </p>
                  )}
                </button>

                {/* External link */}
                <button
                  onClick={() => window.api?.shell.openExternal(item.url)}
                  title="Open in ADO"
                  className="flex-shrink-0 text-[#333] group-hover:text-[#666] hover:!text-[#aaa] transition-colors mt-0.5 p-0.5"
                >
                  <ExternalLink size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
