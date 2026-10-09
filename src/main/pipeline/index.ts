import { v4 as uuidv4 } from 'uuid'
import { readFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getDb } from '../db'
import { connectionForItem, fetchItem, listConnections, parseRef, searchAll } from '../integrations'
import type { SearchResult } from '../integrations/types'
import { selectInbox } from './inbox'
import { fetchRecentComments, jqlQuote, searchKeysByJql } from '../integrations/jiraProvider'
import { decryptSecret, encryptSecret } from '../integrations/secrets'
import { classifyRivetComment, htmlToText, isRivetAuthor } from './rivet'
import { fetchPrEvidence, findPrByTicket, parsePullUrl, repoFromTags } from './github'
import { deriveStage, isStale, transitionAlert, type AlertState, type PrEvidence, type Stage } from '../../shared/pipeline'

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

// ─── GitHub token (encrypted, like the Jira token) ────────────────────────────

const GITHUB_TOKEN_KEY = 'pipeline_github_token'

export function githubToken(): string {
  const stored = getSetting(GITHUB_TOKEN_KEY, '')
  return stored ? decryptSecret(stored) : ''
}

export function githubTokenStatus(): { hasToken: boolean; unreadable: boolean } {
  const stored = getSetting(GITHUB_TOKEN_KEY, '')
  return { hasToken: !!stored && githubToken() !== '', unreadable: !!stored && githubToken() === '' }
}

export function setGithubToken(token: string): void {
  const db = getDb()
  const clean = token.trim()
  if (!clean) db.prepare('DELETE FROM settings WHERE key = ?').run(GITHUB_TOKEN_KEY)
  else db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(GITHUB_TOKEN_KEY, encryptSecret(clean))
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

/** Refresh one ticket: its Jira state, Rivet's comments, then the PR on GitHub. */
export async function syncItem(key: string): Promise<void> {
  await fetchItem(key, true)
  const conn = connectionForItem(key, 'jira')
  if (conn && conn.secret) {
    const comments = await fetchRecentComments(conn, key)
    const author = rivetAuthor()
    for (const c of comments) {
      if (!isRivetAuthor(c.author, author)) continue
      const ev = classifyRivetComment(htmlToText(c.html))
      if (!ev) continue
      recordEvent(key, 'rivet', ev.kind, c.created, ev as unknown as Record<string, unknown>, `jira-comment-${c.id}`)
    }
  }
  // A GitHub problem must not make the Jira side look broken, so it is reported separately
  try {
    await syncGithub(key)
  } catch (e) {
    lastGithubError = e instanceof Error ? e.message : String(e)
  }
}

/** Latest GitHub problem seen during the current sync (bad token, no access, rate limit). */
let lastGithubError: string | null = null

/**
 * Read the PR for a ticket. The PR is the one Rivet linked in its comment, one we found earlier,
 * or, failing that, one whose title mentions the ticket in the repo named by the ticket's
 * `repo:` label. A change is recorded only when something differs from what we last saw.
 */
async function syncGithub(key: string): Promise<void> {
  const token = githubToken()
  if (!token) return
  const db = getDb()
  const rows = db.prepare(`
    SELECT source, type, at, data FROM pipeline_events
    WHERE item_key = ? AND ((source = 'rivet' AND type = 'pr_opened') OR (source = 'github' AND type = 'pr_state'))
    ORDER BY at DESC, id DESC
  `).all(key) as EventRow[]

  let url: string | null = null
  let last: Record<string, any> | null = null
  for (const r of rows) {
    const d = parse<Record<string, any>>(r.data)
    if (r.source === 'github' && !last) last = d
    if (!url) url = (r.source === 'github' ? d.url : d.prUrl) ?? null
  }
  if (last?.state === 'merged') return // final

  if (!url) {
    const tags = (db.prepare('SELECT tags FROM cached_work_items WHERE id = ?').get(key) as { tags: string } | undefined)?.tags ?? ''
    const repo = repoFromTags(tags)
    if (repo) url = await findPrByTicket(token, repo, key)
  }
  const ref = url ? parsePullUrl(url) : null
  if (!ref) return

  const res = await fetchPrEvidence(token, ref)
  if (!res.ok) throw new Error(res.error)
  const changed = !last || last.state !== res.pr.state || !!last.draft !== res.pr.draft ||
    last.review !== res.pr.review || !!last.commitsAfterReview !== res.pr.commitsAfterReview || last.url !== res.url
  if (changed) {
    recordEvent(key, 'github', 'pr_state', Date.now(), { ...res.pr, url: res.url, number: ref.number, repo: `${ref.owner}/${ref.repo}` }, null)
  }
}

let syncing = false

/** Sync every tracked ticket that is not finished, a few at a time. Safe to call repeatedly. */
export async function syncAllItems(): Promise<{ synced: number; failed: number; githubError: string | null }> {
  if (syncing) return { synced: 0, failed: 0, githubError: null }
  syncing = true
  let synced = 0
  let failed = 0
  lastGithubError = null
  try {
    if (!listConnections().some((c) => c.provider === 'jira' && c.secret)) return { synced, failed, githubError: null }
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
  return { synced, failed, githubError: lastGithubError }
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

// ─── Inbox ────────────────────────────────────────────────────────────────────

export interface InboxItem {
  key: string
  title: string
  type: string
  state: string
  url: string
  project: string
  sprint: string
}

const INBOX_CACHE_MS = 60 * 1000
let inboxCache: { at: number; found: SearchResult[] } | null = null

/**
 * Tickets assigned to you that are not on the board and not hidden. One search, no per-ticket
 * lookups. Cached for a minute so repeated refreshes do not hammer Jira; `force` skips the cache.
 */
export async function getInbox(force = false): Promise<{ items: InboxItem[]; hiddenCount: number }> {
  const db = getDb()
  const hidden = new Set((db.prepare('SELECT item_key FROM pipeline_inbox_hidden').all() as { item_key: string }[]).map((r) => r.item_key))
  const tracked = new Set(
    (db.prepare('SELECT item_key FROM pipeline_items WHERE dismissed_at IS NULL').all() as { item_key: string }[]).map((r) => r.item_key)
  )

  if (force || !inboxCache || Date.now() - inboxCache.at > INBOX_CACHE_MS) {
    inboxCache = {
      at: Date.now(),
      found: await searchAll({ search: '', assignedToMe: true, type: '', state: '', excludeDone: true })
    }
  }

  const items: InboxItem[] = selectInbox(inboxCache.found, tracked, hidden).map((r) => ({
    key: r.id, title: r.title, type: r.type, state: r.state, url: r.url, project: r.container, sprint: r.iterationPath
  }))
  const hiddenCount = new Set(
    inboxCache.found.filter((r) => r.provider === 'jira' && hidden.has(r.id) && !tracked.has(r.id)).map((r) => r.id)
  ).size
  return { items, hiddenCount }
}

export function hideFromInbox(key: string): void {
  getDb().prepare('INSERT OR REPLACE INTO pipeline_inbox_hidden (item_key, hidden_at) VALUES (?, ?)').run(key, Date.now())
}

export function restoreInbox(): void {
  getDb().prepare('DELETE FROM pipeline_inbox_hidden').run()
}

// ─── Claude Code sessions ─────────────────────────────────────────────────────

const SESSION_EVENT_TYPES = new Set(['session_start', 'heartbeat', 'session_end'])
const TICKET_KEY = /^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/
/** Keys Jira did not recognise, so a stray "XY-12" in a prompt is not looked up on every heartbeat */
const unknownKeys = new Map<string, number>()
const UNKNOWN_KEY_MS = 60 * 60 * 1000

function sessionKey(sessionId: string): string | null {
  const row = getDb().prepare(`
    SELECT item_key FROM pipeline_events
    WHERE source = 'claude' AND json_extract(data, '$.session_id') = ?
    ORDER BY at DESC, id DESC LIMIT 1
  `).get(sessionId) as { item_key: string } | undefined
  return row?.item_key ?? null
}

/**
 * Read the small event files the Claude Code hook drops in `dir`, record them against their
 * tickets, and delete them. A ticket seen for the first time (and known to Jira) is added to the
 * board. Files that are malformed are discarded.
 */
export async function ingestSessionEvents(dir: string): Promise<{ processed: number; keys: string[] }> {
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  } catch {
    return { processed: 0, keys: [] }
  }
  const db = getDb()
  const touched = new Set<string>()
  let processed = 0

  for (const f of files) {
    const path = join(dir, f)
    let ev: any
    try {
      ev = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      rmSync(path, { force: true })
      continue
    }
    rmSync(path, { force: true })

    const sid = typeof ev?.session_id === 'string' ? ev.session_id : ''
    if (ev?.v !== 1 || !SESSION_EVENT_TYPES.has(ev.type) || typeof ev.at !== 'number' || !sid) continue
    const key: string | null = typeof ev.key === 'string' && TICKET_KEY.test(ev.key) ? ev.key : sessionKey(sid)
    if (!key) continue

    const row = db.prepare('SELECT dismissed_at FROM pipeline_items WHERE item_key = ?').get(key) as { dismissed_at: number | null } | undefined
    if (row?.dismissed_at) continue // removed from the board on purpose
    if (!row) {
      if (ev.type === 'session_end') continue
      const failedAt = unknownKeys.get(key)
      if (failedAt && Date.now() - failedAt < UNKNOWN_KEY_MS) continue
      const added = await addItem(key, { via: 'session' })
      if (!added.success) {
        unknownKeys.set(key, Date.now())
        continue
      }
    }

    // The first keyed event of a session we have not seen start counts as its start
    let type: string = ev.type
    if (type === 'heartbeat') {
      const seen = db.prepare(`
        SELECT 1 FROM pipeline_events WHERE source = 'claude' AND item_key = ? AND json_extract(data, '$.session_id') = ? LIMIT 1
      `).get(key, sid)
      if (!seen) type = 'session_start'
    }
    const data = { session_id: sid, cwd: String(ev.cwd ?? ''), branch: String(ev.branch ?? ''), event: String(ev.event ?? '') }
    if (recordEvent(key, 'claude', type, ev.at, data, `${sid}-${ev.type}-${ev.at}`)) {
      processed++
      touched.add(key)
    }
  }
  return { processed, keys: [...touched] }
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export interface PipelineAlert {
  key: string
  title: string
  message: string
}

/**
 * Compare every tracked ticket with what we last told the user, remember the new state, and
 * return what is worth a notification. Tickets in a muted category are remembered but never alert.
 * The first time a ticket is seen only records its state.
 */
export function detectAlerts(now = Date.now()): PipelineAlert[] {
  const board = getBoard(now)
  const muted = new Set(board.categories.filter((c) => c.muted).map((c) => c.id))
  const db = getDb()
  const read = db.prepare('SELECT last_stage, last_attention, last_stale FROM pipeline_items WHERE item_key = ?')
  const write = db.prepare('UPDATE pipeline_items SET last_stage = ?, last_attention = ?, last_stale = ? WHERE item_key = ?')
  const out: PipelineAlert[] = []

  for (const item of board.items) {
    const row = read.get(item.item_key) as { last_stage: string; last_attention: string; last_stale: number } | undefined
    if (!row) continue
    const prev: AlertState | null = row.last_stage
      ? { stage: row.last_stage as Stage, attention: row.last_attention === 'pr_closed' ? 'pr_closed' : null, stale: !!row.last_stale }
      : null
    const next: AlertState = { stage: item.stage, attention: item.attention, stale: item.stale }
    const message = transitionAlert(prev, next)
    write.run(next.stage, next.attention ?? '', next.stale ? 1 : 0, item.item_key)
    if (message && !muted.has(item.category_id)) out.push({ key: item.item_key, title: item.title, message })
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
  /** Waiting longer than expected for this stage. Never set for ticket in a muted category. */
  stale: boolean
  pr_url: string | null
  pr: PrEvidence | null
  run_url: string | null
  /** The session that is active right now, if any */
  session: { session_id: string; cwd: string; branch: string } | null
  /** The most recent session on this ticket, active or not, so it can be reopened */
  last_session: { session_id: string; cwd: string; branch: string; active: boolean } | null
  links: { entity_type: string; entity_id: string; title: string }[]
}

export function getBoard(now = Date.now()): { categories: Category[]; items: BoardItem[]; stageCounts: Record<Stage, number> } {
  const db = getDb()
  const categories = listCategories()
  const mutedIds = new Set(categories.filter((c) => c.muted).map((c) => c.id))
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

    const categoryId = categories.some((c) => c.id === r.category_id) ? r.category_id : defaultCategoryId()
    // Parked-style categories opt out of "waiting too long" warnings
    const stale = !mutedIds.has(categoryId) && isStale(res.stage, since, now)

    return {
      item_key: r.item_key,
      category_id: categoryId,
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
      stale,
      pr_url: prUrl,
      pr,
      run_url: runUrl,
      session: localActive && sessionState && sessionState.data.session_id
        ? { session_id: sessionState.data.session_id, cwd: sessionState.data.cwd ?? '', branch: sessionState.data.branch ?? '' }
        : null,
      last_session: sessionState && sessionState.data.session_id
        ? {
            session_id: sessionState.data.session_id,
            cwd: sessionState.data.cwd ?? '',
            branch: sessionState.data.branch ?? '',
            active: localActive
          }
        : null,
      links: (linkStmt.all(r.item_key) as { entity_type: string; entity_id: string; title: string | null }[])
        .map((l) => ({ ...l, title: l.title ?? 'Untitled' }))
    }
  })

  return { categories, items, stageCounts }
}
