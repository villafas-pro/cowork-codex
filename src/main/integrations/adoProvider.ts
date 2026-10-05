import { cleanHtml } from './html'
import type {
  Connection, NormalizedItem, ParsedRef, Provider, SearchFilters, SearchResult, StateCategory, TestResult
} from './types'

function authHeader(pat: string): string {
  return 'Basic ' + Buffer.from(`:${pat}`).toString('base64')
}

export function adoStateCategory(state: string): StateCategory {
  if (['Closed', 'Resolved', 'Done', 'Removed', 'Completed'].includes(state)) return 'done'
  if (['New', 'To Do', 'Proposed', 'Approved', 'Open', 'Backlog', ''].includes(state)) return 'todo'
  return 'in_progress'
}

function itemUrl(conn: Connection, project: string, id: string | number): string {
  return `${conn.base_url}/${encodeURIComponent(project)}/_workitems/edit/${id}`
}

function escapeWiql(s: string): string {
  return s.replace(/'/g, "''")
}

function buildWiql(project: string, f: SearchFilters): string {
  const conditions: string[] = [
    `[System.TeamProject] = '${escapeWiql(project)}'`,
    `[System.State] <> 'Removed'`
  ]
  const text = f.search.trim()
  if (text) {
    const asNum = parseInt(text, 10)
    if (!isNaN(asNum) && String(asNum) === text) conditions.push(`[System.Id] = ${asNum}`)
    else conditions.push(`[System.Title] CONTAINS '${escapeWiql(text)}'`)
  }
  if (f.assignedToMe) conditions.push('[System.AssignedTo] = @Me')
  if (f.type) conditions.push(`[System.WorkItemType] = '${escapeWiql(f.type)}'`)
  if (f.state) conditions.push(`[System.State] = '${escapeWiql(f.state)}'`)
  if (f.excludeDone) conditions.push("[System.State] NOT IN ('Closed','Resolved','Done','Removed','Completed')")
  return `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`
}

export const adoProvider: Provider = {
  id: 'ado',

  parseRef(ref: string, connections: Connection[]): ParsedRef | null {
    const text = ref.trim()

    // Browser URL: https://dev.azure.com/org/PROJECT/_workitems/edit/123
    const urlMatch = text.match(/^https?:\/\/[^/]*(dev\.azure\.com|visualstudio\.com)\/.*?([^/]+)\/_workitems\/edit\/(\d+)/i)
    if (urlMatch) {
      let container = urlMatch[2]
      try { container = decodeURIComponent(container) } catch { /* keep raw */ }
      return { provider: 'ado', itemNumber: urlMatch[3], container, url: text }
    }

    // Bare number, only if an ADO connection exists to resolve it against
    if (/^\d+$/.test(text)) {
      const conn = connections.find((c) => c.provider === 'ado')
      if (conn) {
        return { provider: 'ado', itemNumber: text, container: conn.project, url: itemUrl(conn, conn.project, text) }
      }
    }
    return null
  },

  async test(conn: Connection): Promise<TestResult> {
    try {
      const url = `${conn.base_url}/_apis/projects/${encodeURIComponent(conn.project)}?api-version=7.0`
      const res = await fetch(url, { headers: { Authorization: authHeader(conn.secret) } })
      if (res.ok) {
        const data = (await res.json()) as { name?: string }
        return { success: true, detail: `Connected to project "${data.name ?? conn.project}"` }
      }
      if (res.status === 401 || res.status === 203) return { success: false, error: 'Authentication failed. Check the token and its scopes.' }
      if (res.status === 404) return { success: false, error: 'Project not found. Check the organization URL and project name.' }
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async search(conn: Connection, filters: SearchFilters): Promise<SearchResult[]> {
    const project = conn.project
    const headers = { Authorization: authHeader(conn.secret), 'Content-Type': 'application/json' }

    // Step 1: WIQL query for matching ids
    const wiqlRes = await fetch(
      `${conn.base_url}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.0&$top=50`,
      { method: 'POST', headers, body: JSON.stringify({ query: buildWiql(project, filters) }) }
    )
    if (!wiqlRes.ok) throw new Error(`ADO search failed (HTTP ${wiqlRes.status})`)
    const wiqlData = (await wiqlRes.json()) as { workItems?: { id: number }[] }
    const ids = (wiqlData.workItems ?? []).map((w) => w.id).slice(0, 50)
    if (ids.length === 0) return []

    // Step 2: batch fetch the fields we show in the list
    const batchRes = await fetch(
      `${conn.base_url}/${encodeURIComponent(project)}/_apis/wit/workitemsbatch?api-version=7.0`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ids,
          fields: [
            'System.Id', 'System.Title', 'System.WorkItemType', 'System.State',
            'System.AssignedTo', 'System.IterationPath', 'System.TeamProject'
          ]
        })
      }
    )
    if (!batchRes.ok) throw new Error(`ADO search failed (HTTP ${batchRes.status})`)
    const batch = (await batchRes.json()) as { value?: { fields: Record<string, any> }[] }

    return (batch.value ?? []).map((item): SearchResult => {
      const f = item.fields
      const assigned = f['System.AssignedTo']
      const proj = f['System.TeamProject'] || project
      return {
        id: String(f['System.Id']),
        title: f['System.Title'] || '(no title)',
        type: f['System.WorkItemType'] || '',
        state: f['System.State'] || '',
        assignedTo: typeof assigned === 'object' ? assigned?.displayName || '' : assigned || '',
        iterationPath: f['System.IterationPath'] || '',
        url: itemUrl(conn, proj, f['System.Id']),
        provider: 'ado',
        container: proj,
        connectionId: conn.id
      }
    })
  },

  async fetch(conn: Connection, itemNumber: string): Promise<NormalizedItem | null> {
    const res = await fetch(
      `${conn.base_url}/_apis/wit/workitems/${encodeURIComponent(itemNumber)}?$expand=all&api-version=7.1`,
      { headers: { Authorization: authHeader(conn.secret) } }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { fields: Record<string, any> }
    const f = data.fields
    const project = f['System.TeamProject'] || conn.project
    const state = f['System.State'] || ''
    const parent = f['System.Parent'] ?? null

    return {
      id: itemNumber,
      provider: 'ado',
      connection_id: conn.id,
      container: project,
      title: f['System.Title'] || '',
      type: f['System.WorkItemType'] || '',
      state,
      state_category: adoStateCategory(state),
      assigned_to: f['System.AssignedTo']?.displayName || '',
      created_by: f['System.CreatedBy']?.displayName || '',
      description: cleanHtml(f['System.Description']),
      acceptance_criteria: cleanHtml(f['Microsoft.VSTS.Common.AcceptanceCriteria']),
      tags: f['System.Tags'] || '',
      iteration_path: f['System.IterationPath'] || '',
      area_path: f['System.AreaPath'] || '',
      priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
      story_points: f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? null,
      parent_id: parent,
      parent_key: parent != null ? String(parent) : '',
      comment_count: f['System.CommentCount'] || 0,
      url: itemUrl(conn, project, itemNumber),
      created_at_ado: f['System.CreatedDate'] || '',
      changed_at_ado: f['System.ChangedDate'] || '',
      last_synced_at: Date.now()
    }
  }
}
