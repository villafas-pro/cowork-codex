import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import { connectionForItem, fetchItem, listConnections, parseRef } from '../integrations'
import { fetchRecentComments, jqlQuote, searchKeysByJql } from '../integrations/jiraProvider'
import { classifyRivetComment, htmlToText, isRivetAuthor } from './rivet'
import { deriveStage, type PrEvidence, type Stage } from '../../shared/pipeline'

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_RIVET_AUTHOR = 'Rivet Factory Agent'
/** A Claude Code session with no activity for this long no longer counts as active */
const SESSION_ACTIVE_MS = 30 * 60 * 1000

function getSetting(key: string, fallback: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

export function rivetAuthor(): string {
  return getSetting('pipeline_rivet_author', DEFAULT_RIVET_AUTHOR)
}

// ─── Categories ───────────────────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  color: string
  sort_order: number
  muted: number
  is_default: number
}

export function listCategories(): Category[] {
  return getDb().prepare('SELECT * FROM pipeline_categories ORDER BY sort_order, name').all() as Category[]
}

function defaultCategoryId(): string {
  const row = getDb().prepare('SELECT id FROM pipeline_categories WHERE is_default = 1 LIMIT 1').get() as { id: string } | undefined
  if (row) return row.id
  // Should not happen, but never leave the board without a landing category
  const any = getDb().prepare('SELECT id FROM pipeline_categories ORDER BY sort_order LIMIT 1').get() as { id: string } | undefined
  if (any) {
    getDb().prepare('UPDATE pipeline_categories SET is_default = 1 WHERE id = ?').run(any.id)
    return any.id
  }
  getDb()
    .prepare("INSERT INTO pipeline_categories (id, name, color, sort_order, muted, is_default) VALUES ('inflight','In flight','blue',0,0,1)")
    .run()
  return 'inflight'
}

export function createCategory(name: string, color = 'gray'): Category | null {
  const clean = name.trim().slice(0, 40)
  if (!clean) return null
  const db = getDb()
  const dup = db.prepare('SELECT 1 FROM pipeline_categories WHERE lower(name) = lower(?)').get(clean)
  if (dup) return null
  const order = ((db.prepare('SELECT MAX(sort_order) AS m FROM pipeline_categories').get() as { m: number | null }).m ?? -1) + 1
  const id = uuidv4()
  db.prepare('INSERT INTO pipeline_categories (id, name, color, sort_order, muted, is_default) VALUES (?, ?, ?, ?, 0, 0)').run(id, clean, color, order)
  return db.prepare('SELECT * FROM pipeline_categories WHERE id = ?').get(id) as Category
}

export function updateCategory(id: string, patch: { name?: string; color?: string; muted?: boolean }): boolean {
  const db = getDb()
  const cur = db.prepare('SELECT * FROM pipeline_categories WHERE id = ?').get(id) as Category | undefined
  if (!cur) return false
  const name = patch.name !== undefined ? patch.name.trim().slice(0, 40) : cur.name
  if (!name) return false
  const clash = db.prepare('SELECT 1 FROM pipeline_categories WHERE lower(name) = lower(?) AND id != ?').get(name, id)
  if (clash) return false
  db.prepare('UPDATE pipeline_categories SET name = ?, color = ?, muted = ? WHERE id = ?').run(
    name,
    patch.color ?? cur.color,
    patch.muted === undefined ? cur.muted : patch.muted ? 1 : 0,
    id
  )
  return true
}

/** Cards in a deleted category move to the default one. The default category cannot be deleted. */
export function deleteCategory(id: string): boolean {
  const db = getDb()
  const cur = db.prepare('SELECT is_default FROM pipeline_categories WHERE id = ?').get(id) as { is_default: number } | undefined
  if (!cur || cur.is_default) return false
  const target = defaultCategoryId()
  db.transaction(() => {
    const max = ((db.prepare('SELECT MAX(position) AS m FROM pipeline_items WHERE category_id = ?').get(target) as { m: number | null }).m ?? -1)
    const moving = db.prepare('SELECT item_key FROM pipeline_items WHERE category_id = ? ORDER BY position').all(id) as { item_key: string }[]
    moving.forEach((r, i) =>
      db.prepare('UPDATE pipeline_items SET category_id = ?, position = ? WHERE item_key = ?').run(target, max + 1 + i, r.item_key)
    )
    db.prepare('DELETE FROM pipeline_categories WHERE id = ?').run(id)
  })()
  return true
}

export function reorderCategories(ids: string[]): void {
  const db = getDb()
  const upd = db.prepare('UPDATE pipeline_categories SET sort_order = ? WHERE id = ?')
  db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))()
}

// ─── Tracked items ────────────────────────────────────────────────────────────

export type AddedVia = 'manual' | 'rivet' | 'session'

export async function addItem(
  ref: string,
  opts: { categoryId?: string; via?: AddedVia } = {}
): Promise<{ success: true; key: string } | { success: false; error: string }> {
  const text = ref.trim()
  const parsed = parseRef(text)
  const key = parsed?.provider === 'jira' ? parsed.itemNumber : /^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(text) ? text.toUpperCase() : ''
  if (!key) return { success: false, error: 'Enter a Jira ticket key like OB-123 or paste its link.' }

  const item = await fetchItem(key, true)
  if (!item) return { success: false, error: `Could not load ${key}. Check your Jira connection.` }

  const db = getDb()
  const category = opts.categoryId && db.prepare('SELECT 1 FROM pipeline_categories WHERE id = ?').get(opts.categoryId)
    ? opts.categoryId
    : defaultCategoryId()
  const existing = db.prepare('SELECT item_key FROM pipeline_items WHERE item_key = ?').get(key)
  if (existing) {
    // Re-adding a dismissed ticket brings it back where it was
    db.prepare('UPDATE pipeline_items SET dismissed_at = NULL WHERE item_key = ?').run(key)
  } else {
    const pos = ((db.prepare('SELECT MAX(position) AS m FROM pipeline_items WHERE category_id = ?').get(category) as { m: number | null }).m ?? -1) + 1
    db.prepare('INSERT INTO pipeline_items (item_key, category_id, position, added_at, added_via) VALUES (?, ?, ?, ?, ?)').run(
      key, category, pos, Date.now(), opts.via ?? 'manual'
    )
  }
  await syncItem(key).catch((e) => console.error('[pipeline] sync after add failed:', e instanceof Error ? e.message : e))
  return { success: true, key }
}

export function removeItem(key: string): void {
  getDb().prepare('UPDATE pipeline_items SET dismissed_at = ? WHERE item_key = ?').run(Date.now(), key)
}

/** Put a card at `index` within a category, renumbering that category's cards. */
export function moveItem(key: string, categoryId: string, index: number): boolean {
  const db = getDb()
  if (!db.prepare('SELECT 1 FROM pipeline_items WHERE item_key = ?').get(key)) return false
  if (!db.prepare('SELECT 1 FROM pipeline_categories WHERE id = ?').get(categoryId)) return false
  db.transaction(() => {
    const others = (db
      .prepare('SELECT item_key FROM pipeline_items WHERE category_id = ? AND item_key != ? AND dismissed_at IS NULL ORDER BY position')
      .all(categoryId, key) as { item_key: string }[]).map((r) => r.item_key)
    const at = Math.max(0, Math.min(index, others.length))
    others.splice(at, 0, key)
    const upd = db.prepare('UPDATE pipeline_items SET category_id = ?, position = ? WHERE item_key = ?')
    others.forEach((k, i) => upd.run(categoryId, i, k))
  })()
  return true
}

// ─── Events ───────────────────────────────────────────────────────────────────

export function recordEvent(
  key: string,
  source: 'rivet' | 'github' | 'claude',
  type: string,
  at: number,
  data: Record<string, unknown>,
  extId: string | null
): boolean {
  const res = getDb()
    .prepare('INSERT OR IGNORE INTO pipeline_events (item_key, source, type, at, data, ext_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(key, source, type, at, JSON.stringify(data), extId)
  return res.changes > 0
}

interface EventRow { source: string; type: string; at: number; data: string }

function parse<T>(json: string): T {
  try { return JSON.parse(json) as T } catch { return {} as T }
}

// ─── Sync with Jira ───────────────────────────────────────────────────────────

/** Refresh one ticket: its Jira state and Rivet's comments. */
export async function syncItem(key: string): Promise<void> {
  await fetchItem(key, true)
  const conn = connectionForItem(key, 'jira')
  if (!conn || !conn.secret) return
  const comments = await fetchRecentComments(conn, key)
  const author = rivetAuthor()
  for (const c of comments) {
    if (!isRivetAuthor(c.author, author)) continue
    const ev = classifyRivetComment(htmlToText(c.html))
    if (!ev) continue
    recordEvent(key, 'rivet', ev.kind, c.created, ev as unknown as Record<string, unknown>, `jira-comment-${c.id}`)
  }
}

let syncing = false

/** Sync every tracked ticket that is not finished, a few at a time. Safe to call repeatedly. */
export async function syncAllItems(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 }
  syncing = true
  let synced = 0
  let failed = 0
  try {
    if (!listConnections().some((c) => c.provider === 'jira' && c.secret)) return { synced, failed }
    const db = getDb()
    const keys = (db.prepare('SELECT item_key FROM pipeline_items WHERE dismissed_at IS NULL').all() as { item_key: string }[]).map((r) => r.item_key)
    // Finished tickets stop being polled; they refresh when opened or re-added
    const live = keys.filter((k) => !isFinished(k))
    const queue = [...live]
    const worker = async (): Promise<void> => {
      for (let k = queue.shift(); k; k = queue.shift()) {
        try { await syncItem(k); synced++ } catch (e) {
          failed++
          console.error(`[pipeline] sync ${k} failed:`, e instanceof Error ? e.message : e)
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
  } finally {
    syncing = false
  }
  return { synced, failed }
}

function isFinished(key: string): boolean {
  const row = getDb().prepare('SELECT state_category FROM cached_work_items WHERE id = ?').get(key) as { state_category: string } | undefined
  return row?.state_category === 'done'
}

/**
 * Tickets assigned to you where Rivet has started work, that are not on the board yet and not
 * dismissed. Added automatically (category: default), so dispatching to Rivet puts it on the board.
 */
export async function autoAddRivetTickets(): Promise<string[]> {
  const conn = listConnections().find((c) => c.provider === 'jira' && c.secret)
  if (!conn) return []
  const jql =
    `assignee = currentUser() AND statusCategory != Done AND comment ~ ${jqlQuote('"Rivet started on this ticket"')} ` +
    'AND updated >= -14d ORDER BY updated DESC'
  const keys = await searchKeysByJql(conn, jql)
  const db = getDb()
  const added: string[] = []
  for (const key of keys) {
    if (db.prepare('SELECT 1 FROM pipeline_items WHERE item_key = ?').get(key)) continue // tracked or dismissed
    const r = await addItem(key, { via: 'rivet' })
    if (r.success) added.push(key)
  }
  return added
}

/** Tickets assigned to you that are not on the board, for the "add" tray. */
export async function assignedSuggestions(): Promise<{ key: string; title: string; state: string; url: string }[]> {
  const conn = listConnections().find((c) => c.provider === 'jira' && c.secret)
  if (!conn) return []
  const keys = await searchKeysByJql(conn, 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC', 50)
  const db = getDb()
  const fresh = keys.filter((k) => !db.prepare('SELECT 1 FROM pipeline_items WHERE item_key = ? AND dismissed_at IS NULL').get(k))
  const out: { key: string; title: string; state: string; url: string }[] = []
  for (const key of fresh.slice(0, 30)) {
    const row = db.prepare('SELECT title, state, ado_url FROM cached_work_items WHERE id = ?').get(key) as
      | { title: string; state: string; ado_url: string } | undefined
    if (row) out.push({ key, title: row.title, state: row.state, url: row.ado_url })
    else {
      const item = await fetchItem(key)
      if (item) out.push({ key, title: item.title, state: item.state, url: item.url })
    }
  }
  return out
}

// ─── Board ────────────────────────────────────────────────────────────────────

export interface BoardItem {
  item_key: string
  category_id: string
  position: number
  added_via: AddedVia
  added_at: number
  title: string
  type: string
  jira_state: string
  state_category: string
  url: string
  priority: number | null
  stage: Stage
  stage_since: number
  local_active: boolean
  attention: 'pr_closed' | null
  pr_url: string | null
  pr: PrEvidence | null
  run_url: string | null
  session: { session_id: string; cwd: string; branch: string } | null
  links: { entity_type: string; entity_id: string; title: string }[]
}

export function getBoard(now = Date.now()): { categories: Category[]; items: BoardItem[]; stageCounts: Record<Stage, number> } {
  const db = getDb()
  const categories = listCategories()
  const rows = db.prepare(`
    SELECT p.item_key, p.category_id, p.position, p.added_via, p.added_at,
           c.title, c.type, c.state, c.state_category, c.ado_url, c.priority
    FROM pipeline_items p
    LEFT JOIN cached_work_items c ON c.id = p.item_key
    WHERE p.dismissed_at IS NULL
    ORDER BY p.position
  `).all() as {
    item_key: string; category_id: string; position: number; added_via: AddedVia; added_at: number
    title: string | null; type: string | null; state: string | null; state_category: string | null
    ado_url: string | null; priority: number | null
  }[]

  const stageCounts: Record<Stage, number> = { assigned: 0, local: 0, rivet: 0, pr_ready: 0, review: 0, merged: 0 }
  const evStmt = db.prepare('SELECT source, type, at, data FROM pipeline_events WHERE item_key = ? ORDER BY at, id')
  const linkStmt = db.prepare(`
    SELECT l.entity_type, l.entity_id,
      CASE l.entity_type
        WHEN 'note' THEN (SELECT title FROM notes WHERE id = l.entity_id)
        WHEN 'code' THEN (SELECT title FROM code_blocks WHERE id = l.entity_id)
        WHEN 'flow' THEN (SELECT title FROM flows WHERE id = l.entity_id)
      END AS title
    FROM work_item_links l JOIN work_items w ON w.id = l.work_item_id
    WHERE w.item_number = ? AND w.provider = 'jira'
  `)

  const items: BoardItem[] = rows.map((r) => {
    const events = evStmt.all(r.item_key) as EventRow[]
    let dispatchedAt: number | null = null
    let prOpenedAt: number | null = null
    let prUrl: string | null = null
    let runUrl: string | null = null
    let pr: PrEvidence | null = null
    let prAt = 0
    let sessionState: { at: number; type: string; data: { session_id?: string; cwd?: string; branch?: string } } | null = null
    let lastSessionStart = 0

    for (const e of events) {
      const data = parse<Record<string, any>>(e.data)
      if (e.source === 'rivet' && e.type === 'dispatched') {
        dispatchedAt = Math.max(dispatchedAt ?? 0, e.at)
        runUrl = data.runUrl ?? runUrl
      } else if (e.source === 'rivet' && e.type === 'pr_opened') {
        prOpenedAt = Math.max(prOpenedAt ?? 0, e.at)
        prUrl = data.prUrl ?? prUrl
        runUrl = data.runUrl ?? runUrl
      } else if (e.source === 'github' && e.type === 'pr_state') {
        pr = { state: data.state, draft: !!data.draft, review: data.review, commitsAfterReview: !!data.commitsAfterReview }
        prAt = e.at
        prUrl = data.url ?? prUrl
      } else if (e.source === 'claude') {
        sessionState = { at: e.at, type: e.type, data }
        if (e.type === 'session_start') lastSessionStart = e.at
      }
    }

    const localActive = !!sessionState && sessionState.type !== 'session_end' && now - sessionState.at < SESSION_ACTIVE_MS
    const jiraDone = r.state_category === 'done'
    const res = deriveStage({ jiraDone, localActive, rivetDispatchedAt: dispatchedAt, rivetPrOpenedAt: prOpenedAt, pr })

    const since =
      res.stage === 'merged' ? (prAt || r.added_at)
        : res.stage === 'review' ? (prAt || prOpenedAt || r.added_at)
          : res.stage === 'pr_ready' ? (prOpenedAt ?? (prAt || r.added_at))
            : res.stage === 'rivet' ? (dispatchedAt ?? r.added_at)
              : res.stage === 'local' ? (lastSessionStart || r.added_at)
                : r.added_at
    stageCounts[res.stage]++

    return {
      item_key: r.item_key,
      category_id: categories.some((c) => c.id === r.category_id) ? r.category_id : defaultCategoryId(),
      position: r.position,
      added_via: r.added_via,
      added_at: r.added_at,
      title: r.title ?? r.item_key,
      type: r.type ?? '',
      jira_state: r.state ?? '',
      state_category: r.state_category ?? '',
      url: r.ado_url ?? '',
      priority: r.priority,
      stage: res.stage,
      stage_since: since,
      local_active: res.localActive,
      attention: res.attention,
      pr_url: prUrl,
      pr,
      run_url: runUrl,
      session: localActive && sessionState && sessionState.data.session_id
        ? { session_id: sessionState.data.session_id, cwd: sessionState.data.cwd ?? '', branch: sessionState.data.branch ?? '' }
        : null,
      links: (linkStmt.all(r.item_key) as { entity_type: string; entity_id: string; title: string | null }[])
        .map((l) => ({ ...l, title: l.title ?? 'Untitled' }))
    }
  })

  return { categories, items, stageCounts }
}
