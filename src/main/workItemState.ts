import type Database from 'better-sqlite3'

/**
 * Recompute notes.all_work_items_done for one note.
 * A linked item counts as done when:
 *  - it comes from an integration (ADO/Jira) and its cached state category is 'done', or
 *  - it is a manual item the user ticked off.
 */
export function recomputeNoteDone(db: Database.Database, noteId: string): void {
  const items = db
    .prepare(`
      SELECT wi.is_done, wi.provider, cwi.state_category
      FROM work_items wi
      JOIN work_item_links wil ON wi.id = wil.work_item_id
      LEFT JOIN cached_work_items cwi ON cwi.id = wi.item_number
      WHERE wil.entity_type = 'note' AND wil.entity_id = ?
    `)
    .all(noteId) as { is_done: number; provider: string; state_category: string | null }[]

  const allDone =
    items.length > 0 &&
    items.every((i) => {
      if (i.provider !== 'manual' && i.state_category) return i.state_category === 'done'
      return i.is_done === 1
    })
  db.prepare('UPDATE notes SET all_work_items_done = ? WHERE id = ?').run(allDone ? 1 : 0, noteId)
}

/** Recompute every note linked to a work item row. */
export function recomputeForWorkItem(db: Database.Database, workItemId: string): void {
  const links = db
    .prepare("SELECT entity_id FROM work_item_links WHERE work_item_id = ? AND entity_type = 'note'")
    .all(workItemId) as { entity_id: string }[]
  for (const l of links) recomputeNoteDone(db, l.entity_id)
}
