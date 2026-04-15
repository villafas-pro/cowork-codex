import React, { useEffect, useState } from 'react'
import { Plus, CheckSquare, Square, ExternalLink, Clipboard } from 'lucide-react'

interface WorkItem {
  id: string
  url: string
  item_number: string
  is_done: number
  created_at: number
}

export default function WorkItems(): React.JSX.Element {
  const [items, setItems] = useState<WorkItem[]>([])
  const [newUrl, setNewUrl] = useState('')
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all')

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems(): Promise<void> {
    const all: WorkItem[] = (await window.api?.workItems.getAll()) || []
    setItems(all)
  }

  async function createItem(): Promise<void> {
    if (!newUrl.trim()) return
    const item = await window.api?.workItems.create(newUrl.trim())
    if (item) {
      setItems((prev) => [item, ...prev])
      setNewUrl('')
    }
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

  const filtered = items.filter((i) => {
    if (filter === 'open') return !i.is_done
    if (filter === 'done') return i.is_done
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] flex-shrink-0">
        <h1 className="text-sm font-medium text-[#aaa]">Work Items</h1>
        <button
          onClick={pasteFromClipboard}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs transition-all"
        >
          <Clipboard size={13} />
          Paste Link
        </button>
      </div>

      {/* Add new */}
      <div className="px-4 py-2 flex-shrink-0">
        <div className="flex gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createItem()}
            placeholder="Paste Azure DevOps URL..."
            className="flex-1 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#e5e5e5] placeholder-[#333] outline-none focus:border-accent"
          />
          <button
            onClick={createItem}
            className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-[#aaa] text-xs transition-all"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-4 pb-2 flex-shrink-0">
        {(['all', 'open', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-xs transition-all capitalize ${
              filter === f ? 'bg-[#2a2a2a] text-[#e5e5e5]' : 'text-[#444] hover:text-[#aaa]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filtered.length === 0 ? (
          <p className="text-center text-[#333] text-xs py-8">No work items yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] transition-all ${item.is_done ? 'opacity-50' : ''}`}
              >
                <button
                  onClick={() => toggleDone(item.id)}
                  className="flex-shrink-0 text-[#444] hover:text-accent transition-colors"
                >
                  {item.is_done ? (
                    <CheckSquare size={15} className="text-accent" />
                  ) : (
                    <Square size={15} />
                  )}
                </button>
                <span
                  className={`flex-1 text-sm ${item.is_done ? 'line-through text-[#444]' : 'text-[#e5e5e5]'}`}
                >
                  #{item.item_number}
                </span>
                <button
                  onClick={() => window.api?.shell.openExternal(item.url)}
                  className="flex-shrink-0 text-[#333] hover:text-[#aaa] transition-colors"
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
