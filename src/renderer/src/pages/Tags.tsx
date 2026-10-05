import React, { useCallback, useEffect, useState } from 'react'
import { FileText, Code2, GitBranch, Pencil, Trash2, Check } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { TAG_COLORS, tagColor, type Tag } from '../lib/tags'

interface TaggedItem {
  type: 'note' | 'code' | 'flow'
  id: string
  title: string
  updated_at: number
  archived_at: number | null
}

const typeIcon = {
  note: <FileText size={14} />,
  code: <Code2 size={14} />,
  flow: <GitBranch size={14} />
}

const typeLabel = { note: 'Note', code: 'Code', flow: 'Flow' }

export default function Tags(): React.JSX.Element {
  const { openTab, showConfirm } = useAppStore()
  const [tags, setTags] = useState<Tag[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<'and' | 'or'>('or')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [items, setItems] = useState<TaggedItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [error, setError] = useState('')

  const loadTags = useCallback(async () => {
    const all: Tag[] = (await window.api?.tags.getAll()) || []
    setTags(all)
    setSelected((prev) => prev.filter((id) => all.some((t) => t.id === id)))
  }, [])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  useEffect(() => {
    if (selected.length === 0) {
      setItems([])
      return
    }
    window.api?.tags.getItems(selected, mode, includeArchived).then((r) => setItems(r || []))
  }, [selected, mode, includeArchived, tags])

  function toggle(id: string): void {
    setSelected((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  async function rename(tag: Tag): Promise<void> {
    const res = await window.api?.tags.update(tag.id, { name: renameValue })
    if (res && !res.success) {
      setError(res.error || 'Could not rename')
      return
    }
    setError('')
    await loadTags()
  }

  async function recolor(tag: Tag, color: string): Promise<void> {
    await window.api?.tags.update(tag.id, { color })
    await loadTags()
  }

  async function remove(tag: Tag): Promise<void> {
    if (!await showConfirm(`Delete tag "${tag.name}"? Items keep their content; only the label is removed.`)) return
    await window.api?.tags.delete(tag.id)
    setEditingId(null)
    await loadTags()
  }

  async function merge(source: Tag, targetId: string): Promise<void> {
    const target = tags.find((t) => t.id === targetId)
    if (!target) return
    if (!await showConfirm(`Merge "${source.name}" into "${target.name}"? Everything tagged "${source.name}" will get "${target.name}", and "${source.name}" will be deleted.`)) return
    await window.api?.tags.merge(source.id, targetId)
    setEditingId(null)
    await loadTags()
  }

  const formatDate = (ts: number): string => new Date(ts).toLocaleDateString()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-th-bd-2 flex-shrink-0">
        <h1 className="text-sm font-medium text-th-tx-2">Tags</h1>
        <p className="text-xs text-th-tx-5">Select tags to see matching notes, code and flows. Create tags from any item.</p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Tag list + management */}
        <div className="w-72 flex-shrink-0 border-r border-th-bd-2 overflow-y-auto py-2 px-2">
          {tags.length === 0 && (
            <p className="px-3 py-6 text-xs text-th-tx-5 text-center">
              No tags yet. Use the tag icon on any note, code block or flow to create one.
            </p>
          )}
          {tags.map((tag) => {
            const c = tagColor(tag.color)
            const isSel = selected.includes(tag.id)
            const editing = editingId === tag.id
            return (
              <div key={tag.id} className="mb-0.5">
                <div className={`group flex items-center gap-1 rounded-lg hover:bg-th-bg-5 ${isSel ? 'bg-th-bg-4' : ''}`}>
                  <button onClick={() => toggle(tag.id)} className="flex-1 flex items-center gap-2 px-3 py-2 text-left min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.fg }} />
                    <span className={`text-sm truncate ${isSel ? 'text-th-tx-1' : 'text-th-tx-2'}`}>{tag.name}</span>
                    <span className="ml-auto text-xs text-th-tx-5">{tag.count ?? 0}</span>
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(editing ? null : tag.id)
                      setRenameValue(tag.name)
                      setError('')
                    }}
                    className="flex-shrink-0 p-1.5 mr-1 rounded text-transparent group-hover:text-th-tx-6 hover:!text-th-tx-1"
                    title="Edit tag"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                {editing && (
                  <div className="mx-2 mb-2 mt-1 p-3 rounded-lg border border-th-bd-2 bg-th-bg-3 space-y-3">
                    <div className="flex gap-2">
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && rename(tag)}
                        className="flex-1 min-w-0 bg-th-bg-2 border border-th-bd-2 rounded px-2 py-1 text-xs text-th-tx-1 outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => rename(tag)}
                        className="px-2 rounded bg-accent text-black text-xs font-medium"
                        title="Save name"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                    {error && <p className="text-[11px] text-red-400">{error}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(TAG_COLORS).map(([name, col]) => (
                        <button
                          key={name}
                          onClick={() => recolor(tag, name)}
                          title={name}
                          style={{ backgroundColor: col.fg, boxShadow: tag.color === name ? '0 0 0 2px var(--accent, #e8b800)' : undefined }}
                          className="w-4 h-4 rounded-full"
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value=""
                        onChange={(e) => e.target.value && merge(tag, e.target.value)}
                        className="flex-1 min-w-0 bg-th-bg-2 border border-th-bd-2 rounded px-1.5 py-1 text-xs text-th-tx-2 outline-none"
                      >
                        <option value="">Merge into...</option>
                        {tags.filter((t) => t.id !== tag.id).map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button onClick={() => remove(tag)} className="p-1.5 rounded text-th-tx-5 hover:text-red-400" title="Delete tag">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 py-2 min-w-0">
          {selected.length > 0 && (
            <div className="flex items-center gap-3 px-3 pb-2">
              {selected.length >= 2 && (
                <button
                  onClick={() => setMode(mode === 'and' ? 'or' : 'and')}
                  className="rounded px-1.5 py-0.5 text-[11px] border border-th-bd-2 text-th-tx-3 hover:text-th-tx-1"
                >
                  Match {mode === 'and' ? 'all' : 'any'}
                </button>
              )}
              <label className="flex items-center gap-1.5 text-xs text-th-tx-4 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="accent-[#e8b800]"
                />
                Include archived
              </label>
              <button onClick={() => setSelected([])} className="text-[11px] text-th-tx-4 hover:text-th-tx-2 underline">
                Clear
              </button>
              <span className="ml-auto text-xs text-th-tx-5">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>
          )}
          {selected.length === 0 && (
            <p className="text-center text-th-tx-5 text-xs py-12">Select one or more tags on the left.</p>
          )}
          {selected.length > 0 && items.length === 0 && (
            <p className="text-center text-th-tx-5 text-xs py-12">Nothing matches.</p>
          )}
          {items.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => openTab({ entityType: item.type, entityId: item.id, title: item.title || 'Untitled' })}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-th-bg-5 transition-all ${item.archived_at ? 'opacity-50 hover:opacity-100' : ''}`}
            >
              <span className="text-th-tx-4 flex-shrink-0">{typeIcon[item.type]}</span>
              <span className="flex-1 min-w-0 text-sm text-th-tx-1 truncate">{item.title || 'Untitled'}</span>
              <span className="text-xs text-th-tx-5 flex-shrink-0">{typeLabel[item.type]}</span>
              {item.archived_at ? (
                <span className="text-[10px] text-th-tx-5 border border-th-bd-2 rounded px-1 flex-shrink-0">Archived</span>
              ) : null}
              <span className="text-xs text-th-tx-4 flex-shrink-0">{formatDate(item.updated_at)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
