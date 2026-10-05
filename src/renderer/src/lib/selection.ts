import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Multi-select for list pages.
 *  - checkbox click or Ctrl/Cmd+click toggles one row
 *  - Shift+click (or Shift+checkbox) selects the range from the last toggled row
 *  - once anything is selected, a plain click on a row toggles it instead of opening it
 *  - Escape clears the selection
 * `orderedIds` is the visible order, top to bottom, which is what ranges use.
 */
export function useSelection(orderedIds: string[]): {
  selected: Set<string>
  selectedIds: string[]
  count: number
  isSelecting: boolean
  isSelected: (id: string) => boolean
  /** Row click. Returns true when the click was used for selection (so don't open the row). */
  rowClick: (id: string, e: React.MouseEvent) => boolean
  /** Checkbox click */
  toggle: (id: string, e: React.MouseEvent) => void
  selectAll: () => void
  clear: () => void
} {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const orderKey = orderedIds.join('|')
  const order = useMemo(() => orderedIds, [orderKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drop ids that are no longer visible (filtered out, archived, deleted)
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const visible = new Set(order)
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [order])

  const clear = useCallback(() => {
    setSelected(new Set())
    anchor.current = null
  }, [])

  const selectAll = useCallback(() => setSelected(new Set(order)), [order])

  const range = useCallback(
    (id: string) => {
      const from = anchor.current ? order.indexOf(anchor.current) : -1
      const to = order.indexOf(id)
      if (from === -1 || to === -1) {
        setSelected((prev) => new Set(prev).add(id))
      } else {
        const [a, b] = from < to ? [from, to] : [to, from]
        setSelected((prev) => {
          const next = new Set(prev)
          for (let i = a; i <= b; i++) next.add(order[i])
          return next
        })
      }
      // Keep the anchor so repeated shift-clicks extend from the same row
    },
    [order]
  )

  const flip = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    anchor.current = id
  }, [])

  const toggle = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      if (e.shiftKey && anchor.current) range(id)
      else flip(id)
    },
    [range, flip]
  )

  const rowClick = useCallback(
    (id: string, e: React.MouseEvent): boolean => {
      if (e.shiftKey) {
        window.getSelection()?.removeAllRanges()
        if (anchor.current) range(id)
        else flip(id) // no anchor yet: shift-click just starts a selection
        return true
      }
      if (e.ctrlKey || e.metaKey || selected.size > 0) {
        flip(id)
        return true
      }
      return false
    },
    [range, flip, selected.size]
  )

  // Escape clears (ignored while typing; popovers swallow their own Escape first)
  useEffect(() => {
    if (selected.size === 0) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size, clear])

  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  return {
    selected,
    selectedIds: [...selected],
    count: selected.size,
    isSelecting: selected.size > 0,
    isSelected,
    rowClick,
    toggle,
    selectAll,
    clear
  }
}
