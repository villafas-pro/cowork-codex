import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import type { WorkItem } from '@shared/types'

export function registerWorkItemHandlers(): void {
  // Get all work items that are linked to at least one entity (enriched with cached ADO data)
  ipcMain.handle('workItems:getAll', () => {
    const db = getDb()
    return db.prepare(`
      SELECT
        wi.*,
        CASE WHEN wi.url LIKE '%dev.azure.com%' THEN 1 ELSE 0 END as is_ado,
        cwi.title  as cached_title,
        cwi.type   as cached_type,
        cwi.state  as cached_state,
        cwi.assigned_to as cached_assigned_to
      FROM work_items wi
      LEFT JOIN cached_work_items cwi ON cwi.id = wi.item_number
      WHERE EXISTS (SELECT 1 FROM work_item_links wil WHERE wil.work_item_id = wi.id)
      ORDER BY wi.created_at DESC
    `).all()
  })

  // Get work items for an entity (enriched with cached ADO data)
  ipcMain.handle('workItems:getForEntity', (_, entityType: string, entityId: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT
        wi.*,
        wil.id as link_id,
        CASE WHEN wi.url LIKE '%dev.azure.com%' THEN 1 ELSE 0 END as is_ado,
        cwi.title  as cached_title,
        cwi.type   as cached_type,
        cwi.state  as cached_state,
        cwi.assigned_to as cached_assigned_to
      FROM work_items wi
      JOIN work_item_links wil ON wi.id = wil.work_item_id
      LEFT JOIN cached_work_items cwi ON cwi.id = wi.item_number
      WHERE wil.entity_type = ? AND wil.entity_id = ?
      ORDER BY wi.created_at DESC
    `).all(entityType, entityId)
  })

  // Create work item
  ipcMain.handle('workItems:create', (_, url: string, entityType?: string, entityId?: string) => {
    const db = getDb()
    const id = uuidv4()
    const now = Date.now()

    // Extract item number from URL (last numeric segment)
    const match = url.match(/(\d+)[^/]*$/)
    const itemNumber = match ? match[1] : url

    db.prepare(`
      INSERT INTO work_items (id, url, item_number, is_done, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(id, url, itemNumber, now, now)

    // Link to entity if provided
    if (entityType && entityId) {
      db.prepare(`
        INSERT INTO work_item_links (id, work_item_id, entity_type, entity_id)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), id, entityType, entityId)
    }

    return db.prepare('SELECT * FROM work_items WHERE id = ?').get(id)
  })

  // Link existing work item to entity
  ipcMain.handle('workItems:link', (_, workItemId: string, entityType: string, entityId: string) => {
    const db = getDb()
    // Check if link already exists
    const existing = db
      .prepare('SELECT id FROM work_item_links WHERE work_item_id = ? AND entity_type = ? AND entity_id = ?')
      .get(workItemId, entityType, entityId)
    if (existing) return { success: true }

    db.prepare(`
      INSERT INTO work_item_links (id, work_item_id, entity_type, entity_id)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), workItemId, entityType, entityId)
    return { success: true }
  })

  // Unlink work item from entity
  ipcMain.handle('workItems:unlink', (_, workItemId: string, entityType: string, entityId: string) => {
    const db = getDb()
    db.prepare('DELETE FROM work_item_links WHERE work_item_id = ? AND entity_type = ? AND entity_id = ?')
      .run(workItemId, entityType, entityId)
    return { success: true }
  })

  // Toggle done
  ipcMain.handle('workItems:toggleDone', (_, id: string) => {
    const db = getDb()
    const item = db.prepare('SELECT is_done FROM work_items WHERE id = ?').get(id) as { is_done: number }
    const newVal = item.is_done ? 0 : 1
    db.prepare('UPDATE work_items SET is_done = ?, updated_at = ? WHERE id = ?').run(newVal, Date.now(), id)

    // Update all_work_items_done for linked notes
    updateNoteWorkItemStatus(db, id)

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

  // Get linked entities (notes/code/flows) for a work item by item_number
  ipcMain.handle('workItems:getLinkedEntities', (_, itemNumber: string) => {
    const db = getDb()
    // Find the work_item id(s) for this item_number
    const items = db.prepare('SELECT id FROM work_items WHERE item_number = ?').all(itemNumber) as { id: string }[]
    if (items.length === 0) return []

    const results: { entityType: string; entityId: string; title: string }[] = []
    for (const wi of items) {
      const links = db.prepare('SELECT entity_type, entity_id FROM work_item_links WHERE work_item_id = ?').all(wi.id) as { entity_type: string; entity_id: string }[]
      for (const link of links) {
        let title = ''
        if (link.entity_type === 'note') {
          const row = db.prepare('SELECT title FROM notes WHERE id = ?').get(link.entity_id) as { title: string } | undefined
          title = row?.title || 'Untitled'
        } else if (link.entity_type === 'code') {
          const row = db.prepare('SELECT title FROM code_blocks WHERE id = ?').get(link.entity_id) as { title: string } | undefined
          title = row?.title || 'Untitled'
        } else if (link.entity_type === 'flow') {
          const row = db.prepare('SELECT title FROM flows WHERE id = ?').get(link.entity_id) as { title: string } | undefined
          title = row?.title || 'Untitled'
        }
        results.push({ entityType: link.entity_type, entityId: link.entity_id, title })
      }
    }
    return results
  })
}

function updateNoteWorkItemStatus(db: any, workItemId: string): void {
  // Get all notes linked to this work item
  const noteLinks = db
    .prepare("SELECT entity_id FROM work_item_links WHERE work_item_id = ? AND entity_type = 'note'")
    .all(workItemId) as { entity_id: string }[]

  for (const link of noteLinks) {
    const noteId = link.entity_id
    const items = db
      .prepare(`
        SELECT wi.is_done FROM work_items wi
        JOIN work_item_links wil ON wi.id = wil.work_item_id
        WHERE wil.entity_type = 'note' AND wil.entity_id = ?
      `)
      .all(noteId) as { is_done: number }[]

    const allDone = items.length > 0 && items.every((i) => i.is_done === 1)
    db.prepare('UPDATE notes SET all_work_items_done = ? WHERE id = ?').run(allDone ? 1 : 0, noteId)
  }
}
