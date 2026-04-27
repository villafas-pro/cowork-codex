import React from 'react'
import { CheckSquare, Square, AlertTriangle, ExternalLink, X } from 'lucide-react'
import { type WorkItem, TYPE_COLORS, effectiveDone } from '../lib/workItemUtils'

interface WorkItemRowProps {
  item: WorkItem
  adoStatus: string
  onToggle: (id: string) => void
  onOpen: (item: WorkItem) => void
  /** Omit to hide the remove button (e.g. when the note is locked). */
  onRemove?: (id: string) => void
}

export default function WorkItemRow({
  item,
  adoStatus,
  onToggle,
  onOpen,
  onRemove,
}: WorkItemRowProps): React.JSX.Element {
  const done = effectiveDone(item)

  return (
    <div className="flex items-start gap-2 px-3 py-2 group hover:bg-th-bg-3 transition-all">
      {/* Checkbox */}
      {item.is_ado ? (
        <span className="flex-shrink-0 text-th-tx-6 mt-0.5 cursor-default" title="State managed by ADO">
          {done ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
        </span>
      ) : (
        <button
          onClick={() => onToggle(item.id)}
          className="flex-shrink-0 text-th-tx-6 hover:text-accent transition-colors mt-0.5"
        >
          {item.is_done ? <CheckSquare size={13} className="text-accent" /> : <Square size={13} />}
        </button>
      )}

      {/* Title + metadata */}
      <button
        onClick={() => onOpen(item)}
        className={`flex-1 text-left min-w-0 transition-all hover:text-accent ${done ? 'opacity-40' : ''}`}
      >
        {item.cached_title ? (
          <>
            <p className="text-xs text-th-tx-2 truncate leading-snug">{item.cached_title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {item.cached_type && (
                <span
                  className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
                  style={{ background: TYPE_COLORS[item.cached_type] || '#666' }}
                />
              )}
              <span className="text-[10px] text-th-tx-6">#{item.item_number}</span>
              {item.cached_state && (
                <span className="text-[10px] text-th-tx-6">· {item.cached_state}</span>
              )}
            </div>
          </>
        ) : (
          <p className={`text-xs truncate ${item.is_done ? 'line-through text-th-tx-6' : 'text-th-tx-2'}`}>
            #{item.item_number}
          </p>
        )}
      </button>

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
        {item.is_ado && adoStatus === 'error' && (
          <span title="ADO connection error — data may be stale" className="text-amber-500 p-0.5">
            <AlertTriangle size={11} />
          </span>
        )}
        <button
          onClick={() => window.api?.shell.openExternal(item.url)}
          title="Open in ADO"
          className="text-th-tx-6 group-hover:text-th-tx-5 transition-colors p-0.5"
        >
          <ExternalLink size={11} />
        </button>
        {onRemove && (
          <button
            onClick={() => onRemove(item.id)}
            className="text-th-tx-6 group-hover:text-th-tx-5 hover:!text-red-400 transition-colors p-0.5"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
