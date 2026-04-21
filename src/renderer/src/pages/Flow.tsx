import React, { useEffect, useState } from 'react'
import { Plus, Search, GitBranch, Pin, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'

interface FlowItem {
  id: string
  title: string
  note_id: string | null
  is_pinned: number
  created_at: number
  updated_at: number
}

function formatDate(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString()
}

interface FlowRowProps {
  flow: FlowItem
  onOpen: (flow: FlowItem) => void
  onTogglePin: (flow: FlowItem, e: React.MouseEvent) => void
  onDelete: (flow: FlowItem, e: React.MouseEvent) => void
}

function FlowRow({ flow, onOpen, onTogglePin, onDelete }: FlowRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 rounded-lg transition-all group hover:bg-[#252525]">
      <button
        onClick={() => onOpen(flow)}
        className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left min-w-0"
      >
        <GitBranch size={14} className="text-[#777] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#f0f0f0] truncate">{flow.title || 'Untitled'}</p>
        </div>
        <span className="text-xs text-[#888] flex-shrink-0">{formatDate(flow.updated_at)}</span>
      </button>
      <button
        onClick={(e) => onTogglePin(flow, e)}
        title={flow.is_pinned ? 'Unpin' : 'Pin'}
        className={`flex-shrink-0 p-1.5 rounded transition-colors ${flow.is_pinned ? 'text-accent' : 'text-transparent group-hover:text-[#555] hover:!text-accent'}`}
      >
        <Pin size={13} />
      </button>
      <button
        onClick={(e) => onDelete(flow, e)}
        title="Delete"
        className="flex-shrink-0 p-1.5 mr-1 rounded text-transparent group-hover:text-[#555] hover:!text-red-400 transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export default function Flow(): React.JSX.Element {
  const { openTab, closeTab, tabs } = useAppStore()
  const [flows, setFlows] = useState<FlowItem[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadFlows()
  }, [])

  async function loadFlows(): Promise<void> {
    const all: FlowItem[] = (await window.api?.flows.getAll()) || []
    setFlows(all)
  }

  async function createFlow(): Promise<void> {
    const flow = await window.api?.flows.create({ title: 'Untitled Flow' })
    if (flow) {
      setFlows((prev) => [flow, ...prev])
      openTab({ entityType: 'flow', entityId: flow.id, title: flow.title })
    }
  }

  async function handleTogglePin(flow: FlowItem, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    await window.api?.flows.togglePin(flow.id)
    setFlows((prev) =>
      prev.map((f) => f.id === flow.id ? { ...f, is_pinned: f.is_pinned ? 0 : 1 } : f)
    )
  }

  async function handleDelete(flow: FlowItem, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    if (!window.confirm(`Delete "${flow.title || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.flows.delete(flow.id)
    setFlows((prev) => prev.filter((f) => f.id !== flow.id))
    const tab = tabs.find((t) => t.entityType === 'flow' && t.entityId === flow.id)
    if (tab) closeTab(tab.id)
  }

  const filtered = flows.filter((f) =>
    f.title.toLowerCase().includes(search.toLowerCase())
  )

  const pinned = filtered.filter((f) => f.is_pinned === 1)
  const standalone = filtered.filter((f) => !f.note_id && f.is_pinned === 0)
  const fromNotes = filtered.filter((f) => f.note_id && f.is_pinned === 0)

  const renderRows = (items: FlowItem[]): React.JSX.Element[] =>
    items.map((f) => (
      <FlowRow
        key={f.id}
        flow={f}
        onOpen={(flow) => openTab({ entityType: 'flow', entityId: flow.id, title: flow.title })}
        onTogglePin={handleTogglePin}
        onDelete={handleDelete}
      />
    ))

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#383838] flex-shrink-0">
        <h1 className="text-sm font-medium text-[#d0d0d0]">Flow</h1>
        <button
          onClick={createFlow}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-black text-xs font-medium transition-all"
        >
          <Plus size={13} />
          New Flow
        </button>
      </div>

      <div className="px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1f1f1f] border border-[#383838] rounded-lg focus-within:border-[#555] transition-colors">
          <Search size={12} className="text-[#777] flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flows..."
            className="flex-1 bg-transparent text-xs text-[#f0f0f0] placeholder-[#666] outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[#555] hover:text-[#aaa] transition-colors flex-shrink-0">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {pinned.length > 0 && (
          <div className="mb-4">
            <p className="px-3 py-1 text-xs text-[#777] uppercase tracking-wider">Pinned</p>
            {renderRows(pinned)}
          </div>
        )}
        {standalone.length > 0 && (
          <div className="mb-4">
            <p className="px-3 py-1 text-xs text-[#777] uppercase tracking-wider">Standalone</p>
            {renderRows(standalone)}
          </div>
        )}
        {fromNotes.length > 0 && (
          <div>
            <p className="px-3 py-1 text-xs text-[#777] uppercase tracking-wider">From Notes</p>
            {renderRows(fromNotes)}
          </div>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-[#666] text-xs py-8">No flows yet. Create one to get started.</p>
        )}
      </div>
    </div>
  )
}
