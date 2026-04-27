import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'

export function registerFlowHandlers(): void {
  ipcMain.handle('flows:getAll', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM flows ORDER BY is_pinned DESC, created_at DESC').all()
  })

  ipcMain.handle('flows:get', (_, id: string) => {
    const db = getDb()
    return db.prepare('SELECT * FROM flows WHERE id = ?').get(id)
  })

  ipcMain.handle('flows:create', (_, data: { title?: string; noteId?: string }) => {
    const db = getDb()
    const id = uuidv4()
    const now = Date.now()
    db.prepare(`
      INSERT INTO flows (id, title, content_json, note_id, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(id, data.title || 'Untitled', '{"nodes":[],"edges":[]}', data.noteId || null, now, now)
    return db.prepare('SELECT * FROM flows WHERE id = ?').get(id)
  })

  ipcMain.handle('flows:update', (_, id: string, data: { title?: string; contentJson?: string; isPinned?: number }) => {
    const db = getDb()
    const now = Date.now()
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(id) as any
    if (!flow) return null

    db.prepare(`
      UPDATE flows SET title = ?, content_json = ?, is_pinned = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.title ?? flow.title,
      data.contentJson ?? flow.content_json,
      data.isPinned ?? flow.is_pinned,
      now,
      id
    )
    return db.prepare('SELECT * FROM flows WHERE id = ?').get(id)
  })

  ipcMain.handle('flows:delete', (_, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM flows WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('flows:togglePin', (_, id: string) => {
    const db = getDb()
    const flow = db.prepare('SELECT is_pinned FROM flows WHERE id = ?').get(id) as { is_pinned: number }
    const newVal = flow.is_pinned ? 0 : 1
    db.prepare('UPDATE flows SET is_pinned = ? WHERE id = ?').run(newVal, id)
    return { isPinned: newVal }
  })

  ipcMain.handle('flows:getForNote', (_, noteId: string) => {
    const db = getDb()
    return db.prepare('SELECT * FROM flows WHERE note_id = ? ORDER BY created_at ASC').all(noteId)
  })

  ipcMain.handle('flows:unlinkNote', (_, id: string) => {
    const db = getDb()
    db.prepare('UPDATE flows SET note_id = NULL WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('flows:linkNote', (_, flowId: string, noteId: string) => {
    const db = getDb()
    db.prepare('UPDATE flows SET note_id = ?, updated_at = ? WHERE id = ?').run(noteId, Date.now(), flowId)
    return { success: true }
  })
}
