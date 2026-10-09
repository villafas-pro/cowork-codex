import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, Plus, RefreshCw, Columns3, Rows3, Inbox, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import StageStrip from '../components/pipeline/StageStrip'
import PipelineCard from '../components/pipeline/PipelineCard'
import CategoryHeader from '../components/pipeline/CategoryHeader'
import InboxColumn from '../components/pipeline/InboxColumn'
import { nextDirection, sortKeys, type Direction } from '../lib/ticketOrder'
import {
  STAGE_META, STAGE_ORDER, updatedLabel,
  type InboxItem, type PipelineBoard, type PipelineInbox, type PipelineItem, type Stage
} from '../lib/pipelineUi'

type View = 'category' | 'stage'

const EMPTY_COUNTS: Record<Stage, number> = { assigned: 0, local: 0, rivet: 0, pr_ready: 0, review: 0, merged: 0 }

function loadView(): View {
  try {
    return localStorage.getItem('pipeline:view') === 'stage' ? 'stage' : 'category'
  } catch {
    return 'category'
  }
}

export default function Pipeline(): React.JSX.Element {
  const { openTab, showConfirm } = useAppStore()
  const [board, setBoard] = useState<PipelineBoard | null>(null)
  const [view, setView] = useState<View>(loadView)
  const [stageFilter, setStageFilter] = useState<Stage | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<number | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)

  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [inbox, setInbox] = useState<PipelineInbox | null>(null)
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [showInbox, setShowInbox] = useState<boolean>(() => {
    try { return localStorage.getItem('pipeline:inbox') !== 'hidden' } catch { return true }
  })
  // Where the card being dragged came from: a board column or the Inbox
  const [dragFrom, setDragFrom] = useState<'board' | 'inbox'>('board')

  const [newCat, setNewCat] = useState<string | null>(null)
  const [canOpenSession, setCanOpenSession] = useState(false)

  useEffect(() => {
    window.api?.pipeline.claudeInfo().then((i) => setCanOpenSession(!!i?.canOpenInDesktop))
  }, [])

  // Sorting by ticket number: categories persist the order, Inbox and stage columns just reorder the view
  const [inboxDir, setInboxDir] = useState<Direction | null>(null)
  const [stageDir, setStageDir] = useState<Partial<Record<Stage, Direction>>>({})

  async function sortCategory(categoryId: string): Promise<void> {
    const current = allItems.filter((i) => i.category_id === categoryId).sort((a, b) => a.position - b.position).map((i) => i.item_key)
    await window.api?.pipeline.reorderItems(categoryId, sortKeys(current, nextDirection(current)))
    await load()
  }

  // Drag state
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ col: string; index: number } | null>(null)

  const load = useCallback(async () => {
    const b = await window.api?.pipeline.getBoard()
    if (b) setBoard(b)
  }, [])

  const loadInbox = useCallback(async (force = false) => {
    setInboxLoading(true)
    try {
      setInbox((await window.api?.pipeline.inbox(force)) ?? null)
      setInboxError(null)
    } catch (e) {
      setInboxError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not load your tickets')
    } finally {
      setInboxLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    setSyncing(true)
    setSyncNote(null)
    try {
      const r = await window.api?.pipeline.sync()
      await Promise.all([load(), loadInbox(true)])
      setLastSynced(Date.now())
      const problems: string[] = []
      if (r?.errors?.length) problems.push(r.errors[0])
      if (r && r.failed > 0) problems.push(`${r.failed} ticket${r.failed === 1 ? '' : 's'} could not refresh`)
      if (r && r.added.length > 0) problems.push(`Added ${r.added.join(', ')} (Rivet started on ${r.added.length === 1 ? 'it' : 'them'})`)
      setSyncNote(problems.length ? problems.join(' · ') : null)
    } catch (e) {
      setSyncNote(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setSyncing(false)
    }
  }, [load, loadInbox])

  useEffect(() => {
    load()
    refresh()
    const off = window.api?.pipeline.onUpdated(() => { load(); loadInbox(); setLastSynced(Date.now()) })
    // Local read only: keeps "time in stage" and live-session badges current
    const timer = setInterval(load, 60_000)
    return () => { off?.(); clearInterval(timer) }
  }, [load, loadInbox, refresh])

  useEffect(() => {
    try { localStorage.setItem('pipeline:view', view) } catch { /* ignore */ }
  }, [view])

  useEffect(() => {
    try { localStorage.setItem('pipeline:inbox', showInbox ? 'shown' : 'hidden') } catch { /* ignore */ }
  }, [showInbox])

  const categories = board?.categories ?? []
  const allItems = board?.items ?? []
  const shown = useMemo(
    () => (stageFilter ? allItems.filter((i) => i.stage === stageFilter) : allItems),
    [allItems, stageFilter]
  )

  const needAttention = allItems.filter((i) => i.attention).length
  const staleCount = allItems.filter((i) => i.stale).length

  async function openSession(sessionId: string): Promise<void> {
    const r = await window.api?.pipeline.openSession(sessionId)
    setSyncNote(r?.success ? 'Opening the session in Claude Desktop...' : `Could not open the session: ${r?.message ?? 'unknown error'}`)
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function addTicket(ref: string, categoryId?: string): Promise<boolean> {
    setAdding(true)
    setAddError(null)
    try {
      const r = await window.api?.pipeline.add(ref, categoryId)
      if (r && !r.success) {
        setAddError(r.error)
        return false
      }
      await load()
      return true
    } finally {
      setAdding(false)
    }
  }

  /** Track an Inbox ticket. With no category it goes to the default one; with an index it lands at that slot. */
  async function trackFromInbox(key: string, categoryId?: string, index?: number): Promise<void> {
    if (!await addTicket(key, categoryId)) return
    if (categoryId && index !== undefined) await window.api?.pipeline.move(key, categoryId, index)
    await Promise.all([load(), loadInbox()])
  }

  function openTicket(item: PipelineItem): void {
    openTab({ entityType: 'work-item', entityId: item.item_key, title: item.title || item.item_key })
  }

  async function removeItem(item: PipelineItem): Promise<void> {
    if (!await showConfirm(`Remove ${item.item_key} from the board? It will not be added back automatically.`)) return
    await window.api?.pipeline.remove(item.item_key)
    await load()
  }

  async function moveTo(item: PipelineItem, categoryId: string): Promise<void> {
    await window.api?.pipeline.move(item.item_key, categoryId, Number.MAX_SAFE_INTEGER)
    await load()
  }

  async function createCategory(): Promise<void> {
    const name = (newCat ?? '').trim()
    setNewCat(null)
    if (!name) return
    const c = await window.api?.pipeline.createCategory(name)
    if (!c) setSyncNote(`A category named "${name}" already exists.`)
    await load()
  }

  async function moveCategory(id: string, dir: -1 | 1): Promise<void> {
    const ids = categories.map((c) => c.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await window.api?.pipeline.reorderCategories(ids)
    await load()
  }

  async function deleteCategory(id: string, name: string, count: number): Promise<void> {
    const msg = count > 0
      ? `Delete "${name}"? Its ${count} card${count === 1 ? '' : 's'} will move to the default category.`
      : `Delete "${name}"?`
    if (!await showConfirm(msg)) return
    await window.api?.pipeline.deleteCategory(id)
    await load()
  }

  // ─── Drag and drop (category view only) ─────────────────────────────────────

  function onDropColumn(categoryId: string, visible: PipelineItem[]): void {
    const key = dragKey
    const target = drop
    const fromInbox = dragFrom === 'inbox'
    setDragKey(null)
    setDrop(null)
    setDragFrom('board')
    if (!key || !target || target.col !== categoryId) return
    if (fromInbox) {
      trackFromInbox(key, categoryId, stageFilter ? Number.MAX_SAFE_INTEGER : target.index)
      return
    }
    // With a stage filter on, positions among hidden cards are unknown, so the card goes to the end
    let index = stageFilter ? Number.MAX_SAFE_INTEGER : target.index
    if (!stageFilter) {
      const from = visible.findIndex((i) => i.item_key === key)
      if (from !== -1 && from < index) index -= 1 // the moved card leaves its old slot first
    }
    window.api?.pipeline.move(key, categoryId, index).then(load)
  }

  function dragOverCard(e: React.DragEvent, col: string, index: number): void {
    if (!dragKey) return
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    const next = index + (after ? 1 : 0)
    if (drop?.col !== col || drop.index !== next) setDrop({ col, index: next })
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  const renderCard = (item: PipelineItem, col: string, index: number, visible: PipelineItem[], draggable: boolean): React.JSX.Element => (
    <div
      key={item.item_key}
      onDragOver={draggable ? (e) => dragOverCard(e, col, index) : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); e.stopPropagation(); onDropColumn(col, visible) } : undefined}
    >
      {draggable && drop?.col === col && drop.index === index && <DropLine />}
      <PipelineCard
        item={item}
        categories={categories}
        showCategory={!draggable}
        draggable={draggable}
        dragging={dragKey === item.item_key}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', item.item_key)
          setDragFrom('board')
          setDragKey(item.item_key)
        }}
        onDragEnd={() => { setDragKey(null); setDrop(null); setDragFrom('board') }}
        onOpenTicket={() => openTicket(item)}
        onOpenLink={(url) => window.api?.shell.openExternal(url)}
        onOpenEntity={(entityType, entityId, title) =>
          openTab({ entityType: entityType as 'note' | 'code' | 'flow', entityId, title })
        }
        canOpenSession={canOpenSession}
        onOpenSession={openSession}
        onMove={(cid) => moveTo(item, cid)}
        onRemove={() => removeItem(item)}
      />
      {draggable && drop?.col === col && drop.index === visible.length && index === visible.length - 1 && <DropLine />}
    </div>
  )

  // Columns share the width equally and only scroll sideways once they would get narrower than the minimum
  const columnShell = 'flex-1 min-w-[270px] flex flex-col min-h-0'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-th-bd-2 flex-shrink-0 flex-wrap">
        <h1 className="text-sm font-medium text-th-tx-2 mr-1">Pipeline</h1>
        <span className="text-xs text-th-tx-4">
          {allItems.length} tracked
          {staleCount > 0 ? ` · ${staleCount} stale` : ''}
          {needAttention > 0 ? ` · ${needAttention} need attention` : ''}
        </span>
        <span className="flex-1" />

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!addText.trim()) return
            if (await addTicket(addText)) setAddText('')
          }}
          className="flex items-center gap-1.5"
        >
          <input
            value={addText}
            onChange={(e) => { setAddText(e.target.value); setAddError(null) }}
            placeholder="Add ticket (OB-123 or link)"
            className="w-52 bg-th-bg-3 border border-th-bd-2 rounded-lg px-2.5 py-1.5 text-xs text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={adding || !addText.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-black text-xs font-medium disabled:opacity-40"
          >
            <Plus size={12} />
            Add
          </button>
        </form>

        <button
          onClick={() => setShowInbox((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-th-bd-2 text-xs hover:bg-th-bg-5 ${
            showInbox ? 'bg-th-bg-6 text-accent' : 'text-th-tx-3 hover:text-th-tx-1'
          }`}
          title="Tickets assigned to you that are not on the board"
        >
          <Inbox size={12} />
          Inbox{inbox ? ` ${inbox.items.length}` : ''}
        </button>

        <div className="flex rounded-lg border border-th-bd-2 overflow-hidden">
          <ViewButton active={view === 'category'} onClick={() => setView('category')} title="Group by category">
            <Columns3 size={13} />
          </ViewButton>
          <ViewButton active={view === 'stage'} onClick={() => setView('stage')} title="Group by stage">
            <Rows3 size={13} />
          </ViewButton>
        </div>

        <button
          onClick={refresh}
          disabled={syncing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-th-bd-2 text-xs text-th-tx-3 hover:text-th-tx-1 hover:bg-th-bg-5 disabled:opacity-60"
          title="Re-read Jira and Rivet now"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Refreshing' : lastSynced ? updatedLabel(lastSynced) : 'Refresh'}
        </button>
      </div>

      {(addError || syncNote) && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-th-bd-2 bg-th-bg-3 px-3 py-1.5 text-xs text-th-tx-3">
          <span className="flex-1 min-w-0 break-words [overflow-wrap:anywhere] max-h-24 overflow-y-auto">{addError ?? syncNote}</span>
          <button onClick={() => { setAddError(null); setSyncNote(null) }} className="flex-shrink-0 self-start text-th-tx-5 hover:text-th-tx-1">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="pt-3">
        <StageStrip
          counts={board?.stageCounts ?? EMPTY_COUNTS}
          active={stageFilter}
          onToggle={(s) => setStageFilter((cur) => (cur === s ? null : s))}
        />
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 pb-4">
        {!board ? (
          <p className="text-center text-th-tx-5 text-xs py-8">Loading...</p>
        ) : (
          <div className="flex gap-3 h-full">
            {showInbox && (
              <InboxColumn
                inbox={inbox && inboxDir ? { ...inbox, items: orderInbox(inbox.items, inboxDir) } : inbox}
                error={inboxError}
                loading={inboxLoading}
                draggingKey={dragFrom === 'inbox' ? dragKey : null}
                onDragStart={(e, key) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', key)
                  setDragFrom('inbox')
                  setDragKey(key)
                }}
                onDragEnd={() => { setDragKey(null); setDrop(null); setDragFrom('board') }}
                onTrack={(key) => trackFromInbox(key)}
                onHide={async (key) => { await window.api?.pipeline.inboxHide(key); await loadInbox() }}
                onRestore={async () => { await window.api?.pipeline.inboxRestore(); await loadInbox(true) }}
                onOpenTicket={(i: InboxItem) => openTab({ entityType: 'work-item', entityId: i.key, title: i.title || i.key })}
                onOpenLink={(url) => window.api?.shell.openExternal(url)}
                onSort={() => {
                  const keys = (inbox?.items ?? []).map((i) => i.key)
                  setInboxDir(nextDirection(inboxDir ? sortKeys(keys, inboxDir) : keys))
                }}
                onClose={() => setShowInbox(false)}
              />
            )}
            {allItems.length === 0 && view === 'stage' && <div className="flex-1"><EmptyHint /></div>}
            {!(allItems.length === 0 && view === 'stage') && view === 'category'
              ? categories.map((cat, ci) => {
                  const col = shown.filter((i) => i.category_id === cat.id).sort((a, b) => a.position - b.position)
                  const total = allItems.filter((i) => i.category_id === cat.id).length
                  return (
                    <section
                      key={cat.id}
                      className={columnShell}
                      onDragOver={(e) => {
                        if (!dragKey) return
                        e.preventDefault()
                        if (drop?.col !== cat.id || drop.index !== col.length) setDrop({ col: cat.id, index: col.length })
                      }}
                      onDrop={(e) => { e.preventDefault(); onDropColumn(cat.id, col) }}
                    >
                      <CategoryHeader
                        category={cat}
                        items={col}
                        total={total}
                        canMoveLeft={ci > 0}
                        canMoveRight={ci < categories.length - 1}
                        onRename={async (name) => {
                          const ok = await window.api?.pipeline.updateCategory(cat.id, { name })
                          if (!ok) setSyncNote(`Could not rename: "${name}" may already exist.`)
                          await load()
                        }}
                        onRecolor={async (color) => { await window.api?.pipeline.updateCategory(cat.id, { color }); await load() }}
                        onToggleMute={async () => { await window.api?.pipeline.updateCategory(cat.id, { muted: !cat.muted }); await load() }}
                        onMove={(dir) => moveCategory(cat.id, dir)}
                        onSort={() => sortCategory(cat.id)}
                        onDelete={() => deleteCategory(cat.id, cat.name, total)}
                      />
                      <div
                        className={`flex-1 min-h-[80px] overflow-y-auto space-y-2 pr-1 rounded-lg ${
                          dragKey && drop?.col === cat.id ? 'bg-th-bg-3/40' : ''
                        }`}
                      >
                        {col.map((item, i) => renderCard(item, cat.id, i, col, true))}
                        {col.length === 0 && (
                          <div className="rounded-lg border border-dashed border-th-bd-2 py-6 text-center text-xs text-th-tx-6">
                            {dragKey ? 'Drop here' : stageFilter ? 'Nothing at this stage' : 'Empty'}
                          </div>
                        )}
                      </div>
                    </section>
                  )
                })
              : (allItems.length === 0 && view === 'stage') ? null
              : STAGE_ORDER.map((stage) => {
                  const dir = stageDir[stage]
                  const col = shown
                    .filter((i) => i.stage === stage)
                    .sort((a, b) => b.stage_since - a.stage_since)
                  if (dir) {
                    const order = sortKeys(col.map((i) => i.item_key), dir)
                    col.sort((a, b) => order.indexOf(a.item_key) - order.indexOf(b.item_key))
                  }
                  const meta = STAGE_META[stage]
                  return (
                    <section key={stage} className="flex-1 min-w-[210px] flex flex-col min-h-0">
                      <div className="px-1 pb-2 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                        <h2 className="text-sm font-medium text-th-tx-1">{meta.label}</h2>
                        <span className="text-xs text-th-tx-4 tabular-nums">{col.length}</span>
                        <span className="flex-1" />
                        <button
                          onClick={() => setStageDir((d) => ({ ...d, [stage]: nextDirection(col.map((i) => i.item_key)) }))}
                          className="p-1 rounded text-th-tx-5 hover:text-th-tx-1 hover:bg-th-bg-5"
                          title="Sort by ticket number (click again to reverse)"
                        >
                          <ArrowUpDown size={13} />
                        </button>
                      </div>
                      <div className="flex-1 min-h-[80px] overflow-y-auto space-y-2 pr-1">
                        {col.map((item, i) => renderCard(item, stage, i, col, false))}
                        {col.length === 0 && (
                          <div className="rounded-lg border border-dashed border-th-bd-2 py-6 text-center text-xs text-th-tx-6">
                            Nothing here
                          </div>
                        )}
                      </div>
                    </section>
                  )
                })}

            {view === 'category' && (
              <section className="flex-shrink-0 w-[220px]">
                {newCat === null ? (
                  <button
                    onClick={() => setNewCat('')}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-th-bd-2 py-3 text-xs text-th-tx-4 hover:text-th-tx-1 hover:bg-th-bg-3"
                  >
                    <Plus size={12} />
                    New category
                  </button>
                ) : (
                  <input
                    autoFocus
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onBlur={createCategory}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createCategory()
                      if (e.key === 'Escape') setNewCat(null)
                    }}
                    maxLength={40}
                    placeholder="Category name"
                    className="w-full bg-th-bg-3 border border-th-bd-2 rounded-lg px-2.5 py-2 text-sm text-th-tx-1 placeholder-th-tx-5 outline-none focus:border-accent"
                  />
                )}
                {allItems.length === 0 && view === 'category' && newCat === null && <EmptyHint compact />}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function orderInbox(items: InboxItem[], dir: Direction): InboxItem[] {
  const order = sortKeys(items.map((i) => i.key), dir)
  return [...items].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
}

function DropLine(): React.JSX.Element {
  return <div className="h-0.5 my-1 rounded-full bg-accent" />
}

function ViewButton({
  active, onClick, title, children
}: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1.5 transition-colors ${active ? 'bg-th-bg-6 text-accent' : 'text-th-tx-4 hover:text-th-tx-1 hover:bg-th-bg-5'}`}
    >
      {children}
    </button>
  )
}

function EmptyHint({ compact }: { compact?: boolean }): React.JSX.Element {
  return (
    <p className={`text-xs text-th-tx-5 ${compact ? 'mt-3' : 'text-center py-10'}`}>
      Nothing tracked yet. Add a ticket by key, or drag one from the Inbox. Tickets Rivet starts on are added automatically.
    </p>
  )
}
