import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db'
import { recomputeForWorkItem } from '../workItemState'
import { decryptSecret, encryptSecret } from './secrets'
import { adoProvider } from './adoProvider'
import { jiraProvider } from './jiraProvider'
import type {
  Connection, NormalizedItem, ParsedRef, Provider, ProviderId, SearchFilters, SearchResult
} from './types'

export * from './types'

const providers: Record<ProviderId, Provider> = { ado: adoProvider, jira: jiraProvider }
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// ─── Connections ──────────────────────────────────────────────────────────────

interface ConnectionRow {
  id: string
  provider: ProviderId
  name: string
  base_url: string
  project: string
  email: string
  secret: string
  created_at: number
}

function toConnection(row: ConnectionRow): Connection {
  return { ...row, secret: decryptSecret(row.secret) }
}

/** Connections with decrypted tokens. Main process only. */
export function listConnections(): Connection[] {
  const rows = getDb().prepare('SELECT * FROM connections ORDER BY created_at').all() as ConnectionRow[]
  return rows.map(toConnection)
}

export function getConnection(id: string): Connection | null {
  const row = getDb().prepare('SELECT * FROM connections WHERE id = ?').get(id) as ConnectionRow | undefined
  return row ? toConnection(row) : null
}

/** Safe-for-renderer view: never includes the token. */
export function listPublicConnections(): {
  id: string; provider: ProviderId; name: string; baseUrl: string
  project: string; email: string; hasSecret: boolean; secretUnreadable: boolean
}[] {
  const rows = getDb().prepare('SELECT * FROM connections ORDER BY created_at').all() as ConnectionRow[]
  return rows.map((r) => {
    const stored = !!r.secret
    const readable = stored && decryptSecret(r.secret) !== ''
    return {
      id: r.id,
      provider: r.provider,
      name: r.name,
      baseUrl: r.base_url,
      project: r.project,
      email: r.email,
      hasSecret: readable,
      // A token is stored but can't be decrypted, e.g. the database was opened on another PC
      secretUnreadable: stored && !readable
    }
  })
}

export interface ConnectionInput {
  id?: string
  provider: ProviderId
  name?: string
  baseUrl: string
  project?: string
  email?: string
  /** Omit or leave empty to keep the existing token when editing */
  secret?: string
}

/** Normalize what the user pasted into a clean base URL (and project, when it can be inferred). */
function normalizeInput(input: ConnectionInput): { baseUrl: string; project: string } | { error: string } {
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(input.baseUrl.trim()) ? input.baseUrl.trim() : `https://${input.baseUrl.trim()}`)
  } catch {
    return { error: 'Enter a valid URL.' }
  }
  let project = (input.project ?? '').trim()

  if (input.provider === 'jira') {
    // Accept any page on the site, e.g. a project list URL; keep only the origin
    if (!project) {
      const m = url.pathname.match(/\/projects\/([A-Za-z][A-Za-z0-9_]*)/)
      if (m) project = m[1].toUpperCase()
    }
    return { baseUrl: url.origin, project }
  }

  // Azure DevOps: https://dev.azure.com/Org[/Project]
  const parts = url.pathname.split('/').filter(Boolean)
  if (url.hostname.toLowerCase() === 'dev.azure.com') {
    if (parts.length === 0) return { error: 'Include the organization, e.g. https://dev.azure.com/your-org' }
    if (!project && parts[1]) {
      try { project = decodeURIComponent(parts[1]) } catch { project = parts[1] }
    }
    return { baseUrl: `${url.origin}/${parts[0]}`, project }
  }
  return { baseUrl: url.origin, project }
}

export function saveConnection(input: ConnectionInput): { success: true; id: string } | { success: false; error: string } {
  const db = getDb()
  const normalized = normalizeInput(input)
  if ('error' in normalized) return { success: false, error: normalized.error }

  if (input.provider === 'ado' && !normalized.project) {
    return { success: false, error: 'Azure DevOps needs a project name.' }
  }
  if (input.provider === 'jira' && !(input.email ?? '').trim()) {
    return { success: false, error: 'Jira needs your Atlassian account email.' }
  }

  const host = new URL(normalized.baseUrl).host
  const name = (input.name ?? '').trim() || `${input.provider === 'jira' ? 'Jira' : 'Azure DevOps'} (${host})`
  const email = (input.email ?? '').trim()
  const secret = (input.secret ?? '').trim()

  if (input.id) {
    const existing = db.prepare('SELECT id FROM connections WHERE id = ?').get(input.id)
    if (!existing) return { success: false, error: 'Connection not found.' }
    db.prepare(`
      UPDATE connections SET name = ?, base_url = ?, project = ?, email = ? WHERE id = ?
    `).run(name, normalized.baseUrl, normalized.project, email, input.id)
    if (secret) db.prepare('UPDATE connections SET secret = ? WHERE id = ?').run(encryptSecret(secret), input.id)
    return { success: true, id: input.id }
  }

  if (!secret) return { success: false, error: 'Enter an API token.' }
  const id = uuidv4()
  db.prepare(`
    INSERT INTO connections (id, provider, name, base_url, project, email, secret, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.provider, name, normalized.baseUrl, normalized.project, email, encryptSecret(secret), Date.now())
  return { success: true, id }
}

export function deleteConnection(id: string): void {
  getDb().prepare('DELETE FROM connections WHERE id = ?').run(id)
}

/**
 * One-time: older versions kept a single ADO config in the settings table (token in plain text).
 * Move it into a connection with an encrypted token and remove the plain-text keys.
 */
export function migrateLegacyAdoSettings(): void {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) AS n FROM connections').get() as { n: number }).n
  const get = (key: string): string =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? ''
  const orgUrl = get('ado_org_url')
  const project = get('ado_project')
  const pat = get('ado_pat')

  if (count === 0 && orgUrl && project && pat) {
    db.prepare(`
      INSERT INTO connections (id, provider, name, base_url, project, email, secret, created_at)
      VALUES (?, 'ado', ?, ?, ?, '', ?, ?)
    `).run(uuidv4(), `Azure DevOps (${project})`, orgUrl.replace(/\/$/, ''), project, encryptSecret(pat), Date.now())
  }
  if (orgUrl || project || pat) {
    // Only drop the plain-text keys once a connection exists to hold them
    const nowCount = (db.prepare('SELECT COUNT(*) AS n FROM connections').get() as { n: number }).n
    if (nowCount > 0) db.prepare("DELETE FROM settings WHERE key IN ('ado_org_url','ado_project','ado_pat')").run()
  }
}

// ─── Reference parsing and routing ────────────────────────────────────────────

/** ADO ids are numbers; Jira keys look like OB-123. */
export function providerOfItem(itemNumber: string): ProviderId | null {
  if (/^\d+$/.test(itemNumber)) return 'ado'
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(itemNumber)) return 'jira'
  return null
}

/** Recognize a pasted URL or key from any configured provider. */
export function parseRef(ref: string): ParsedRef | null {
  const conns = listConnections()
  for (const p of [adoProvider, jiraProvider]) {
    const parsed = p.parseRef(ref, conns)
    if (parsed) return parsed
  }
  return null
}

export function connectionForItem(itemNumber: string, provider: ProviderId): Connection | null {
  const db = getDb()
  const conns = listConnections().filter((c) => c.provider === provider)
  if (conns.length === 0) return null

  const cached = db
    .prepare('SELECT connection_id FROM cached_work_items WHERE id = ?')
    .get(itemNumber) as { connection_id: string } | undefined
  const byCache = cached && conns.find((c) => c.id === cached.connection_id)
  if (byCache) return byCache

  // Match on the host of the URL the item was linked with
  const wi = db
    .prepare('SELECT url FROM work_items WHERE item_number = ? AND provider = ? LIMIT 1')
    .get(itemNumber, provider) as { url: string } | undefined
  if (wi) {
    try {
      const host = new URL(wi.url).host.toLowerCase()
      const byHost = conns.find((c) => new URL(c.base_url).host.toLowerCase() === host)
      if (byHost) return byHost
    } catch { /* fall through */ }
  }
  return conns[0]
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function upsertCached(item: NormalizedItem): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO cached_work_items
      (id, title, type, state, assigned_to, created_by, description, acceptance_criteria,
       tags, iteration_path, area_path, priority, story_points, parent_id, comment_count,
       ado_url, created_at_ado, changed_at_ado, last_synced_at,
       provider, container, state_category, parent_key, connection_id)
    VALUES
      (@id, @title, @type, @state, @assigned_to, @created_by, @description, @acceptance_criteria,
       @tags, @iteration_path, @area_path, @priority, @story_points, @parent_id, @comment_count,
       @url, @created_at_ado, @changed_at_ado, @last_synced_at,
       @provider, @container, @state_category, @parent_key, @connection_id)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, type = excluded.type, state = excluded.state,
      assigned_to = excluded.assigned_to, created_by = excluded.created_by,
      description = excluded.description, acceptance_criteria = excluded.acceptance_criteria,
      tags = excluded.tags, iteration_path = excluded.iteration_path, area_path = excluded.area_path,
      priority = excluded.priority, story_points = excluded.story_points, parent_id = excluded.parent_id,
      comment_count = excluded.comment_count, ado_url = excluded.ado_url,
      created_at_ado = excluded.created_at_ado, changed_at_ado = excluded.changed_at_ado,
      last_synced_at = excluded.last_synced_at, provider = excluded.provider,
      container = excluded.container, state_category = excluded.state_category,
      parent_key = excluded.parent_key, connection_id = excluded.connection_id
  `).run(item)

  // Keep the linked work_items rows in step, and refresh "all done" on notes whose
  // linked item just changed state (previously only a manual toggle did this).
  const rows = db
    .prepare('SELECT id FROM work_items WHERE item_number = ? AND provider = ?')
    .all(item.id, item.provider) as { id: string }[]
  for (const r of rows) {
    db.prepare("UPDATE work_items SET container = ? WHERE id = ? AND container = ''").run(item.container, r.id)
    recomputeForWorkItem(db, r.id)
  }
}

type CachedRow = NormalizedItem & { ado_url: string }

/** Cached row as the renderer expects: includes `url`. */
function rowToItem(row: CachedRow): NormalizedItem {
  return { ...row, url: row.ado_url }
}

/** Fetch one item, using the cache unless it is stale or `force` is set. */
export async function fetchItem(itemNumber: string, force = false): Promise<NormalizedItem | null> {
  const db = getDb()
  const cachedRow = db.prepare('SELECT * FROM cached_work_items WHERE id = ?').get(itemNumber) as CachedRow | undefined
  const cached = cachedRow ? rowToItem(cachedRow) : null
  if (!force && cached && Date.now() - cached.last_synced_at < CACHE_TTL) return cached

  const providerId = providerOfItem(itemNumber)
  if (!providerId) return cached
  const conn = connectionForItem(itemNumber, providerId)
  if (!conn || !conn.secret) return cached // not configured: serve whatever we have

  try {
    const item = await providers[providerId].fetch(conn, itemNumber)
    if (!item) return cached
    upsertCached(item)
    return item
  } catch (e) {
    console.error(`[integrations] fetch ${itemNumber} failed:`, e instanceof Error ? e.message : e)
    return cached
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchAll(filters: SearchFilters): Promise<SearchResult[]> {
  const conns = listConnections().filter(
    (c) => c.secret && (!filters.connectionId || c.id === filters.connectionId)
  )
  if (conns.length === 0) return []

  const settled = await Promise.allSettled(conns.map((c) => providers[c.provider].search(c, filters)))
  const results: SearchResult[] = []
  const errors: string[] = []
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') results.push(...s.value)
    else errors.push(`${conns[i].name}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`)
  })
  // Partial failures still return what worked. Only throw if everything failed.
  if (results.length === 0 && errors.length === conns.length) throw new Error(errors.join(' | '))
  if (errors.length > 0) console.warn('[integrations] partial search failure:', errors.join(' | '))
  return results.slice(0, 50)
}

// ─── Status and background sync ───────────────────────────────────────────────

export async function checkAll(): Promise<{
  configured: boolean
  ok: boolean
  failures: { id: string; name: string; error: string }[]
}> {
  const conns = listConnections()
  if (conns.length === 0) return { configured: false, ok: true, failures: [] }
  const failures: { id: string; name: string; error: string }[] = []
  await Promise.all(
    conns.map(async (c) => {
      if (!c.secret) {
        failures.push({ id: c.id, name: c.name, error: 'Token missing. Re-enter it in Settings.' })
        return
      }
      const r = await providers[c.provider].test(c)
      if (!r.success) failures.push({ id: c.id, name: c.name, error: r.error ?? 'Connection failed' })
    })
  )
  return { configured: true, ok: failures.length === 0, failures }
}

export async function testConnection(id: string): Promise<{ success: boolean; error?: string; detail?: string }> {
  const conn = getConnection(id)
  if (!conn) return { success: false, error: 'Connection not found.' }
  if (!conn.secret) return { success: false, error: 'No readable token. Enter the token again and save.' }
  return providers[conn.provider].test(conn)
}

let syncing = false

/** Refresh every linked work item whose cache is stale. Safe to call repeatedly. */
export async function syncLinked(): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const db = getDb()
    const linked = db
      .prepare("SELECT DISTINCT item_number FROM work_items WHERE provider IN ('ado','jira')")
      .all() as { item_number: string }[]
    for (const { item_number } of linked) {
      const cached = db
        .prepare('SELECT last_synced_at FROM cached_work_items WHERE id = ?')
        .get(item_number) as { last_synced_at: number } | undefined
      if (cached && Date.now() - cached.last_synced_at < CACHE_TTL) continue
      await fetchItem(item_number, true)
    }
  } finally {
    syncing = false
  }
}
