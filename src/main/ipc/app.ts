import { ipcMain, shell } from 'electron'
import { v4 as uuidv4 } from 'uuid'
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
  // Only web and mail links; a pasted work item "URL" could be anything (file:, javascript:, ...)
  ipcMain.handle('shell:openExternal', (_, url: string) => {
    try {
      const protocol = new URL(url).protocol
      if (['http:', 'https:', 'mailto:'].includes(protocol)) shell.openExternal(url)
    } catch { /* not a URL: ignore */ }
  })

  // Tab management
  ipcMain.handle('tabs:getAll', () => {
    const db = getDb()
    return db.prepare(`
      SELECT t.*,
        CASE t.entity_type
          WHEN 'note'      THEN COALESCE(n.title, 'Untitled')
          WHEN 'code'      THEN COALESCE(c.title, 'Untitled')
          WHEN 'flow'      THEN COALESCE(f.title, 'Untitled')
          -- Work item tabs are keyed by item number (ADO "123", Jira "OB-123")
          WHEN 'work-item' THEN COALESCE(
            NULLIF(cw.title, ''),
            CASE WHEN t.entity_id GLOB '*[^0-9]*' THEN t.entity_id ELSE '#' || t.entity_id END
          )
          ELSE 'Untitled'
        END as title
      FROM open_tabs t
      LEFT JOIN notes n       ON t.entity_type = 'note'      AND t.entity_id = n.id
      LEFT JOIN code_blocks c ON t.entity_type = 'code'      AND t.entity_id = c.id
      LEFT JOIN flows f       ON t.entity_type = 'flow'      AND t.entity_id = f.id
      LEFT JOIN cached_work_items cw ON t.entity_type = 'work-item' AND t.entity_id = cw.id
      ORDER BY t.tab_order ASC
    `).all()
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
  ipcMain.handle('search:global', (_, query: string, includeArchived = false) => {
    if (!query.trim()) return []
    const db = getDb()
    const like = `%${query}%`
    // Archived items are hidden unless the caller opts in
    const notArchived = includeArchived ? '' : 'AND archived_at IS NULL'
    const nNotArchived = includeArchived ? '' : 'AND n.archived_at IS NULL'

    // Notes — try FTS first, fall back to LIKE if it throws (e.g. special chars)
    let notes: unknown[] = []
    try {
      // Sanitize query for FTS5: remove special characters that cause parse errors
      const ftsQuery = query.replace(/["()*:^~\-]/g, ' ').trim()
      if (ftsQuery) {
        notes = db.prepare(`
          SELECT n.id, n.title, n.updated_at, n.archived_at, 'note' as type,
                 snippet(notes_fts, 2, '<mark>', '</mark>', '...', 15) as snippet
          FROM notes_fts
          JOIN notes n ON notes_fts.id = n.id
          WHERE notes_fts MATCH ? ${nNotArchived}
          ORDER BY rank LIMIT 10
        `).all(`${ftsQuery}*`)
      }
    } catch {
      // FTS failed — fall back to LIKE
    }
    if (notes.length === 0) {
      notes = db.prepare(`
        SELECT id, title, updated_at, archived_at, 'note' as type, '' as snippet
        FROM notes WHERE (title LIKE ? OR content LIKE ?) ${notArchived} LIMIT 10
      `).all(like, like)
    }

    const code = db.prepare(`
      SELECT id, title, updated_at, archived_at, 'code' as type, language as snippet
      FROM code_blocks WHERE (title LIKE ? OR content LIKE ?) ${notArchived} LIMIT 10
    `).all(like, like)

    const flows = db.prepare(`
      SELECT id, title, updated_at, archived_at, 'flow' as type, '' as snippet
      FROM flows WHERE title LIKE ? ${notArchived} LIMIT 10
    `).all(like)

    const workItems = db.prepare(`
      SELECT
        wi.item_number as id,
        COALESCE(cwi.title, CASE WHEN wi.provider = 'jira' THEN wi.item_number ELSE '#' || wi.item_number END) as title,
        wi.updated_at,
        'work-item' as type,
        CASE WHEN cwi.type IS NOT NULL
          THEN cwi.type || ' · ' || cwi.state
          ELSE wi.url
        END as snippet
      FROM work_items wi
      LEFT JOIN cached_work_items cwi ON cwi.id = wi.item_number
      WHERE wi.item_number LIKE ?
         OR cwi.title LIKE ?
         OR cwi.assigned_to LIKE ?
         OR cwi.type LIKE ?
      LIMIT 10
    `).all(like, like, like, like)

    return [...notes, ...code, ...flows, ...workItems]
  })

  // Templates
  ipcMain.handle('templates:getAll', () => {
    const db = getDb()
    return db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all()
  })

  ipcMain.handle('templates:create', (_, name: string, contentJson: string) => {
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
