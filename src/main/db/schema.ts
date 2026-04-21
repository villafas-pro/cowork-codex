import type Database from 'better-sqlite3'

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Notes
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      all_work_items_done INTEGER NOT NULL DEFAULT 0
    );

    -- Work Items (global)
    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      item_number TEXT NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Work Item Links (note, code, flow)
    CREATE TABLE IF NOT EXISTS work_item_links (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL
    );

    -- Sync Groups (for synced code blocks)
    CREATE TABLE IF NOT EXISTS sync_groups (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );

    -- Code Blocks
    CREATE TABLE IF NOT EXISTS code_blocks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      language TEXT NOT NULL DEFAULT 'plaintext',
      content TEXT NOT NULL DEFAULT '',
      note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
      sync_group_id TEXT REFERENCES sync_groups(id) ON DELETE SET NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Flows
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
      note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Note Sections (ordered sections within a note)
    CREATE TABLE IF NOT EXISTS note_sections (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      section_order INTEGER NOT NULL DEFAULT 0
    );

    -- Images
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Templates
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    -- Note Version History
    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Open Tabs (persisted)
    CREATE TABLE IF NOT EXISTS open_tabs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      tab_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0
    );

    -- Navigation History
    CREATE TABLE IF NOT EXISTS nav_history (
      id TEXT PRIMARY KEY,
      entity_type TEXT,
      entity_id TEXT,
      section TEXT,
      visited_at INTEGER NOT NULL
    );

    -- To Do Content (single persistent scratch pad)
    CREATE TABLE IF NOT EXISTS todo_content (
      id INTEGER PRIMARY KEY DEFAULT 1,
      content TEXT NOT NULL DEFAULT '{}'
    );

    -- App Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Cached ADO Work Items (local read-only mirror)
    CREATE TABLE IF NOT EXISTS cached_work_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      assigned_to TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      acceptance_criteria TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      iteration_path TEXT NOT NULL DEFAULT '',
      area_path TEXT NOT NULL DEFAULT '',
      priority INTEGER,
      story_points REAL,
      parent_id INTEGER,
      comment_count INTEGER NOT NULL DEFAULT 0,
      ado_url TEXT NOT NULL DEFAULT '',
      created_at_ado TEXT NOT NULL DEFAULT '',
      changed_at_ado TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0
    );

    -- Full Text Search virtual table for notes
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED,
      title,
      content,
      content='notes',
      content_rowid='rowid'
    );

    -- Seed todo_content if empty
    INSERT OR IGNORE INTO todo_content (id, content) VALUES (1, '{}');
  `)

  // Backfill FTS index for any notes not yet indexed
  db.prepare(`
    INSERT OR IGNORE INTO notes_fts(id, title, content)
    SELECT id, title, content FROM notes
    WHERE id NOT IN (SELECT id FROM notes_fts)
  `).run()

  // Prune links whose target entity no longer exists
  db.prepare(`
    DELETE FROM work_item_links
    WHERE (entity_type = 'note' AND entity_id NOT IN (SELECT id FROM notes))
       OR (entity_type = 'code' AND entity_id NOT IN (SELECT id FROM code_blocks))
       OR (entity_type = 'flow' AND entity_id NOT IN (SELECT id FROM flows))
  `).run()

  // One-time dedup: for each item_number with multiple rows, keep the oldest,
  // re-point all links to it, then delete the extras.
  const dupes = db.prepare(`
    SELECT item_number
    FROM work_items
    GROUP BY item_number
    HAVING COUNT(*) > 1
  `).all() as { item_number: string }[]

  for (const { item_number } of dupes) {
    const rows = db.prepare(
      'SELECT id FROM work_items WHERE item_number = ? ORDER BY created_at ASC'
    ).all(item_number) as { id: string }[]

    const [keep, ...remove] = rows
    for (const dup of remove) {
      // Move links that don't already exist on the keeper
      const links = db.prepare('SELECT * FROM work_item_links WHERE work_item_id = ?').all(dup.id) as any[]
      for (const link of links) {
        const exists = db.prepare(
          'SELECT id FROM work_item_links WHERE work_item_id = ? AND entity_type = ? AND entity_id = ?'
        ).get(keep.id, link.entity_type, link.entity_id)
        if (!exists) {
          db.prepare('UPDATE work_item_links SET work_item_id = ? WHERE id = ?').run(keep.id, link.id)
        }
      }
      db.prepare('DELETE FROM work_items WHERE id = ?').run(dup.id)
    }
  }
}
