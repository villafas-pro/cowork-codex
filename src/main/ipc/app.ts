import { ipcMain, shell } from 'electron'
import { getDb } from '../db'

export function registerAppHandlers(): void {
  // Get/set settings
  ipcMain.handle('settings:get', (_, key: string) => {
    const db = getDb()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  })

  ipcMain.handle('settings:set', (_, key: string, value: string) => {
    const db = getDb()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    return { success: true }
  })

  // Open external URL in browser
  ipcMain.handle('shell:openExternal', (_, url: string) => {
    shell.openExternal(url)
  })

  // Tab management
  ipcMain.handle('tabs:getAll', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM open_tabs ORDER BY tab_order ASC').all()
  })

  ipcMain.handle('tabs:save', (_, tabs: Array<{ id: string; entityType: string; entityId: string; tabOrder: number; isActive: number }>) => {
    const db = getDb()
    const deleteAll = db.prepare('DELETE FROM open_tabs')
    const insert = db.prepare(`
      INSERT INTO open_tabs (id, entity_type, entity_id, tab_order, is_active)
      VALUES (?, ?, ?, ?, ?)
    `)
    const saveAll = db.transaction(() => {
      deleteAll.run()
      for (const tab of tabs) {
        insert.run(tab.id, tab.entityType, tab.entityId, tab.tabOrder, tab.isActive)
      }
    })
    saveAll()
    return { success: true }
  })

  // Todo content
  ipcMain.handle('todo:get', () => {
    const db = getDb()
    return db.prepare('SELECT content FROM todo_content WHERE id = 1').get()
  })

  ipcMain.handle('todo:save', (_, content: string) => {
    const db = getDb()
    db.prepare('UPDATE todo_content SET content = ? WHERE id = 1').run(content)
    return { success: true }
  })

  // Global search
  ipcMain.handle('search:global', (_, query: string) => {
    const db = getDb()
    const notes = db.prepare(`
      SELECT n.id, n.title, n.updated_at, 'note' as type,
             snippet(notes_fts, 2, '<mark>', '</mark>', '...', 15) as snippet
      FROM notes_fts
      JOIN notes n ON notes_fts.id = n.id
      WHERE notes_fts MATCH ?
      ORDER BY rank LIMIT 10
    `).all(`${query}*`)

    const code = db.prepare(`
      SELECT id, title, updated_at, 'code' as type, language as snippet
      FROM code_blocks
      WHERE title LIKE ? OR content LIKE ?
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`)

    const flows = db.prepare(`
      SELECT id, title, updated_at, 'flow' as type, '' as snippet
      FROM flows WHERE title LIKE ? LIMIT 10
    `).all(`%${query}%`)

    const workItems = db.prepare(`
      SELECT id, item_number as title, updated_at, 'work-item' as type, url as snippet
      FROM work_items WHERE item_number LIKE ? OR url LIKE ? LIMIT 10
    `).all(`%${query}%`, `%${query}%`)

    return [...notes, ...code, ...flows, ...workItems]
  })

  // Templates
  ipcMain.handle('templates:getAll', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all()
  })

  ipcMain.handle('templates:create', (_, name: string, contentJson: string) => {
    const { v4: uuidv4 } = require('uuid')
    const db = getDb()
    const id = uuidv4()
    db.prepare('INSERT INTO templates (id, name, content_json, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, contentJson, Date.now())
    return db.prepare('SELECT * FROM templates WHERE id = ?').get(id)
  })

  ipcMain.handle('templates:delete', (_, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM templates WHERE id = ?').run(id)
    return { success: true }
  })
}
