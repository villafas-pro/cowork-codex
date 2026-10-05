import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'

// Tags and archiving are shared by notes, code blocks and flows.
type EntityType = 'note' | 'code' | 'flow'

const TABLE_FOR_TYPE: Record<EntityType, string> = {
  note: 'notes',
  code: 'code_blocks',
  flow: 'flows'
}

function tableFor(type: string): string {
  const table = TABLE_FOR_TYPE[type as EntityType]
  if (!table) throw new Error(`Unknown entity type: ${type}`)
  return table
}

const COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray']

/** Stable default color so new tags aren't all the same without the user picking one. */
function defaultColor(name: string): string {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % (COLORS.length - 1)] // never auto-pick gray
}

/** Tag names have no spaces (so `#tag` search tokens work) and no leading '#'. */
function cleanName(name: string): string {
  return (name || '').trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 40)
}

interface TagRow {
  id: string
  name: string
  color: string
  created_at: number
}

export function registerTagHandlers(): void {
  // ─── Tags ──────────────────────────────────────────────────────────────────

  ipcMain.handle('tags:getAll', () =>
    getDb()
      .prepare(`
        SELECT t.*,
          (SELECT COUNT(*) FROM item_tags it WHERE it.tag_id = t.id) AS count
        FROM tags t
        ORDER BY t.name COLLATE NOCASE
      `)
      .all()
  )

  // Creates a tag, or returns the existing one if the name already exists (case-insensitive)
  ipcMain.handle('tags:create', (_, name: string, color?: string) => {
    const db = getDb()
    const trimmed = cleanName(name)
    if (!trimmed) return null
    const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(trimmed) as TagRow | undefined
    if (existing) return existing
    const id = uuidv4()
    db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)')
      .run(id, trimmed, color && COLORS.includes(color) ? color : defaultColor(trimmed), Date.now())
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
  })

  ipcMain.handle('tags:update', (_, id: string, data: { name?: string; color?: string }) => {
    const db = getDb()
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined
    if (!tag) return { success: false, error: 'Tag not found' }

    if (data.name !== undefined) {
      const name = cleanName(data.name)
      if (!name) return { success: false, error: 'Name cannot be empty' }
      const clash = db.prepare('SELECT id FROM tags WHERE name = ? AND id <> ?').get(name, id)
      if (clash) return { success: false, error: 'A tag with that name already exists. Use merge instead.' }
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
    }
    if (data.color !== undefined && COLORS.includes(data.color)) {
      db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(data.color, id)
    }
    return { success: true, tag: db.prepare('SELECT * FROM tags WHERE id = ?').get(id) }
  })

  // Deleting a tag only removes the label (item_tags cascade); items are untouched
  ipcMain.handle('tags:delete', (_, id: string) => {
    getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
    return { success: true }
  })

  // Move every assignment from source to target, then delete source
  ipcMain.handle('tags:merge', (_, sourceId: string, targetId: string) => {
    if (sourceId === targetId) return { success: true }
    const db = getDb()
    db.transaction(() => {
      db.prepare(`
        INSERT OR IGNORE INTO item_tags (tag_id, entity_type, entity_id)
        SELECT ?, entity_type, entity_id FROM item_tags WHERE tag_id = ?
      `).run(targetId, sourceId)
      db.prepare('DELETE FROM tags WHERE id = ?').run(sourceId)
    })()
    return { success: true }
  })

  // ─── Assignments ───────────────────────────────────────────────────────────

  // All assignments for one entity type (or every type), so list pages need a single call
  ipcMain.handle('tags:getAssignments', (_, entityType?: string) => {
    const db = getDb()
    if (entityType) {
      tableFor(entityType)
      return db
        .prepare('SELECT tag_id, entity_type, entity_id FROM item_tags WHERE entity_type = ?')
        .all(entityType)
    }
    return db.prepare('SELECT tag_id, entity_type, entity_id FROM item_tags').all()
  })

  ipcMain.handle('tags:assign', (_, entityType: string, entityId: string, tagId: string) => {
    tableFor(entityType)
    getDb()
      .prepare('INSERT OR IGNORE INTO item_tags (tag_id, entity_type, entity_id) VALUES (?, ?, ?)')
      .run(tagId, entityType, entityId)
    return { success: true }
  })

  ipcMain.handle('tags:unassign', (_, entityType: string, entityId: string, tagId: string) => {
    getDb()
      .prepare('DELETE FROM item_tags WHERE tag_id = ? AND entity_type = ? AND entity_id = ?')
      .run(tagId, entityType, entityId)
    return { success: true }
  })

  // Items across all types that carry the given tags. mode 'and' requires every tag.
  ipcMain.handle(
    'tags:getItems',
    (_, tagIds: string[], mode: 'and' | 'or', includeArchived: boolean) => {
      const db = getDb()
      if (!tagIds.length) return []
      const placeholders = tagIds.map(() => '?').join(',')
      const having = mode === 'and' ? `HAVING COUNT(DISTINCT tag_id) = ${tagIds.length}` : ''
      const matches = db
        .prepare(`
          SELECT entity_type, entity_id FROM item_tags
          WHERE tag_id IN (${placeholders})
          GROUP BY entity_type, entity_id ${having}
        `)
        .all(...tagIds) as { entity_type: EntityType; entity_id: string }[]

      const results: {
        type: EntityType; id: string; title: string
        updated_at: number; archived_at: number | null; is_pinned: number
      }[] = []
      for (const m of matches) {
        const table = tableFor(m.entity_type)
        const row = db
          .prepare(`SELECT id, title, updated_at, archived_at, is_pinned FROM ${table} WHERE id = ?`)
          .get(m.entity_id) as
          | { id: string; title: string; updated_at: number; archived_at: number | null; is_pinned: number }
          | undefined
        if (!row) continue
        if (row.archived_at && !includeArchived) continue
        results.push({ type: m.entity_type, ...row })
      }
      return results.sort((a, b) => b.updated_at - a.updated_at)
    }
  )

  // ─── Archive ───────────────────────────────────────────────────────────────

  ipcMain.handle('archive:set', (_, entityType: string, id: string, archived: boolean) => {
    const table = tableFor(entityType)
    const value = archived ? Date.now() : null
    // Deliberately does not touch updated_at, so archiving/restoring doesn't reorder the list
    getDb().prepare(`UPDATE ${table} SET archived_at = ? WHERE id = ?`).run(value, id)
    return { archivedAt: value }
  })

  // Archive every completed (all work items done), unpinned, unarchived note. Returns the count.
  ipcMain.handle('archive:archiveCompletedNotes', () => {
    const result = getDb()
      .prepare(`
        UPDATE notes SET archived_at = ?
        WHERE all_work_items_done = 1 AND is_pinned = 0 AND archived_at IS NULL
      `)
      .run(Date.now())
    return { count: result.changes }
  })
}
