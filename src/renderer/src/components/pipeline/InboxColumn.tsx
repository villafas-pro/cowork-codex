import React from 'react'
import { ExternalLink, EyeOff, Inbox, Plus, RotateCcw, X } from 'lucide-react'
import type { InboxItem, PipelineInbox } from '../../lib/pipelineUi'

/**
 * Tickets assigned to you that are not on the board yet. Drag one onto a category to track it,
 * or press Track to put it in the default category. These are not part of the pipeline until then.
 */
export default function InboxColumn({
  inbox,
  error,
  loading,
  draggingKey,
  onDragStart,
  onDragEnd,
  onTrack,
  onHide,
  onRestore,
  onOpenTicket,
  onOpenLink,
  onClose
}: {
  inbox: PipelineInbox | null
  error: string | null
  loading: boolean
  draggingKey: string | null
  onDragStart: (e: React.DragEvent, key: string) => void
  onDragEnd: () => void
  onTrack: (key: string) => void
  onHide: (key: string) => void
  onRestore: () => void
  onOpenTicket: (item: InboxItem) => void
  onOpenLink: (url: string) => void
  onClose: () => void
}): React.JSX.Element {
  const items = inbox?.items ?? []
  return (
    <section className="flex-shrink-0 w-[270px] flex flex-col min-h-0 rounded-xl border border-dashed border-th-bd-2 bg-th-bg-3/30 px-2 pt-2">
      <div className="px-1 pb-2">
        <div className="flex items-center gap-2">
          <Inbox size={14} className="text-th-tx-3" />
          <h2 className="text-sm font-medium text-th-tx-1">Inbox</h2>
          <span className="text-xs text-th-tx-4 tabular-nums">{items.length}</span>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded text-th-tx-5 hover:text-th-tx-1 hover:bg-th-bg-5" title="Hide the Inbox">
            <X size={13} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-th-tx-5 leading-snug">Assigned to you, not tracked yet. Drag onto a category to track it.</p>
      </div>

      <div className="flex-1 min-h-[80px] overflow-y-auto space-y-2 pr-1 pb-2">
        {error && <p className="px-1 py-2 text-xs text-amber-400">{error}</p>}
        {!error && loading && !inbox && <p className="px-1 py-2 text-xs text-th-tx-5">Loading...</p>}
        {!error && inbox && items.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-th-tx-5">Nothing waiting. Everything assigned to you is tracked.</p>
        )}

        {items.map((item) => (
          <div
            key={item.key}
            draggable
            onDragStart={(e) => onDragStart(e, item.key)}
            onDragEnd={onDragEnd}
            className={`group rounded-lg border border-th-bd-2 bg-th-bg-2 p-2.5 cursor-grab active:cursor-grabbing hover:border-th-bd-3 transition-colors ${
              draggingKey === item.key ? 'opacity-40' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <button onClick={() => onOpenTicket(item)} className="font-mono text-xs text-accent hover:underline" title="Open the ticket in this app">
                {item.key}
              </button>
              {item.type && <span className="text-[10px] uppercase tracking-wide text-th-tx-5 truncate">{item.type}</span>}
              <span className="flex-1" />
              {item.url && (
                <button onClick={() => onOpenLink(item.url)} className="p-0.5 text-th-tx-5 hover:text-th-tx-1" title="Open in Jira">
                  <ExternalLink size={11} />
                </button>
              )}
              <button
                onClick={() => onHide(item.key)}
                className="p-0.5 text-transparent group-hover:text-th-tx-5 hover:!text-th-tx-1"
                title="Hide from the Inbox"
              >
                <EyeOff size={12} />
              </button>
            </div>
            <button onClick={() => onOpenTicket(item)} className="mt-1 block w-full text-left text-[13px] text-th-tx-1 leading-snug line-clamp-2 hover:text-accent">
              {item.title}
            </button>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-th-bg-5 px-2 py-0.5 text-[10px] text-th-tx-3 truncate max-w-[110px]">{item.state || 'No status'}</span>
              {item.sprint && <span className="text-[10px] text-th-tx-5 truncate">{item.sprint}</span>}
              <span className="flex-1" />
              <button
                onClick={() => onTrack(item.key)}
                className="inline-flex items-center gap-1 rounded-md border border-th-bd-2 px-2 py-0.5 text-[11px] text-th-tx-2 hover:text-th-tx-1 hover:bg-th-bg-5"
                title="Track it in the default category"
              >
                <Plus size={11} /> Track
              </button>
            </div>
          </div>
        ))}

        {inbox && inbox.hiddenCount > 0 && (
          <button onClick={onRestore} className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-th-tx-5 hover:text-th-tx-2">
            <RotateCcw size={11} />
            Show {inbox.hiddenCount} hidden
          </button>
        )}
      </div>
    </section>
  )
}
