import React, { useEffect, useState } from 'react'
import { Plus, Search, GitBranch, Pin, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'

interface FlowItem {
  id: string
  title: string
  note_id: string | null
  is_pinned: number
  created_at: number
  updated_at: number
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

  async function togglePin(flow: FlowItem, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    await window.api?.flows.togglePin(flow.id)
    setFlows((prev) => prev.map((f) => f.id === flow.id ? { ...f, is_pinned: f.is_pinned ? 0 : 1 } : f))
  }

  async function deleteFlow(flow: FlowItem, e: React.MouseEvent): Promise<void> {
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

  const formatDate = (ts: number): string => {
    const diff = Date.now() - ts
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  const FlowRow = ({ flow }: { flow: FlowItem }): React.JSX.Element => (
    <div className="group relative flex items-center rounded-lg transition-all hover:bg-[#252525]">
      <button
        onClick={() => openTab({ entityType: 'flow', entityId: flow.id, title: flow.title })}
        className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left min-w-0"
      >
        <GitBranch size={14} className="text-[#777] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#f0f0f0] truncate">{flow.title || 'Untitled'}</p>
        </div>
        <span className="text-xs text-[#888] flex-shrink-0 mr-12">{formatDate(flow.updated_at)}</span>
      </button>
      {/* Hover actions */}
      <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => togglePin(flow, e)}
          title={flow.is_pinned ? 'Unpin' : 'Pin'}
          className={`p-1.5 rounded transition-all ${flow.is_pinned ? 'text-accent' : 'text-[#555] hover:text-[#ccc]'}`}
        >
          <Pin size={11} />
        </button>
        <button
          onClick={(e) => deleteFlow(flow, e)}
          title="Delete"
          className="p-1.5 rounded text-[#555] hover:text-red-400 hover:bg-[#2a1a1a] transition-all"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )

  const Section = ({ label, items }: { label: string; items: FlowItem[] }): React.JSX.Element => (
    <div className="mb-4">
      <p className="px-3 py-1 text-xs text-[#777] uppercase tracking-wider">{label}</p>
      {items.map((f) => <FlowRow key={f.id} flow={f} />)}
    </div>
  )

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
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1f1f1f] border border-[#383838] rounded-lg">
          <Search size={12} className="text-[#777]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flows..."
            className="flex-1 bg-transparent text-xs text-[#f0f0f0] placeholder-[#666] outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {pinned.length > 0 && <Section label="Pinned" items={pinned} />}
        {standalone.length > 0 && <Section label="Standalone" items={standalone} />}
        {fromNotes.length > 0 && <Section label="From Notes" items={fromNotes} />}
        {filtered.length === 0 && (
          <p className="text-center text-[#666] text-xs py-8">No flows yet. Create one to get started.</p>
        )}
      </div>
    </div>
  )
}
