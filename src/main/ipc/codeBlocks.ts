import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'

export function registerCodeBlockHandlers(): void {
  ipcMain.handle('code:getAll', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM code_blocks ORDER BY is_pinned DESC, created_at DESC').all()
  })

  ipcMain.handle('code:get', (_, id: string) => {
    const db = getDb()
    return db.prepare('SELECT * FROM code_blocks WHERE id = ?').get(id)
  })

  ipcMain.handle('code:getForNote', (_, noteId: string) => {
    const db = getDb()
    return db.prepare('SELECT * FROM code_blocks WHERE note_id = ? ORDER BY created_at ASC').all(noteId)
  })

  ipcMain.handle('code:create', (_, data: { title?: string; language?: string; content?: string; noteId?: string }) => {
    const db = getDb()
    const id = uuidv4()
    const now = Date.now()
    db.prepare(`
      INSERT INTO code_blocks (id, title, language, content, note_id, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, data.title || 'Untitled', data.language || 'plaintext', data.content || '', data.noteId || null, now, now)
    return db.prepare('SELECT * FROM code_blocks WHERE id = ?').get(id)
  })

  ipcMain.handle('code:update', (_, id: string, data: { title?: string; language?: string; content?: string; isPinned?: number }) => {
    const db = getDb()
    const now = Date.now()
    const block = db.prepare('SELECT * FROM code_blocks WHERE id = ?').get(id) as any
    if (!block) return null

    db.prepare(`
      UPDATE code_blocks SET title = ?, language = ?, content = ?, is_pinned = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.title ?? block.title,
      data.language ?? block.language,
      data.content ?? block.content,
      data.isPinned ?? block.is_pinned,
      now,
      id
    )

    // If part of a sync group, update all synced blocks content
    if (block.sync_group_id && data.content !== undefined) {
      db.prepare(`
        UPDATE code_blocks SET content = ?, updated_at = ?
        WHERE sync_group_id = ? AND id != ?
      `).run(data.content, now, block.sync_group_id, id)
    }

    return db.prepare('SELECT * FROM code_blocks WHERE id = ?').get(id)
  })

  ipcMain.handle('code:delete', (_, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM code_blocks WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('code:togglePin', (_, id: string) => {
    const db = getDb()
    const block = db.prepare('SELECT is_pinned FROM code_blocks WHERE id = ?').get(id) as { is_pinned: number }
    const newVal = block.is_pinned ? 0 : 1
    db.prepare('UPDATE code_blocks SET is_pinned = ? WHERE id = ?').run(newVal, id)
    return { isPinned: newVal }
  })

  // Create a sync group and add two code blocks to it
  ipcMain.handle('code:syncBlocks', (_, sourceId: string, targetId: string) => {
    const db = getDb()
    const groupId = uuidv4()
    db.prepare('INSERT INTO sync_groups (id, created_at) VALUES (?, ?)').run(groupId, Date.now())
    db.prepare('UPDATE code_blocks SET sync_group_id = ? WHERE id IN (?, ?)').run(groupId, sourceId, targetId)
    return { syncGroupId: groupId }
  })

  // Import a code block (copy or sync)
  ipcMain.handle('code:import', (_, sourceId: string, targetNoteId: string, mode: 'copy' | 'sync') => {
    const db = getDb()
    const source = db.prepare('SELECT * FROM code_blocks WHERE id = ?').get(sourceId) as any
    if (!source) return null

    const newId = uuidv4()
    const now = Date.now()

    if (mode === 'copy') {
      db.prepare(`
        INSERT INTO code_blocks (id, title, language, content, note_id, sync_group_id, is_pinned, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?)
      `).run(newId, source.title, source.language, source.content, targetNoteId, now, now)
    } else {
      // Sync mode: add to same sync group (or create one)
      let syncGroupId = source.sync_group_id
      if (!syncGroupId) {
        syncGroupId = uuidv4()
        db.prepare('INSERT INTO sync_groups (id, created_at) VALUES (?, ?)').run(syncGroupId, now)
        db.prepare('UPDATE code_blocks SET sync_group_id = ? WHERE id = ?').run(syncGroupId, sourceId)
      }
      db.prepare(`
        INSERT INTO code_blocks (id, title, language, content, note_id, sync_group_id, is_pinned, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(newId, source.title, source.language, source.content, targetNoteId, syncGroupId, now, now)
    }

    return db.prepare('SELECT * FROM code_blocks WHERE id = ?').get(newId)
  })

  // Get all blocks in a sync group
  ipcMain.handle('code:getSyncLocations', (_, syncGroupId: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT cb.*, n.title as note_title
      FROM code_blocks cb
      LEFT JOIN notes n ON cb.note_id = n.id
      WHERE cb.sync_group_id = ?
    `).all(syncGroupId)
  })
}
