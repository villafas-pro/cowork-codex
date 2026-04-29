import React, { useEffect, useState, useRef } from 'react'
import { FileText, Clock, CheckSquare, Search, Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks, Quote, Code, GitBranch, Link } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useAppStore } from '../store/appStore'
import { TYPE_COLORS, STATE_COLORS, DONE_STATES } from '../lib/workItemUtils'

interface RecentItem {
  id: string
  title: string
  updated_at: number
  entityType: 'note' | 'code' | 'flow'
}

interface DisplayWorkItem {
  item_number: string
  title: string
  type: string | null
  state: string | null
  assigned_to: string | null
  is_linked: boolean
}

export default function Home(): React.JSX.Element {
  const { openTab, setSearchOpen } = useAppStore()
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [workItems, setWorkItems] = useState<DisplayWorkItem[]>([])
  const scratchSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scratchLoaded = useRef(false)
  const pendingScratch = useRef<any>(null)

  const scratchEditor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Quick notes, links, anything...' })
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (!scratchLoaded.current) return
      if (scratchSaveTimer.current) clearTimeout(scratchSaveTimer.current)
      scratchSaveTimer.current = setTimeout(() => {
        window.api?.todo.save(JSON.stringify(editor.getJSON()))
      }, 500)
    }
  })

  useEffect(() => {
    loadRecentItems()
    loadScratch()
    loadWorkItems()
  }, [])

  // Apply pending scratch content once editor is ready
  useEffect(() => {
    if (scratchEditor && pendingScratch.current !== null) {
      scratchEditor.commands.setContent(pendingScratch.current, false)
      pendingScratch.current = null
      scratchLoaded.current = true
    }
  }, [scratchEditor])

  async function loadScratch(): Promise<void> {
    const row = await window.api?.todo.get()
    if (!row?.content || row.content === '{}') {
      scratchLoaded.current = true
      return
    }
    try {
      const parsed = JSON.parse(row.content)
      if (scratchEditor) {
        scratchEditor.commands.setContent(parsed, false)
        scratchLoaded.current = true
      } else {
        pendingScratch.current = parsed
      }
    } catch {
      scratchLoaded.current = true
    }
  }

  async function loadRecentItems(): Promise<void> {
    const [notes, codeBlocks, flows] = await Promise.all([
      window.api?.notes.getAll() ?? [],
      window.api?.code.getAll() ?? [],
      window.api?.flows.getAll() ?? [],
    ])

    const merged: RecentItem[] = [
      ...(notes as any[]).map((n: any) => ({
        id: n.id,
        title: n.title,
        updated_at: n.updated_at,
        entityType: 'note' as const,
      })),
      ...(codeBlocks as any[]).map((c: any) => ({
        id: c.id,
        title: c.title,
        updated_at: c.updated_at,
        entityType: 'code' as const,
      })),
      ...(flows as any[]).map((f: any) => ({
        id: f.id,
        title: f.title,
        updated_at: f.updated_at,
        entityType: 'flow' as const,
      })),
    ]

    merged.sort((a, b) => b.updated_at - a.updated_at)
    setRecentItems(merged.slice(0, 5))
  }

  async function loadWorkItems(): Promise<void> {
    // Load local linked items immediately so the UI isn't empty while ADO loads
    const localAll: any[] = (await window.api?.workItems.getAll()) || []
    const localOpen = localAll.filter((wi) => {
      if (wi.is_ado && wi.cached_state) return !DONE_STATES.has(wi.cached_state)
      return true
    })

    const localMap = new Map<string, boolean>()
    const display: DisplayWorkItem[] = localOpen.map((wi) => {
      localMap.set(wi.item_number, true)
      return {
        item_number: wi.item_number,
        title: wi.cached_title || `#${wi.item_number}`,
        type: wi.cached_type,
        state: wi.cached_state,
        assigned_to: wi.cached_assigned_to,
        is_linked: true,
      }
    })

    setWorkItems(display)

    // Background: fetch ADO items assigned to me and merge in
    try {
      const adoResults: any[] = (await window.api?.ado.search({
        search: '',
        assignedToMe: true,
        type: '',
        state: '',
      })) || []

      if (adoResults.length > 0) {
        const merged = [...display]
        for (const item of adoResults) {
          const idStr = String(item.id)
          if (!localMap.has(idStr) && !DONE_STATES.has(item.state)) {
            const assignedTo =
              typeof item.assignedTo === 'string'
                ? item.assignedTo
                : (item.assignedTo as any)?.displayName || null
            merged.push({
              item_number: idStr,
              title: item.title,
              type: item.type || null,
              state: item.state || null,
              assigned_to: assignedTo,
              is_linked: false,
            })
          }
        }
        setWorkItems(merged.slice(0, 10))
      }
    } catch {
      // ADO not configured or unavailable — local items already shown
    }
  }

  const formatDate = (ts: number): string => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - ts
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  }

  const ItemTypeIcon = ({ type }: { type: 'note' | 'code' | 'flow' }): React.JSX.Element => {
    if (type === 'code') return <Code size={13} className="text-th-tx-4 flex-shrink-0" />
    if (type === 'flow') return <GitBranch size={13} className="text-th-tx-4 flex-shrink-0" />
    return <FileText size={13} className="text-th-tx-4 flex-shrink-0" />
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search bar */}
      <div className="px-8 pt-8 pb-4 flex-shrink-0">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-th-bg-4 border border-th-bd-2 rounded-xl text-th-tx-4 hover:border-th-bd-3 hover:text-th-tx-2 transition-all text-left"
        >
          <Search size={15} />
          <span className="text-sm">Search everything...</span>
          <span className="ml-auto text-xs text-th-tx-5">Ctrl+T</span>
        </button>
      </div>

      {/* Main two-column layout */}
      <div className="flex flex-row-reverse flex-1 min-h-0 px-8 pb-8 gap-6">

        {/* Right column: scrollable lists, capped width */}
        <div className="w-full max-w-[500px] flex-shrink-0 overflow-y-auto flex flex-col gap-8 pr-1">

          {/* Recently Opened */}
          <section>
            <div className="flex items-center gap-2 mb-3 sticky top-0 bg-th-bg-2 py-1 -mx-1 px-1 z-10">
              <Clock size={13} className="text-th-tx-4" />
              <h2 className="text-xs font-medium text-th-tx-4 uppercase tracking-wider">Recently Opened</h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {recentItems.length === 0 ? (
                <p className="text-xs text-th-tx-5 py-2">Nothing yet</p>
              ) : (
                recentItems.map((item) => (
                  <button
                    key={`${item.entityType}-${item.id}`}
                    onClick={() => openTab({ entityType: item.entityType, entityId: item.id, title: item.title })}
                    className="flex items-center gap-3 p-3 rounded-lg bg-th-bg-4 hover:bg-th-bg-6 border border-th-bd-2 hover:border-th-bd-3 transition-all text-left w-full"
                  >
                    <ItemTypeIcon type={item.entityType} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-th-tx-1 truncate">{item.title || 'Untitled'}</p>
                      <p className="text-xs text-th-tx-4 mt-0.5">{formatDate(item.updated_at)}</p>
                    </div>
                    {item.entityType !== 'note' && (
                      <span className="text-[10px] text-th-tx-5 flex-shrink-0 capitalize">{item.entityType}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </section>

          {/* My Work Items */}
          <section>
            <div className="flex items-center gap-2 mb-3 sticky top-0 bg-th-bg-2 py-1 -mx-1 px-1 z-10">
              <CheckSquare size={13} className="text-th-tx-4" />
              <h2 className="text-xs font-medium text-th-tx-4 uppercase tracking-wider">My Work Items</h2>
            </div>
            <div className="flex flex-col gap-1.5">
              {workItems.length === 0 ? (
                <p className="text-xs text-th-tx-5 py-2">No open work items</p>
              ) : (
                workItems.map((wi) => {
                  const typeColor = TYPE_COLORS[wi.type || ''] || '#555'
                  const stateColor = STATE_COLORS[wi.state || ''] || '#888'
                  return (
                    <button
                      key={wi.item_number}
                      onClick={() => openTab({ entityType: 'work-item', entityId: wi.item_number, title: wi.title })}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-th-bg-4 hover:bg-th-bg-6 border border-th-bd-2 hover:border-th-bd-3 transition-all text-left w-full"
                    >
                      <CheckSquare size={13} className="text-th-tx-6 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-th-tx-1 truncate">{wi.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {wi.type && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                              style={{ background: typeColor + '22', color: typeColor, border: `1px solid ${typeColor}44` }}
                            >
                              {wi.type}
                            </span>
                          )}
                          {wi.state && (
                            <span className="text-[10px]" style={{ color: stateColor }}>
                              {wi.state}
                            </span>
                          )}
                          {wi.assigned_to && (
                            <span className="text-[10px] text-th-tx-6 truncate">{wi.assigned_to}</span>
                          )}
                        </div>
                      </div>
                      {wi.is_linked && (
                        <Link size={11} className="text-th-tx-5 flex-shrink-0 mt-0.5" title="Linked in a note" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </section>
        </div>

        {/* Right column: scratch pad, flexes to remaining space */}
        <div className="flex-1 min-w-0 flex flex-col">
          <h2 className="text-xs font-medium text-th-tx-4 uppercase tracking-wider mb-3 py-1">Quick Scratch Pad</h2>
          <div className="flex-1 bg-th-bg-4 border border-th-bd-2 rounded-xl overflow-hidden flex flex-col">
            {/* Compact toolbar */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#2e2e2e] flex-shrink-0">
              {(
                [
                  { icon: <Bold size={12} />, cmd: () => scratchEditor?.chain().focus().toggleBold().run(), active: !!scratchEditor?.isActive('bold'), title: 'Bold' },
                  { icon: <Italic size={12} />, cmd: () => scratchEditor?.chain().focus().toggleItalic().run(), active: !!scratchEditor?.isActive('italic'), title: 'Italic' },
                  { icon: <UnderlineIcon size={12} />, cmd: () => scratchEditor?.chain().focus().toggleUnderline().run(), active: !!scratchEditor?.isActive('underline'), title: 'Underline' },
                  { icon: <Strikethrough size={12} />, cmd: () => scratchEditor?.chain().focus().toggleStrike().run(), active: !!scratchEditor?.isActive('strike'), title: 'Strikethrough' },
                ] as const
              ).map((b, i) => (
                <button key={i} onClick={b.cmd} title={b.title}
                  className={`p-1 rounded transition-all ${b.active ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-5 hover:text-th-tx-2 hover:bg-th-bg-6'}`}>
                  {b.icon}
                </button>
              ))}
              <div className="w-px h-3 bg-th-bd-2 mx-0.5" />
              {(
                [
                  { icon: <List size={12} />, cmd: () => scratchEditor?.chain().focus().toggleBulletList().run(), active: !!scratchEditor?.isActive('bulletList'), title: 'Bullet list' },
                  { icon: <ListOrdered size={12} />, cmd: () => scratchEditor?.chain().focus().toggleOrderedList().run(), active: !!scratchEditor?.isActive('orderedList'), title: 'Numbered list' },
                  { icon: <ListChecks size={12} />, cmd: () => scratchEditor?.chain().focus().toggleTaskList().run(), active: !!scratchEditor?.isActive('taskList'), title: 'Task list' },
                ] as const
              ).map((b, i) => (
                <button key={i} onClick={b.cmd} title={b.title}
                  className={`p-1 rounded transition-all ${b.active ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-5 hover:text-th-tx-2 hover:bg-th-bg-6'}`}>
                  {b.icon}
                </button>
              ))}
              <div className="w-px h-3 bg-th-bd-2 mx-0.5" />
              <button
                onClick={() => scratchEditor?.chain().focus().toggleBlockquote().run()}
                title="Blockquote"
                className={`p-1 rounded transition-all ${scratchEditor?.isActive('blockquote') ? 'bg-th-bd-2 text-th-tx-1' : 'text-th-tx-5 hover:text-th-tx-2 hover:bg-th-bg-6'}`}
              >
                <Quote size={12} />
              </button>
            </div>
            {/* Editor content */}
            <div
              className="flex-1 px-5 py-4 cursor-text overflow-y-auto"
              onClick={() => scratchEditor?.commands.focus()}
            >
              <EditorContent
                editor={scratchEditor}
                className="tiptap text-[14px] text-th-tx-2 leading-relaxed"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
