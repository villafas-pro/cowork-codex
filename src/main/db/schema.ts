import type Database from 'better-sqlite3'

function addColumnIfMissing(db: Database.Database, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
}

/** ADO project name from a work item URL like https://dev.azure.com/org/PROJECT/_workitems/edit/1 */
function adoProjectFromUrl(url: string): string {
  const m = url.match(/\/([^/]+)\/_workitems\//i)
  if (!m) return ''
  try { return decodeURIComponent(m[1]) } catch { return m[1] }
}

/**
 * Work item integrations: ADO and Jira share one table layout.
 *  - work_items.provider: 'ado' | 'jira' | 'manual' (manual = a plain link with no integration)
 *  - container: the project the item belongs to (ADO project, Jira project key)
 *  - cached_work_items.state_category: 'todo' | 'in_progress' | 'done', so "done" no longer
 *    depends on ADO-specific state names
 * Safe to run on every startup.
 */
function migrateWorkItemIntegrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,          -- 'ado' | 'jira'
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,          -- https://dev.azure.com/org  or  https://site.atlassian.net
      project TEXT NOT NULL DEFAULT '',-- ADO project, or Jira project key(s), comma separated (optional)
      email TEXT NOT NULL DEFAULT '',  -- Jira account email
      secret TEXT NOT NULL DEFAULT '', -- encrypted token (see integrations/secrets.ts)
      created_at INTEGER NOT NULL
    );
  `)

  addColumnIfMissing(db, 'work_items', 'provider', "TEXT NOT NULL DEFAULT 'manual'")
  addColumnIfMissing(db, 'work_items', 'container', "TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing(db, 'cached_work_items', 'provider', "TEXT NOT NULL DEFAULT 'ado'")
  addColumnIfMissing(db, 'cached_work_items', 'container', "TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing(db, 'cached_work_items', 'state_category', "TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing(db, 'cached_work_items', 'parent_key', "TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing(db, 'cached_work_items', 'connection_id', "TEXT NOT NULL DEFAULT ''")

  // Existing rows with an ADO URL are ADO items
  db.exec(`
    UPDATE work_items SET provider = 'ado'
    WHERE provider = 'manual' AND (url LIKE '%dev.azure.com%' OR url LIKE '%visualstudio.com%');

    UPDATE cached_work_items SET state_category = CASE
      WHEN state IN ('Closed','Resolved','Done','Removed','Completed') THEN 'done'
      WHEN state IN ('New','To Do','Proposed','Approved','Open','Backlog') THEN 'todo'
      ELSE 'in_progress' END
    WHERE state_category = '';

    UPDATE cached_work_items SET parent_key = CAST(parent_id AS TEXT)
    WHERE parent_key = '' AND parent_id IS NOT NULL;
  `)

  // Fill in container (project) for existing ADO rows from their URLs
  const needContainer = db
    .prepare("SELECT id, url FROM work_items WHERE provider = 'ado' AND container = ''")
    .all() as { id: string; url: string }[]
  const setContainer = db.prepare('UPDATE work_items SET container = ? WHERE id = ?')
  for (const r of needContainer) {
    const project = adoProjectFromUrl(r.url)
    if (project) setContainer.run(project, r.id)
  }
  const needCachedContainer = db
    .prepare("SELECT id, ado_url FROM cached_work_items WHERE provider = 'ado' AND container = ''")
    .all() as { id: string; ado_url: string }[]
  const setCachedContainer = db.prepare('UPDATE cached_work_items SET container = ? WHERE id = ?')
  for (const r of needCachedContainer) {
    const project = adoProjectFromUrl(r.ado_url)
    if (project) setCachedContainer.run(project, r.id)
  }
}

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
      all_work_items_done INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT,
      password_salt TEXT
    );

    -- Tags (shared by notes, code blocks and flows; names are unique, case-insensitive)
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      color TEXT NOT NULL DEFAULT 'gray',
      created_at INTEGER NOT NULL
    );

    -- Tag assignments. entity_type is 'note' | 'code' | 'flow'
    CREATE TABLE IF NOT EXISTS item_tags (
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      PRIMARY KEY (tag_id, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_item_tags_entity ON item_tags(entity_type, entity_id);

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

  // Add new columns if they don't exist yet (safe to run on existing DBs)
  const noteColumns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[]
  if (!noteColumns.some((c) => c.name === 'is_locked')) {
    db.exec('ALTER TABLE notes ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0')
  }
  if (!noteColumns.some((c) => c.name === 'password_hash')) {
    db.exec('ALTER TABLE notes ADD COLUMN password_hash TEXT')
  }
  if (!noteColumns.some((c) => c.name === 'password_salt')) {
    db.exec('ALTER TABLE notes ADD COLUMN password_salt TEXT')
  }

  migrateWorkItemIntegrations(db)

  // Remove tag assignments automatically when the tagged item is deleted.
  // (Created after the main block because code_blocks and flows are defined there.)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_notes_delete_tags AFTER DELETE ON notes
      BEGIN DELETE FROM item_tags WHERE entity_type = 'note' AND entity_id = OLD.id; END;
    CREATE TRIGGER IF NOT EXISTS trg_code_delete_tags AFTER DELETE ON code_blocks
      BEGIN DELETE FROM item_tags WHERE entity_type = 'code' AND entity_id = OLD.id; END;
    CREATE TRIGGER IF NOT EXISTS trg_flows_delete_tags AFTER DELETE ON flows
      BEGIN DELETE FROM item_tags WHERE entity_type = 'flow' AND entity_id = OLD.id; END;
  `)

  // archived_at: NULL = active, otherwise the time the item was archived
  for (const table of ['notes', 'code_blocks', 'flows']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (!cols.some((c) => c.name === 'archived_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN archived_at INTEGER`)
    }
  }

  // One-time migration: an earlier build had folders. Convert each folder into a tag
  // (same name) assigned to the same items, then drop the folders table.
  const hasFolders = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'folders'")
    .get()
  if (hasFolders) {
    const kindTable: Record<string, { table: string; type: string }> = {
      note: { table: 'notes', type: 'note' },
      code: { table: 'code_blocks', type: 'code' },
      flow: { table: 'flows', type: 'flow' }
    }
    db.transaction(() => {
      const folders = db.prepare('SELECT id, kind, name FROM folders').all() as {
        id: string; kind: string; name: string
      }[]
      for (const f of folders) {
        let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(f.name) as { id: string } | undefined
        if (!tag) {
          tag = { id: `tag-${f.id}` }
          db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)')
            .run(tag.id, f.name, 'gray', Date.now())
        }
        const target = kindTable[f.kind]
        if (!target) continue
        const cols = db.prepare(`PRAGMA table_info(${target.table})`).all() as { name: string }[]
        if (!cols.some((c) => c.name === 'folder_id')) continue
        db.prepare(`
          INSERT OR IGNORE INTO item_tags (tag_id, entity_type, entity_id)
          SELECT ?, ?, id FROM ${target.table} WHERE folder_id = ?
        `).run(tag.id, target.type, f.id)
      }
      db.exec('DROP TABLE folders')
    })()
  }

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
