import React, { useRef, useState } from 'react'
import { Tag as TagIcon, Archive, ArchiveRestore, Trash2, X, Square, CheckSquare } from 'lucide-react'
import Popover from './Popover'
import { TagPanel, type TagState } from './TagUI'
import type { Tag } from '../lib/tags'

/** Left-hand checkbox on a list row: hidden until the row is hovered or something is selected. */
export function RowCheck({
  checked,
  visible,
  onClick
}: {
  checked: boolean
  visible: boolean
  onClick: (e: React.MouseEvent) => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title="Select (Shift-click for a range)"
      className={`flex-shrink-0 ml-1.5 p-1 rounded transition-opacity ${
        checked ? 'opacity-100 text-accent' : visible ? 'opacity-100 text-th-tx-5 hover:text-th-tx-2' : 'opacity-0 group-hover:opacity-100 text-th-tx-5 hover:text-th-tx-2'
      }`}
    >
      {checked ? <CheckSquare size={14} /> : <Square size={14} />}
    </button>
  )
}

/** Shown above a list while rows are selected. */
export default function BulkBar({
  count,
  total,
  allTags,
  stateOf,
  onToggleTag,
  onCreateTag,
  archivedView,
  onArchiveToggle,
  onDelete,
  onSelectAll,
  onClear
}: {
  count: number
  total: number
  allTags: Tag[]
  stateOf: (tagId: string) => TagState
  onToggleTag: (tag: Tag, current: TagState) => void
  onCreateTag: (name: string) => void
  archivedView: boolean
  onArchiveToggle: () => void
  onDelete: () => void
  onSelectAll: () => void
  onClear: () => void
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const tagBtn = useRef<HTMLButtonElement>(null)

  const btn =
    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-th-tx-2 hover:text-th-tx-1 hover:bg-th-bg-5 transition-colors'

  return (
    <div className="mx-4 mb-1 flex items-center gap-1 px-2 py-1.5 rounded-lg border border-th-bd-2 bg-th-bg-3 flex-shrink-0">
      <span className="px-2 text-xs text-th-tx-1">{count} selected</span>
      {count < total && (
        <button onClick={onSelectAll} className="text-[11px] text-th-tx-4 hover:text-accent px-1">
          Select all {total}
        </button>
      )}
      <div className="flex-1" />
      <button
        ref={tagBtn}
        onClick={() => setAnchor(anchor ? null : tagBtn.current?.getBoundingClientRect() ?? null)}
        className={btn}
      >
        <TagIcon size={12} />
        Tag
      </button>
      <button onClick={onArchiveToggle} className={btn}>
        {archivedView ? <ArchiveRestore size={12} /> : <Archive size={12} />}
        {archivedView ? 'Restore' : 'Archive'}
      </button>
      <button onClick={onDelete} className={`${btn} hover:!text-red-400`}>
        <Trash2 size={12} />
        Delete
      </button>
      <button onClick={onClear} className="p-1.5 rounded-md text-th-tx-4 hover:text-th-tx-1 hover:bg-th-bg-5" title="Clear selection (Esc)">
        <X size={12} />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={240} estimatedHeight={300} align="right">
          <TagPanel allTags={allTags} stateOf={stateOf} onToggle={onToggleTag} onCreate={onCreateTag} />
        </Popover>
      )}
    </div>
  )
}
