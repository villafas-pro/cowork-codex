import { ipcMain } from 'electron'
import { getDb } from '../db'

interface AdoConfig {
  orgUrl: string    // e.g. https://dev.azure.com/Questica
  project: string   // e.g. Questica
  pat: string
}

interface WorkItemResult {
  id: number
  title: string
  type: string
  state: string
  assignedTo: string
  url: string
}

interface SearchFilters {
  search: string       // ID number or title keyword
  assignedToMe: boolean
  type: string         // '' = all
  state: string        // '' = all
}

function getConfig(): AdoConfig | null {
  const db = getDb()
  const orgUrl = (db.prepare("SELECT value FROM settings WHERE key = 'ado_org_url'").get() as any)?.value
  const project = (db.prepare("SELECT value FROM settings WHERE key = 'ado_project'").get() as any)?.value
  const pat = (db.prepare("SELECT value FROM settings WHERE key = 'ado_pat'").get() as any)?.value
  if (!orgUrl || !project || !pat) return null
  return { orgUrl: orgUrl.replace(/\/$/, ''), project, pat }
}

function authHeader(pat: string): string {
  return 'Basic ' + Buffer.from(`:${pat}`).toString('base64')
}

function buildWiql(project: string, filters: SearchFilters): string {
  const conditions: string[] = [
    `[System.TeamProject] = '${project.replace(/'/g, "''")}'`,
    `[System.State] <> 'Removed'`
  ]

  if (filters.search.trim()) {
    const asNum = parseInt(filters.search.trim(), 10)
    if (!isNaN(asNum) && String(asNum) === filters.search.trim()) {
      conditions.push(`[System.Id] = ${asNum}`)
    } else {
      const escaped = filters.search.trim().replace(/'/g, "''")
      conditions.push(`[System.Title] CONTAINS '${escaped}'`)
    }
  }

  if (filters.assignedToMe) {
    conditions.push(`[System.AssignedTo] = @Me`)
  }

  if (filters.type) {
    conditions.push(`[System.WorkItemType] = '${filters.type.replace(/'/g, "''")}'`)
  }

  if (filters.state) {
    conditions.push(`[System.State] = '${filters.state.replace(/'/g, "''")}'`)
  }

  return `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`
}

export function registerAdoHandlers(): void {

  // Get stored config (without PAT for display)
  ipcMain.handle('ado:getConfig', () => {
    const db = getDb()
    const orgUrl = (db.prepare("SELECT value FROM settings WHERE key = 'ado_org_url'").get() as any)?.value || ''
    const project = (db.prepare("SELECT value FROM settings WHERE key = 'ado_project'").get() as any)?.value || ''
    const hasPat = !!(db.prepare("SELECT value FROM settings WHERE key = 'ado_pat'").get() as any)?.value
    return { orgUrl, project, hasPat }
  })

  // Save config
  ipcMain.handle('ado:setConfig', (_, config: AdoConfig) => {
    const db = getDb()
    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    upsert.run('ado_org_url', config.orgUrl.replace(/\/$/, ''))
    upsert.run('ado_project', config.project)
    upsert.run('ado_pat', config.pat)
    return { success: true }
  })

  // Test connection
  ipcMain.handle('ado:testConnection', async () => {
    const config = getConfig()
    if (!config) return { success: false, error: 'Not configured' }
    try {
      const url = `${config.orgUrl}/_apis/projects/${encodeURIComponent(config.project)}?api-version=7.0`
      const res = await fetch(url, {
        headers: { Authorization: authHeader(config.pat) }
      })
      if (res.ok) {
        const data = await res.json() as any
        return { success: true, projectName: data.name }
      }
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Search work items
  ipcMain.handle('ado:search', async (_, filters: SearchFilters): Promise<WorkItemResult[]> => {
    const config = getConfig()
    if (!config) return []

    try {
      // Step 1: WIQL query to get matching IDs
      const wiql = buildWiql(config.project, filters)
      const wiqlUrl = `${config.orgUrl}/${encodeURIComponent(config.project)}/_apis/wit/wiql?api-version=7.0&$top=50`
      const wiqlRes = await fetch(wiqlUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader(config.pat),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: wiql })
      })

      if (!wiqlRes.ok) {
        console.error('[ado:search] WIQL error', wiqlRes.status, await wiqlRes.text())
        return []
      }

      const wiqlData = await wiqlRes.json() as any
      const ids: number[] = (wiqlData.workItems || []).map((w: any) => w.id).slice(0, 50)
      if (ids.length === 0) return []

      // Step 2: Batch fetch work item details
      const batchUrl = `${config.orgUrl}/${encodeURIComponent(config.project)}/_apis/wit/workitemsbatch?api-version=7.0`
      const batchRes = await fetch(batchUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader(config.pat),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids,
          fields: [
            'System.Id',
            'System.Title',
            'System.WorkItemType',
            'System.State',
            'System.AssignedTo'
          ]
        })
      })

      if (!batchRes.ok) {
        console.error('[ado:search] batch error', batchRes.status, await batchRes.text())
        return []
      }

      const batchData = await batchRes.json() as any
      return (batchData.value || []).map((item: any): WorkItemResult => {
        const f = item.fields
        const assignedTo = f['System.AssignedTo']
        return {
          id: f['System.Id'],
          title: f['System.Title'] || '(no title)',
          type: f['System.WorkItemType'] || '',
          state: f['System.State'] || '',
          assignedTo: typeof assignedTo === 'object' ? assignedTo?.displayName || '' : assignedTo || '',
          url: `${config.orgUrl}/${encodeURIComponent(config.project)}/_workitems/edit/${f['System.Id']}`
        }
      })
    } catch (e: any) {
      console.error('[ado:search] error:', e.message)
      return []
    }
  })

  // Check if ADO is configured
  ipcMain.handle('ado:isConfigured', () => {
    return !!getConfig()
  })
}
