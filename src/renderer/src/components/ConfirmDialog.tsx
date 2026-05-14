import React, { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export default function ConfirmDialog(): React.JSX.Element | null {
  const { confirmDialog, resolveConfirm } = useAppStore()

  // Close on Escape
  useEffect(() => {
    if (!confirmDialog) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') resolveConfirm(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [confirmDialog, resolveConfirm])

  if (!confirmDialog) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={() => resolveConfirm(false)}
    >
      <div
        className="bg-th-bg-4 border border-th-bd-3 rounded-xl p-5 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-th-tx-2 leading-relaxed">{confirmDialog.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => resolveConfirm(false)}
            className="px-3 py-1.5 text-xs text-th-tx-4 hover:text-th-tx-1 transition-colors rounded-md hover:bg-th-bg-6"
            autoFocus
          >
            Cancel
          </button>
          <button
            onClick={() => resolveConfirm(true)}
            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white font-medium rounded-md transition-all"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
