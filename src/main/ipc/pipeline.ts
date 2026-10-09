import { BrowserWindow, ipcMain } from 'electron'
import {
  addItem, assignedSuggestions, autoAddRivetTickets, createCategory, deleteCategory, getBoard,
  listCategories, moveItem, removeItem, reorderCategories, syncAllItems, updateCategory
} from '../pipeline'

const POLL_MS = 3 * 60 * 1000

/** One refresh: pick up newly dispatched tickets, then re-read every live ticket. */
async function refresh(): Promise<{ added: string[]; synced: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let added: string[] = []
  try {
    added = await autoAddRivetTickets()
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  const result = await syncAllItems()
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('pipeline:updated')
  }
  return { added, ...result, errors }
}

// Pipeline dashboard: tracked Jira tickets, their stage, and your categories.
export function registerPipelineHandlers(): void {
  ipcMain.handle('pipeline:getBoard', () => getBoard())
  ipcMain.handle('pipeline:sync', () => refresh())

  ipcMain.handle('pipeline:add', async (_, ref: string, categoryId?: string) => {
    const r = await addItem(String(ref), { categoryId })
    return r
  })
  ipcMain.handle('pipeline:remove', (_, key: string) => {
    removeItem(String(key))
    return { success: true }
  })
  ipcMain.handle('pipeline:move', (_, key: string, categoryId: string, index: number) =>
    moveItem(String(key), String(categoryId), Number(index))
  )
  ipcMain.handle('pipeline:suggestions', () => assignedSuggestions())

  ipcMain.handle('pipeline:getCategories', () => listCategories())
  ipcMain.handle('pipeline:createCategory', (_, name: string, color?: string) => createCategory(String(name), color))
  ipcMain.handle('pipeline:updateCategory', (_, id: string, patch: { name?: string; color?: string; muted?: boolean }) =>
    updateCategory(String(id), patch)
  )
  ipcMain.handle('pipeline:deleteCategory', (_, id: string) => deleteCategory(String(id)))
  ipcMain.handle('pipeline:reorderCategories', (_, ids: string[]) => {
    reorderCategories(ids.map(String))
    return { success: true }
  })

  // Poll while the app is open. Failures are logged and retried on the next tick.
  const tick = (): void => {
    refresh().catch((e) => console.error('[pipeline] background refresh failed:', e instanceof Error ? e.message : e))
  }
  setTimeout(tick, 20_000)
  setInterval(tick, POLL_MS)
}
