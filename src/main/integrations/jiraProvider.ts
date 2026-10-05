import { cleanHtml } from './html'
import type {
  Connection, NormalizedItem, ParsedRef, Provider, SearchFilters, SearchResult, StateCategory, TestResult
} from './types'

// Jira Cloud REST API v3. Auth is the account email plus an API token (basic auth).
// Create a token at https://id.atlassian.com/manage-profile/security/api-tokens

const KEY_PATTERN = /\b([A-Z][A-Z0-9_]+-\d+)\b/

function authHeader(conn: Connection): string {
  return 'Basic ' + Buffer.from(`${conn.email}:${conn.secret}`).toString('base64')
}

function headers(conn: Connection): Record<string, string> {
  return { Authorization: authHeader(conn), Accept: 'application/json', 'Content-Type': 'application/json' }
}

function hostOf(url: string): string {
  try { return new URL(url).host.toLowerCase() } catch { return '' }
}

function projectKeys(conn: Connection): string[] {
  return conn.project
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
}

function jqlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Jira status category key -> our category */
function categoryOf(status: any): StateCategory {
  const key = status?.statusCategory?.key
  if (key === 'done') return 'done'
  if (key === 'new') return 'todo'
  return 'in_progress'
}

/** Map Jira priority names onto the 1 (critical) .. 4 (low) scale the UI uses */
function priorityOf(name: string | undefined): number | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (['highest', 'blocker', 'critical'].includes(n)) return 1
  if (['high', 'major'].includes(n)) return 2
  if (['medium', 'normal'].includes(n)) return 3
  if (['low', 'lowest', 'minor', 'trivial'].includes(n)) return 4
  return null
}

async function errorFor(res: Response): Promise<string> {
  if (res.status === 401) return 'Authentication failed. Check the email and API token.'
  if (res.status === 403) return 'Access denied. Your account may not have permission for this.'
  if (res.status === 404) return 'Not found. Check the site URL.'
  let detail = ''
  try {
    const body = (await res.json()) as { errorMessages?: string[]; message?: string }
    detail = body.errorMessages?.join(' ') || body.message || ''
  } catch { /* no body */ }
  return `HTTP ${res.status}${detail ? `: ${detail}` : ''}`
}

export const jiraProvider: Provider = {
  id: 'jira',

  parseRef(ref: string, connections: Connection[]): ParsedRef | null {
    const text = ref.trim()
    const jiraConns = connections.filter((c) => c.provider === 'jira')

    // Browser URL on a Jira Cloud site (or a configured Jira host):
    //   https://site.atlassian.net/browse/OB-123
    //   https://site.atlassian.net/jira/software/c/projects/OB/boards/1?selectedIssue=OB-123
    if (/^https?:\/\//i.test(text)) {
      const host = hostOf(text)
      const known = jiraConns.some((c) => hostOf(c.base_url) === host)
      if (!host.endsWith('.atlassian.net') && !known) return null
      const base = `https://${host}`
      let candidate = ''
      try {
        const u = new URL(text)
        candidate = u.searchParams.get('selectedIssue') ?? ''
        if (!candidate) candidate = u.pathname.match(/\/browse\/([A-Za-z][A-Za-z0-9_]+-\d+)/)?.[1] ?? ''
        if (!candidate) candidate = u.pathname.match(KEY_PATTERN)?.[1] ?? ''
      } catch { return null }
      const key = candidate.toUpperCase()
      if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) return null // e.g. a project or board link, not an issue
      return { provider: 'jira', itemNumber: key, container: key.split('-')[0], url: `${base}/browse/${key}` }
    }

    // Bare key like OB-123 (case-insensitive), needs a Jira connection to resolve against
    if (/^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(text) && jiraConns.length > 0) {
      const key = text.toUpperCase()
      const conn = jiraConns[0]
      return { provider: 'jira', itemNumber: key, container: key.split('-')[0], url: `${conn.base_url}/browse/${key}` }
    }
    return null
  },

  async test(conn: Connection): Promise<TestResult> {
    try {
      const res = await fetch(`${conn.base_url}/rest/api/3/myself`, { headers: headers(conn) })
      if (!res.ok) return { success: false, error: await errorFor(res) }
      const me = (await res.json()) as { displayName?: string }
      return { success: true, detail: `Connected as ${me.displayName ?? conn.email}` }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async search(conn: Connection, filters: SearchFilters): Promise<SearchResult[]> {
    const conds: string[] = []
    const keys = projectKeys(conn)
    if (keys.length > 0) conds.push(`project in (${keys.map(jqlString).join(', ')})`)

    const text = filters.search.trim()
    if (text) {
      if (/^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(text)) {
        conds.push(`key = ${jqlString(text.toUpperCase())}`)
      } else if (/^\d+$/.test(text) && keys.length === 1) {
        conds.push(`key = ${jqlString(`${keys[0]}-${text}`)}`)
      } else {
        // Strip characters with special meaning in text search, keep letters/numbers
        const cleaned = text.replace(/[^\p{L}\p{N}\s_]/gu, ' ').replace(/\s+/g, ' ').trim()
        if (cleaned) conds.push(`summary ~ ${jqlString(cleaned + '*')}`)
      }
    }
    if (filters.assignedToMe) conds.push('assignee = currentUser()')
    if (filters.type) conds.push(`issuetype = ${jqlString(filters.type)}`)
    if (filters.state) conds.push(`status = ${jqlString(filters.state)}`)
    if (filters.excludeDone) conds.push('statusCategory != Done')

    const jql = `${conds.length ? conds.join(' AND ') + ' ' : ''}ORDER BY updated DESC`
    // /search/jql replaces the older /search endpoint that Atlassian is retiring
    const res = await fetch(`${conn.base_url}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: headers(conn),
      body: JSON.stringify({
        jql,
        maxResults: 50,
        fields: ['summary', 'issuetype', 'status', 'assignee', 'project']
      })
    })
    if (!res.ok) throw new Error(`Jira search failed: ${await errorFor(res)}`)
    const data = (await res.json()) as { issues?: any[] }

    return (data.issues ?? []).map((issue): SearchResult => ({
      id: issue.key,
      title: issue.fields?.summary || '(no title)',
      type: issue.fields?.issuetype?.name || '',
      state: issue.fields?.status?.name || '',
      assignedTo: issue.fields?.assignee?.displayName || '',
      iterationPath: '',
      url: `${conn.base_url}/browse/${issue.key}`,
      provider: 'jira',
      container: issue.fields?.project?.key || String(issue.key).split('-')[0],
      connectionId: conn.id
    }))
  },

  async fetch(conn: Connection, itemNumber: string): Promise<NormalizedItem | null> {
    // renderedFields gives the description as HTML, so no Atlassian Document Format conversion
    const res = await fetch(
      `${conn.base_url}/rest/api/3/issue/${encodeURIComponent(itemNumber)}?expand=renderedFields,names&fields=*all`,
      { headers: headers(conn) }
    )
    if (!res.ok) return null
    const issue = (await res.json()) as {
      key: string
      fields: Record<string, any>
      renderedFields?: Record<string, any>
      names?: Record<string, string>
    }
    const f = issue.fields
    const rendered = issue.renderedFields ?? {}
    const names = issue.names ?? {}

    // Custom fields differ per site, so find them by display name
    const fieldIdByName = (re: RegExp): string | undefined =>
      Object.entries(names).find(([, label]) => re.test(label))?.[0]

    const pointsField = fieldIdByName(/^story point/i)
    const sprintField = fieldIdByName(/^sprint$/i)
    const acField = fieldIdByName(/acceptance criteria/i)

    let sprintName = ''
    const sprints = sprintField ? f[sprintField] : null
    if (Array.isArray(sprints) && sprints.length > 0) {
      const active = sprints.find((s: any) => s?.state === 'active')
      sprintName = (active ?? sprints[sprints.length - 1])?.name ?? ''
    }

    // Make relative links in rendered HTML absolute so they open from the app
    // Images hosted on Jira need a login the app can't pass along, so show a link instead of a broken image.
    const absolutize = (html: string): string =>
      html
        .replace(/(href|src)="\//g, `$1="${conn.base_url}/`)
        .replace(/<img[^>]*\ssrc="([^"]+)"[^>]*>/gi, (match, src: string) =>
          src.startsWith(conn.base_url) ? `<a href="${src}">[image: open in Jira]</a>` : match
        )

    const status = f.status
    const parentKey: string = f.parent?.key ?? ''

    return {
      id: issue.key,
      provider: 'jira',
      connection_id: conn.id,
      container: f.project?.key || issue.key.split('-')[0],
      title: f.summary || '',
      type: f.issuetype?.name || '',
      state: status?.name || '',
      state_category: categoryOf(status),
      assigned_to: f.assignee?.displayName || '',
      created_by: f.reporter?.displayName || f.creator?.displayName || '',
      description: absolutize(cleanHtml(typeof rendered.description === 'string' ? rendered.description : '')),
      acceptance_criteria:
        acField && typeof rendered[acField] === 'string' ? absolutize(cleanHtml(rendered[acField])) : '',
      tags: Array.isArray(f.labels) ? f.labels.join('; ') : '',
      iteration_path: sprintName,
      area_path: Array.isArray(f.components) ? f.components.map((c: any) => c.name).join(', ') : '',
      priority: priorityOf(f.priority?.name),
      story_points: pointsField && typeof f[pointsField] === 'number' ? f[pointsField] : null,
      parent_id: null,
      parent_key: parentKey,
      comment_count: typeof f.comment?.total === 'number' ? f.comment.total : 0,
      url: `${conn.base_url}/browse/${issue.key}`,
      created_at_ado: f.created || '',
      changed_at_ado: f.updated || '',
      last_synced_at: Date.now()
    }
  }
}
