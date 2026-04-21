import React, { useEffect, useState } from 'react'
import { Plus, Search, Code2, Pin, Trash2, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'

interface CodeBlock {
  id: string
  title: string
  language: string
  note_id: string | null
  is_pinned: number
  created_at: number
  updated_at: number
}

export default function Code(): React.JSX.Element {
  const { openTab, closeTab, tabs } = useAppStore()
  const [blocks, setBlocks] = useState<CodeBlock[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadBlocks()
  }, [])

  async function loadBlocks(): Promise<void> {
    const all: CodeBlock[] = (await window.api?.code.getAll()) || []
    setBlocks(all)
  }

  async function createBlock(): Promise<void> {
    const block = await window.api?.code.create({ title: 'Untitled' })
    if (block) {
      setBlocks((prev) => [block, ...prev])
      openTab({ entityType: 'code', entityId: block.id, title: block.title })
    }
  }

  const filtered = blocks.filter((b) =>
    b.title.toLowerCase().includes(search.toLowerCase())
  )

  const standalone = filtered.filter((b) => !b.note_id)
  const fromNotes = filtered.filter((b) => b.note_id)

  async function togglePin(block: CodeBlock, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    await window.api?.code.togglePin(block.id)
    setBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, is_pinned: b.is_pinned ? 0 : 1 } : b)))
  }

  async function deleteBlock(block: CodeBlock, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    if (!window.confirm(`Delete "${block.title || 'Untitled'}"? This cannot be undone.`)) return
    await window.api?.code.delete(block.id)
    setBlocks((prev) => prev.filter((b) => b.id !== block.id))
    const tab = tabs.find((t) => t.entityType === 'code' && t.entityId === block.id)
    if (tab) closeTab(tab.id)
  }

  const formatDate = (ts: number): string => {
    const diff = Date.now() - ts
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  const BlockRow = ({ block }: { block: CodeBlock }): React.JSX.Element => (
    <div className="flex items-center gap-1 rounded-lg transition-all group hover:bg-th-bg-5">
      <button
        onClick={() => openTab({ entityType: 'code', entityId: block.id, title: block.title })}
        className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left min-w-0"
      >
        <Code2 size={14} className="text-th-tx-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-th-tx-1 truncate">{block.title || 'Untitled'}</p>
          <p className="text-xs text-th-tx-4">{block.language}</p>
        </div>
        <span className="text-xs text-th-tx-4 flex-shrink-0">{formatDate(block.updated_at)}</span>
      </button>
      <button
        onClick={(e) => togglePin(block, e)}
        className={`flex-shrink-0 p-1.5 rounded transition-colors ${block.is_pinned ? 'text-accent' : 'text-transparent group-hover:text-th-tx-6 hover:!text-accent'}`}
        title={block.is_pinned ? 'Unpin' : 'Pin'}
      >
        <Pin size={13} />
      </button>
      <button
        onClick={(e) => deleteBlock(block, e)}
        className="flex-shrink-0 p-1.5 mr-1 rounded text-transparent group-hover:text-th-tx-6 hover:!text-red-400 transition-colors"
        title="Delete block"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-th-bd-2 flex-shrink-0">
        <h1 className="text-sm font-medium text-th-tx-2">Code</h1>
        <button
          onClick={createBlock}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs transition-all"
        >
          <Plus size={13} />
          New Block
        </button>
      </div>

      <div className="px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-th-bg-3 border border-th-bd-2 rounded-lg focus-within:border-th-bd-3 transition-colors">
          <Search size={12} className="text-th-tx-4 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code blocks..."
            className="flex-1 bg-transparent text-xs text-th-tx-1 placeholder-th-tx-5 outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-th-tx-6 hover:text-th-tx-3 transition-colors flex-shrink-0">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {standalone.length > 0 && (
          <div className="mb-4">
            <p className="px-3 py-1 text-xs text-th-tx-4 uppercase tracking-wider">Standalone</p>
            {standalone.map((b) => <BlockRow key={b.id} block={b} />)}
          </div>
        )}
        {fromNotes.length > 0 && (
          <div>
            <p className="px-3 py-1 text-xs text-th-tx-4 uppercase tracking-wider">From Notes</p>
            {fromNotes.map((b) => <BlockRow key={b.id} block={b} />)}
          </div>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-th-tx-5 text-xs py-8">No code blocks yet.</p>
        )}
      </div>
    </div>
  )
}
