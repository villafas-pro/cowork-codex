import React, { useRef, useState } from 'react'
import { MoreHorizontal, Tag as TagIcon, ChevronLeft } from 'lucide-react'
import Popover from './Popover'
import { TagPanel } from './TagUI'
import type { Tag } from '../lib/tags'

export interface RowMenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  /** Small right-aligned text, e.g. why an item is disabled */
  hint?: string
  /** Draw a divider above this item */
  divider?: boolean
}

export interface RowMenuTags {
  allTags: Tag[]
  assigned: Tag[]
  onAssign: (tag: Tag) => void
  onUnassign: (tagId: string) => void
  onCreate: (name: string) => void
}

/**
 * One "more" button that replaces a row of hover icons. When `tags` is given, a "Tags..." entry
 * swaps the menu for the tag panel in place, so there is only ever one popover to dismiss.
 */
export default function RowMenu({
  items,
  tags,
  tagsFirst
}: {
  items: RowMenuItem[]
  tags?: RowMenuTags
  /** Put "Tags..." before the other items (default) or after them */
  tagsFirst?: boolean
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [view, setView] = useState<'menu' | 'tags'>('menu')
  const btnRef = useRef<HTMLButtonElement>(null)
  const open = anchor !== null

  const close = (): void => {
    setAnchor(null)
    setView('menu')
  }

  const itemClass = (danger?: boolean): string =>
    `w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      danger ? 'text-red-400 hover:bg-th-bg-5' : 'text-th-tx-2 hover:bg-th-bg-5 hover:text-th-tx-1'
    }`

  const tagsEntry = tags ? (
    <button key="__tags" onClick={() => setView('tags')} className={itemClass()}>
      <span className="flex-shrink-0 w-3.5 flex justify-center"><TagIcon size={13} /></span>
      <span className="flex-1">Tags...</span>
      {tags.assigned.length > 0 && <span className="text-[10px] text-th-tx-5">{tags.assigned.length}</span>}
    </button>
  ) : null

  const assignedIds = new Set(tags?.assigned.map((t) => t.id))

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation()
          if (open) close()
          else setAnchor(btnRef.current?.getBoundingClientRect() ?? null)
        }}
        className={`flex-shrink-0 p-1.5 mr-1 rounded transition-colors ${
          open ? 'text-th-tx-1 bg-th-bg-5' : 'text-transparent group-hover:text-th-tx-6 hover:!text-th-tx-1'
        }`}
        title="More actions"
      >
        <MoreHorizontal size={14} />
      </button>
      {anchor && (
        <Popover
          anchor={anchor}
          onClose={close}
          width={view === 'tags' ? 240 : 200}
          estimatedHeight={view === 'tags' ? 300 : (items.length + 1) * 34 + 12}
          align="right"
        >
          {view === 'tags' && tags ? (
            <div>
              <button
                onClick={() => setView('menu')}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-th-tx-4 hover:text-th-tx-1 border-b border-th-bd-2"
              >
                <ChevronLeft size={12} />
                Back
              </button>
              <TagPanel
                allTags={tags.allTags}
                stateOf={(id) => (assignedIds.has(id) ? 'all' : 'none')}
                onToggle={(tag, s) => (s === 'all' ? tags.onUnassign(tag.id) : tags.onAssign(tag))}
                onCreate={tags.onCreate}
              />
            </div>
          ) : (
            <div className="py-1">
              {tagsFirst !== false && tagsEntry}
              {items.map((item) => (
                <React.Fragment key={item.label}>
                  {item.divider && <div className="my-1 border-t border-th-bd-2" />}
                  <button
                    disabled={item.disabled}
                    onClick={() => {
                      close()
                      item.onClick()
                    }}
                    className={itemClass(item.danger)}
                  >
                    <span className="flex-shrink-0 w-3.5 flex justify-center">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.hint && <span className="text-[10px] text-th-tx-5">{item.hint}</span>}
                  </button>
                </React.Fragment>
              ))}
              {tagsFirst === false && tagsEntry}
            </div>
          )}
        </Popover>
      )}
    </>
  )
}
