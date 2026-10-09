import React, { useRef, useState } from 'react'
import { ArrowUpDown, BellOff, Check, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import Popover from '../Popover'
import { TAG_COLORS, tagColor } from '../../lib/tags'
import { STAGE_META, STAGE_ORDER, type PipelineCategory, type PipelineItem } from '../../lib/pipelineUi'

/** Column header for a category: name, count, a tiny stage breakdown, and a menu. */
export default function CategoryHeader({
  category,
  items,
  total,
  canMoveLeft,
  canMoveRight,
  onRename,
  onRecolor,
  onToggleMute,
  onMove,
  onSort,
  onDelete
}: {
  category: PipelineCategory
  /** Items currently shown in this column */
  items: PipelineItem[]
  /** Items in the category regardless of the stage filter */
  total: number
  canMoveLeft: boolean
  canMoveRight: boolean
  onRename: (name: string) => void
  onRecolor: (color: string) => void
  onToggleMute: () => void
  onMove: (dir: -1 | 1) => void
  onSort: () => void
  onDelete: () => void
}): React.JSX.Element {
  const c = tagColor(category.color)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(category.name)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const btn = useRef<HTMLButtonElement>(null)

  function commit(): void {
    const name = draft.trim()
    setEditing(false)
    if (name && name !== category.name) onRename(name)
    else setDraft(category.name)
  }

  const counts = STAGE_ORDER.map((s) => ({ s, n: items.filter((i) => i.stage === s).length })).filter((x) => x.n > 0)

  return (
    <div className="px-1 pb-2">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.fg }} />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setEditing(false)
                setDraft(category.name)
              }
            }}
            maxLength={40}
            className="flex-1 min-w-0 bg-th-bg-2 border border-th-bd-2 rounded px-1.5 py-0.5 text-sm text-th-tx-1 outline-none focus:border-accent"
          />
        ) : (
          <h2 className="text-sm font-medium text-th-tx-1 truncate" title={category.name}>{category.name}</h2>
        )}
        <span className="text-xs text-th-tx-4 tabular-nums">
          {items.length === total ? total : `${items.length}/${total}`}
        </span>
        {category.muted ? <span title="Alerts are off for this category"><BellOff size={11} className="text-th-tx-5" /></span> : null}
        <span className="flex-1" />
        <button
          onClick={onSort}
          className="p-1 rounded text-th-tx-5 hover:text-th-tx-1 hover:bg-th-bg-5"
          title="Sort by ticket number (click again to reverse)"
        >
          <ArrowUpDown size={13} />
        </button>
        <button
          ref={btn}
          onClick={() => setAnchor(anchor ? null : btn.current?.getBoundingClientRect() ?? null)}
          className="p-1 rounded text-th-tx-5 hover:text-th-tx-1 hover:bg-th-bg-5"
          title="Category options"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Stage breakdown as small coloured counts */}
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 min-h-[14px]">
        {counts.map(({ s, n }) => (
          <span key={s} className="inline-flex items-center gap-1 text-[10px] text-th-tx-4" title={STAGE_META[s].label}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGE_META[s].color }} />
            {n} {STAGE_META[s].short}
          </span>
        ))}
      </div>

      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={210} estimatedHeight={260} align="right">
          <div className="py-1">
            <MenuButton onClick={() => { setAnchor(null); setDraft(category.name); setEditing(true) }} icon={<Pencil size={13} />}>
              Rename
            </MenuButton>
            <MenuButton onClick={() => { setAnchor(null); onToggleMute() }} icon={category.muted ? <Check size={13} /> : <BellOff size={13} />}>
              {category.muted ? 'Turn alerts back on' : 'Mute alerts'}
            </MenuButton>
            <MenuButton disabled={!canMoveLeft} onClick={() => { setAnchor(null); onMove(-1) }} icon={<ChevronLeft size={13} />}>
              Move left
            </MenuButton>
            <MenuButton disabled={!canMoveRight} onClick={() => { setAnchor(null); onMove(1) }} icon={<ChevronRight size={13} />}>
              Move right
            </MenuButton>
            <div className="px-3 py-2 border-t border-th-bd-2 mt-1">
              <p className="text-[10px] uppercase tracking-wide text-th-tx-5 mb-1.5">Color</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TAG_COLORS).map(([name, col]) => (
                  <button
                    key={name}
                    onClick={() => onRecolor(name)}
                    title={name}
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: col.fg,
                      outline: category.color === name ? `2px solid ${col.fg}` : undefined,
                      outlineOffset: 2
                    }}
                  >
                    {category.color === name && <Check size={11} className="text-black" />}
                  </button>
                ))}
              </div>
            </div>
            {!category.is_default && (
              <>
                <div className="my-1 border-t border-th-bd-2" />
                <MenuButton danger onClick={() => { setAnchor(null); onDelete() }} icon={<Trash2 size={13} />}>
                  Delete (cards move to the default)
                </MenuButton>
              </>
            )}
          </div>
        </Popover>
      )}
    </div>
  )
}

function MenuButton({
  onClick,
  icon,
  children,
  disabled,
  danger
}: {
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  disabled?: boolean
  danger?: boolean
}): React.JSX.Element {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger ? 'text-red-400 hover:bg-th-bg-5' : 'text-th-tx-2 hover:bg-th-bg-5 hover:text-th-tx-1'
      }`}
    >
      <span className="w-3.5 flex justify-center flex-shrink-0">{icon}</span>
      {children}
    </button>
  )
}
