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
  iterationPath: string
  url: string
}

export interface CachedWorkItem {
  id: string
  title: string
  type: string
  state: string
  assigned_to: string
  created_by: string
  description: string
  acceptance_criteria: string
  tags: string
  iteration_path: string
  area_path: string
  priority: number | null
  story_points: number | null
  parent_id: number | null
  comment_count: number
  ado_url: string
  created_at_ado: string
  changed_at_ado: string
  last_synced_at: number
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
            'System.AssignedTo',
            'System.IterationPath'
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
          iterationPath: f['System.IterationPath'] || '',
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

  // Fetch (and cache) a single work item by ADO ID
  ipcMain.handle('ado:fetchWorkItem', async (_, adoId: number, force = false): Promise<CachedWorkItem | null> => {
    const db = getDb()
    const CACHE_TTL = 60 * 60 * 1000 // 1 hour

    // Try cache first
    const cached = db.prepare('SELECT * FROM cached_work_items WHERE id = ?').get(String(adoId)) as CachedWorkItem | undefined
    if (!force && cached && (Date.now() - cached.last_synced_at) < CACHE_TTL) {
      return cached
    }

    const config = getConfig()
    if (!config) return cached || null  // return stale cache if ADO not configured

    try {
      const url = `${config.orgUrl}/${encodeURIComponent(config.project)}/_apis/wit/workitems/${adoId}?$expand=all&api-version=7.1`
      const res = await fetch(url, { headers: { Authorization: authHeader(config.pat) } })
      if (!res.ok) {
        console.error('[ado:fetchWorkItem] HTTP', res.status)
        return cached || null
      }

      const data = await res.json() as any
      const f = data.fields

      const item: CachedWorkItem = {
        id: String(adoId),
        title: f['System.Title'] || '',
        type: f['System.WorkItemType'] || '',
        state: f['System.State'] || '',
        assigned_to: f['System.AssignedTo']?.displayName || '',
        created_by: f['System.CreatedBy']?.displayName || '',
        description: f['System.Description'] || '',
        acceptance_criteria: f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
        tags: f['System.Tags'] || '',
        iteration_path: f['System.IterationPath'] || '',
        area_path: f['System.AreaPath'] || '',
        priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
        story_points: f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? null,
        parent_id: f['System.Parent'] ?? null,
        comment_count: f['System.CommentCount'] || 0,
        ado_url: `${config.orgUrl}/${encodeURIComponent(config.project)}/_workitems/edit/${adoId}`,
        created_at_ado: f['System.CreatedDate'] || '',
        changed_at_ado: f['System.ChangedDate'] || '',
        last_synced_at: Date.now()
      }

      db.prepare(`
        INSERT INTO cached_work_items
          (id, title, type, state, assigned_to, created_by, description, acceptance_criteria,
           tags, iteration_path, area_path, priority, story_points, parent_id, comment_count,
           ado_url, created_at_ado, changed_at_ado, last_synced_at)
        VALUES
          (@id, @title, @type, @state, @assigned_to, @created_by, @description, @acceptance_criteria,
           @tags, @iteration_path, @area_path, @priority, @story_points, @parent_id, @comment_count,
           @ado_url, @created_at_ado, @changed_at_ado, @last_synced_at)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title, type = excluded.type, state = excluded.state,
          assigned_to = excluded.assigned_to, created_by = excluded.created_by,
          description = excluded.description, acceptance_criteria = excluded.acceptance_criteria,
          tags = excluded.tags, iteration_path = excluded.iteration_path, area_path = excluded.area_path,
          priority = excluded.priority, story_points = excluded.story_points, parent_id = excluded.parent_id,
          comment_count = excluded.comment_count, ado_url = excluded.ado_url,
          created_at_ado = excluded.created_at_ado, changed_at_ado = excluded.changed_at_ado,
          last_synced_at = excluded.last_synced_at
      `).run(item)

      return item
    } catch (e: any) {
      console.error('[ado:fetchWorkItem] error:', e.message)
      return cached || null
    }
  })

  // Background sync: refresh all linked work items that are stale
  ipcMain.handle('ado:syncLinkedWorkItems', async () => {
    const config = getConfig()
    if (!config) return

    const db = getDb()
    const CACHE_TTL = 60 * 60 * 1000

    const linked = db.prepare('SELECT DISTINCT item_number FROM work_items').all() as { item_number: string }[]
    for (const row of linked) {
      const adoId = parseInt(row.item_number, 10)
      if (isNaN(adoId)) continue

      const cached = db.prepare('SELECT last_synced_at FROM cached_work_items WHERE id = ?').get(String(adoId)) as { last_synced_at: number } | undefined
      if (cached && (Date.now() - cached.last_synced_at) < CACHE_TTL) continue

      try {
        const url = `${config.orgUrl}/${encodeURIComponent(config.project)}/_apis/wit/workitems/${adoId}?$expand=all&api-version=7.1`
        const res = await fetch(url, { headers: { Authorization: authHeader(config.pat) } })
        if (!res.ok) continue

        const data = await res.json() as any
        const f = data.fields

        const item: CachedWorkItem = {
          id: String(adoId),
          title: f['System.Title'] || '',
          type: f['System.WorkItemType'] || '',
          state: f['System.State'] || '',
          assigned_to: f['System.AssignedTo']?.displayName || '',
          created_by: f['System.CreatedBy']?.displayName || '',
          description: f['System.Description'] || '',
          acceptance_criteria: f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
          tags: f['System.Tags'] || '',
          iteration_path: f['System.IterationPath'] || '',
          area_path: f['System.AreaPath'] || '',
          priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
          story_points: f['Microsoft.VSTS.Scheduling.StoryPoints'] ?? null,
          parent_id: f['System.Parent'] ?? null,
          comment_count: f['System.CommentCount'] || 0,
          ado_url: `${config.orgUrl}/${encodeURIComponent(config.project)}/_workitems/edit/${adoId}`,
          created_at_ado: f['System.CreatedDate'] || '',
          changed_at_ado: f['System.ChangedDate'] || '',
          last_synced_at: Date.now()
        }

        db.prepare(`
          INSERT INTO cached_work_items
            (id, title, type, state, assigned_to, created_by, description, acceptance_criteria,
             tags, iteration_path, area_path, priority, story_points, parent_id, comment_count,
             ado_url, created_at_ado, changed_at_ado, last_synced_at)
          VALUES
            (@id, @title, @type, @state, @assigned_to, @created_by, @description, @acceptance_criteria,
             @tags, @iteration_path, @area_path, @priority, @story_points, @parent_id, @comment_count,
             @ado_url, @created_at_ado, @changed_at_ado, @last_synced_at)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title, type = excluded.type, state = excluded.state,
            assigned_to = excluded.assigned_to, created_by = excluded.created_by,
            description = excluded.description, acceptance_criteria = excluded.acceptance_criteria,
            tags = excluded.tags, iteration_path = excluded.iteration_path, area_path = excluded.area_path,
            priority = excluded.priority, story_points = excluded.story_points, parent_id = excluded.parent_id,
            comment_count = excluded.comment_count, ado_url = excluded.ado_url,
            created_at_ado = excluded.created_at_ado, changed_at_ado = excluded.changed_at_ado,
            last_synced_at = excluded.last_synced_at
        `).run(item)
      } catch { /* skip this item, try next */ }
    }
  })
}
