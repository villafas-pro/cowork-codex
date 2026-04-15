import React, { useEffect, useState } from 'react'
import { Plus, Search, GitBranch } from 'lucide-react'
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
  const { openTab } = useAppStore()
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

  const filtered = flows.filter((f) =>
    f.title.toLowerCase().includes(search.toLowerCase())
  )

  const standalone = filtered.filter((f) => !f.note_id)
  const fromNotes = filtered.filter((f) => f.note_id)

  const formatDate = (ts: number): string => {
    const diff = Date.now() - ts
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  const FlowRow = ({ flow }: { flow: FlowItem }): React.JSX.Element => (
    <button
      onClick={() => openTab({ entityType: 'flow', entityId: flow.id, title: flow.title })}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left hover:bg-[#252525]"
    >
      <GitBranch size={14} className="text-[#777] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#f0f0f0] truncate">{flow.title || 'Untitled'}</p>
      </div>
      <span className="text-xs text-[#888] flex-shrink-0">{formatDate(flow.updated_at)}</span>
    </button>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#383838] flex-shrink-0">
        <h1 className="text-sm font-medium text-[#d0d0d0]">Flow</h1>
        <button
          onClick={createFlow}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs transition-all"
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
        {standalone.length > 0 && (
          <div className="mb-4">
            <p className="px-3 py-1 text-xs text-[#777] uppercase tracking-wider">Standalone</p>
            {standalone.map((f) => <FlowRow key={f.id} flow={f} />)}
          </div>
        )}
        {fromNotes.length > 0 && (
          <div>
            <p className="px-3 py-1 text-xs text-[#777] uppercase tracking-wider">From Notes</p>
            {fromNotes.map((f) => <FlowRow key={f.id} flow={f} />)}
          </div>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-[#666] text-xs py-8">No flows yet.</p>
        )}
      </div>
    </div>
  )
}
