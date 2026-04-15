import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import type { Note } from '@shared/types'

export function registerNoteHandlers(): void {
  // Get all notes
  ipcMain.handle('notes:getAll', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC').all()
  })

  // Get single note
  ipcMain.handle('notes:get', (_, id: string) => {
    const db = getDb()
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  })

  // Create note
  ipcMain.handle('notes:create', (_, data: Partial<Note>) => {
    const db = getDb()
    const id = uuidv4()
    const now = Date.now()
    db.prepare(`
      INSERT INTO notes (id, title, content, created_at, updated_at, is_pinned)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, data.title || 'Untitled', data.content || '{}', now, now)
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  })

  // Update note
  ipcMain.handle('notes:update', (_, id: string, data: Partial<Note>) => {
    const db = getDb()
    const now = Date.now()
    // Use snake_case to match actual SQLite column names
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as {
      title: string
      content: string
      is_pinned: number
      all_work_items_done: number
      created_at: number
      updated_at: number
    } | undefined
    if (!note) return null

    // Save version history every 5 minutes
    const lastVersion = db
      .prepare('SELECT * FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(id) as { created_at: number } | undefined

    const fiveMinutes = 5 * 60 * 1000
    if (!lastVersion || now - lastVersion.created_at > fiveMinutes) {
      db.prepare('INSERT INTO note_versions (id, note_id, content, created_at) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), id, note.content, now)

      // Keep only 50 versions per note
      const versions = db
        .prepare('SELECT id FROM note_versions WHERE note_id = ? ORDER BY created_at DESC')
        .all(id) as { id: string }[]
      if (versions.length > 50) {
        const toDelete = versions.slice(50).map((v) => v.id)
        db.prepare(`DELETE FROM note_versions WHERE id IN (${toDelete.map(() => '?').join(',')})`)
          .run(...toDelete)
      }
    }

    db.prepare(`
      UPDATE notes SET title = ?, content = ?, updated_at = ?, is_pinned = ?
      WHERE id = ?
    `).run(
      data.title ?? note.title,
      data.content ?? note.content,
      now,
      note.is_pinned,
      id
    )

    // Update FTS
    db.prepare('INSERT OR REPLACE INTO notes_fts(id, title, content) VALUES (?, ?, ?)').run(
      id,
      data.title ?? note.title,
      data.content ?? note.content
    )

    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  })

  // Delete note
  ipcMain.handle('notes:delete', (_, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    db.prepare('DELETE FROM notes_fts WHERE id = ?').run(id)
    return { success: true }
  })

  // Toggle pin
  ipcMain.handle('notes:togglePin', (_, id: string) => {
    const db = getDb()
    const note = db.prepare('SELECT is_pinned FROM notes WHERE id = ?').get(id) as { is_pinned: number }
    const newVal = note.is_pinned ? 0 : 1
    db.prepare('UPDATE notes SET is_pinned = ? WHERE id = ?').run(newVal, id)
    return { isPinned: newVal }
  })

  // Get note versions
  ipcMain.handle('notes:getVersions', (_, noteId: string) => {
    const db = getDb()
    return db
      .prepare('SELECT * FROM note_versions WHERE note_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(noteId)
  })

  // Search notes
  ipcMain.handle('notes:search', (_, query: string) => {
    const db = getDb()
    return db
      .prepare(`
        SELECT n.*, snippet(notes_fts, 2, '<mark>', '</mark>', '...', 20) as snippet
        FROM notes_fts
        JOIN notes n ON notes_fts.id = n.id
        WHERE notes_fts MATCH ?
        ORDER BY rank
        LIMIT 20
      `)
      .all(`${query}*`)
  })
}
