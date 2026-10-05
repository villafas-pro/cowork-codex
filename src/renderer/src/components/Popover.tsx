import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Floating panel anchored to a button. Rendered in a portal on top of a full-screen backdrop:
 *  - clicking anywhere outside only closes the panel (the click never reaches the item under it)
 *  - the portal also escapes parents with opacity/overflow that would clip or re-stack the panel
 *  - Escape closes it
 */
export default function Popover({
  anchor,
  onClose,
  width = 220,
  estimatedHeight = 240,
  align = 'left',
  children
}: {
  anchor: DOMRect
  onClose: () => void
  width?: number
  estimatedHeight?: number
  align?: 'left' | 'right'
  children: React.ReactNode
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Immediate: also stops page-level Escape handlers (e.g. clear selection) on the same target
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const rawLeft = align === 'right' ? anchor.right - width : anchor.left
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8))
  // Open below the button unless there isn't room and there is more room above
  const fitsBelow = anchor.bottom + 4 + estimatedHeight <= window.innerHeight
  const position: React.CSSProperties = fitsBelow || anchor.top < estimatedHeight
    ? { top: anchor.bottom + 4 }
    : { bottom: window.innerHeight - anchor.top + 4 }

  return createPortal(
    <>
      {/* Closing on click (not mousedown) keeps the backdrop in place until the click finishes,
          so the click is consumed here instead of landing on whatever is underneath. */}
      <div
        className="fixed inset-0 z-[60]"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
      />
      <div
        style={{ left, width, ...position }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="fixed z-[61] rounded-lg border border-th-bd-2 bg-th-bg-3 shadow-xl"
      >
        {children}
      </div>
    </>,
    document.body
  )
}
