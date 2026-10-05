import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import { fetchItem, parseRef } from '../integrations'
import { recomputeForWorkItem, recomputeNoteDone } from '../workItemState'

// Columns every work item query returns, so list pages and linked-item panels share one shape.
// is_tracked = the item comes from an integration (ADO/Jira), so its state is managed there.
const ITEM_COLUMNS = `
  wi.*,
  CASE WHEN wi.provider IN ('ado','jira') THEN 1 ELSE 0 END AS is_tracked,
  COALESCE(NULLIF(wi.container, ''), cwi.container, '') AS container,
  cwi.title          AS cached_title,
  cwi.type           AS cached_type,
  cwi.state          AS cached_state,
  cwi.state_category AS cached_state_category,
  cwi.assigned_to    AS cached_assigned_to
`

export function registerWorkItemHandlers(): void {
  // Get all work items that are linked to at least one entity (enriched with cached data)
  ipcMain.handle('workItems:getAll', () => {
    const db = getDb()
    return db.prepare(`
      SELECT ${ITEM_COLUMNS}
      FROM work_items wi
      LEFT JOIN cached_work_items cwi ON cwi.id = wi.item_number
      WHERE EXISTS (SELECT 1 FROM work_item_links wil WHERE wil.work_item_id = wi.id)
      ORDER BY wi.created_at DESC
    `).all()
  })

  // Get work items for an entity (enriched with cached data)
  ipcMain.handle('workItems:getForEntity', (_, entityType: string, entityId: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT ${ITEM_COLUMNS}, wil.id AS link_id
      FROM work_items wi
      JOIN work_item_links wil ON wi.id = wil.work_item_id
      LEFT JOIN cached_work_items cwi ON cwi.id = wi.item_number
      WHERE wil.entity_type = ? AND wil.entity_id = ?
      ORDER BY wi.created_at DESC
    `).all(entityType, entityId)
  })

  // Create a work item from a pasted URL or key and optionally link it to an entity.
  // Recognized ADO/Jira references are fetched immediately so the title shows right away.
  // Anything else is kept as a plain "manual" link the user ticks off themselves.
  ipcMain.handle('workItems:create', async (_, ref: string, entityType?: string, entityId?: string) => {
    const db = getDb()
    const now = Date.now()
    const input = (ref || '').trim()
    const parsed = parseRef(input)

    let id: string
    if (parsed) {
      const existing = db
        .prepare('SELECT id FROM work_items WHERE item_number = ? AND provider = ? LIMIT 1')
        .get(parsed.itemNumber, parsed.provider) as { id: string } | undefined
      id = existing?.id ?? uuidv4()
      if (!existing) {
        db.prepare(`
          INSERT INTO work_items (id, url, item_number, is_done, created_at, updated_at, provider, container)
          VALUES (?, ?, ?, 0, ?, ?, ?, ?)
        `).run(id, parsed.url, parsed.itemNumber, now, now, parsed.provider, parsed.container)
      }
    } else {
      // Plain link: item number is the last number in the URL (or the text itself)
      const match = input.match(/(\d+)[^/]*$/)
      const itemNumber = match ? match[1] : input
      const existing = db
        .prepare("SELECT id FROM work_items WHERE url = ? AND provider = 'manual' LIMIT 1")
        .get(input) as { id: string } | undefined
      id = existing?.id ?? uuidv4()
      if (!existing) {
        db.prepare(`
          INSERT INTO work_items (id, url, item_number, is_done, created_at, updated_at, provider, container)
          VALUES (?, ?, ?, 0, ?, ?, 'manual', '')
        `).run(id, input, itemNumber, now, now)
      }
    }

    // Link to entity if provided (skip if already linked)
    if (entityType && entityId) {
      const linkExists = db
        .prepare('SELECT id FROM work_item_links WHERE work_item_id = ? AND entity_type = ? AND entity_id = ?')
        .get(id, entityType, entityId)
      if (!linkExists) {
        db.prepare(`
          INSERT INTO work_item_links (id, work_item_id, entity_type, entity_id)
          VALUES (?, ?, ?, ?)
        `).run(uuidv4(), id, entityType, entityId)
      }
    }

    if (parsed) {
      await fetchItem(parsed.itemNumber, true).catch(() => null)
      recomputeForWorkItem(db, id)
    }

    return db.prepare('SELECT * FROM work_items WHERE id = ?').get(id)
  })

  // Link existing work item to entity
  ipcMain.handle('workItems:link', (_, workItemId: string, entityType: string, entityId: string) => {
    const db = getDb()
    const existing = db
      .prepare('SELECT id FROM work_item_links WHERE work_item_id = ? AND entity_type = ? AND entity_id = ?')
      .get(workItemId, entityType, entityId)
    if (existing) return { success: true }

    db.prepare(`
      INSERT INTO work_item_links (id, work_item_id, entity_type, entity_id)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), workItemId, entityType, entityId)
    recomputeForWorkItem(db, workItemId)
    return { success: true }
  })

  // Unlink work item from entity
  ipcMain.handle('workItems:unlink', (_, workItemId: string, entityType: string, entityId: string) => {
    const db = getDb()
    db.prepare('DELETE FROM work_item_links WHERE work_item_id = ? AND entity_type = ? AND entity_id = ?')
      .run(workItemId, entityType, entityId)
    // The note's "all done" status may change now that this item is gone
    if (entityType === 'note') recomputeNoteDone(db, entityId)
    return { success: true }
  })

  // Toggle done (manual items only; integration items follow their source state)
  ipcMain.handle('workItems:toggleDone', (_, id: string) => {
    const db = getDb()
    const item = db.prepare('SELECT is_done FROM work_items WHERE id = ?').get(id) as { is_done: number }
    const newVal = item.is_done ? 0 : 1
    db.prepare('UPDATE work_items SET is_done = ?, updated_at = ? WHERE id = ?').run(newVal, Date.now(), id)
    recomputeForWorkItem(db, id)
    return { isDone: newVal }
  })

  // Delete work item
  ipcMain.handle('workItems:delete', (_, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM work_items WHERE id = ?').run(id)
    return { success: true }
  })

  // Get all links for a work item
  ipcMain.handle('workItems:getLinks', (_, id: string) => {
    const db = getDb()
    return db.prepare('SELECT * FROM work_item_links WHERE work_item_id = ?').all(id)
  })

  // Find a work item row by item_number (prefers integration-backed rows)
  ipcMain.handle('workItems:findByItemNumber', (_, itemNumber: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM work_items WHERE item_number = ?
      ORDER BY CASE WHEN provider IN ('ado','jira') THEN 0 ELSE 1 END LIMIT 1
    `).get(itemNumber) || null
  })

  // Get linked entities (notes/code/flows) for a work item by item_number.
  // Silently prunes any links whose target entity has been deleted.
  ipcMain.handle('workItems:getLinkedEntities', (_, itemNumber: string) => {
    const db = getDb()
    const items = db.prepare('SELECT id FROM work_items WHERE item_number = ?').all(itemNumber) as { id: string }[]
    if (items.length === 0) return []

    const results: { entityType: string; entityId: string; title: string; archived: boolean }[] = []
    for (const wi of items) {
      const links = db.prepare('SELECT id, entity_type, entity_id FROM work_item_links WHERE work_item_id = ?').all(wi.id) as { id: string; entity_type: string; entity_id: string }[]
      for (const link of links) {
        const table =
          link.entity_type === 'note' ? 'notes'
          : link.entity_type === 'code' ? 'code_blocks'
          : link.entity_type === 'flow' ? 'flows'
          : null
        const row = table
          ? (db.prepare(`SELECT title, archived_at FROM ${table} WHERE id = ?`).get(link.entity_id) as
              | { title: string; archived_at: number | null } | undefined)
          : undefined

        if (!row) {
          // Entity was deleted: remove the stale link
          db.prepare('DELETE FROM work_item_links WHERE id = ?').run(link.id)
          continue
        }

        results.push({
          entityType: link.entity_type,
          entityId: link.entity_id,
          title: row.title || 'Untitled',
          archived: !!row.archived_at
        })
      }
    }
    return results
  })
}
