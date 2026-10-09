import { BrowserWindow, Notification, app, ipcMain } from 'electron'
import { mkdirSync, watch } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  addItem, assignedSuggestions, autoAddRivetTickets, createCategory, deleteCategory, detectAlerts, getBoard,
  githubToken, githubTokenStatus, ingestSessionEvents, listCategories, moveItem, removeItem, reorderCategories,
  rivetAuthor, setGithubToken, syncAllItems, updateCategory, type PipelineAlert
} from '../pipeline'
import { testToken } from '../pipeline/github'
import {
  claudeCliInfo, hookStatus, installHooks, nodeAvailable, openSessionInDesktop, removeInstalledHooks, type HookPaths
} from '../pipeline/claudeHooks'
import { HOOK_MARKER } from '../pipeline/claudeSettings'
import { getDb } from '../db'

const POLL_MS = 3 * 60 * 1000
const SESSION_POLL_MS = 30 * 1000

function hookPaths(): HookPaths {
  const data = app.getPath('userData')
  // Claude Code reads CLAUDE_CONFIG_DIR when set, otherwise ~/.claude
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  return {
    scriptPath: join(data, `${HOOK_MARKER}.js`),
    eventsDir: join(data, 'pipeline-events'),
    settingsPath: join(claudeDir, 'settings.json')
  }
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function notificationsEnabled(): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'pipeline_notifications'").get() as { value: string } | undefined
  return row?.value !== '0'
}

function notify(alerts: PipelineAlert[]): void {
  if (alerts.length === 0 || !notificationsEnabled() || !Notification.isSupported()) return
  const open = (): void => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('app:navigate', 'pipeline')
  }
  // Several changes at once (for example after being away) become one notification
  const toShow =
    alerts.length > 3
      ? [{ title: `${alerts.length} tickets changed`, body: alerts.slice(0, 4).map((a) => `${a.key}: ${a.message}`).join('\n') }]
      : alerts.map((a) => ({ title: `${a.key}: ${a.message}`, body: a.title }))
  for (const n of toShow) {
    const note = new Notification({ title: n.title, body: n.body })
    note.on('click', open)
    note.show()
  }
}

/** One refresh: pick up newly dispatched tickets, re-read every live ticket, then raise alerts. */
async function refresh(): Promise<{
  added: string[]; synced: number; failed: number; errors: string[]
}> {
  const errors: string[] = []
  let added: string[] = []
  try {
    added = await autoAddRivetTickets()
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  const result = await syncAllItems()
  if (result.githubError) errors.push(`GitHub: ${result.githubError}`)
  try {
    notify(detectAlerts())
  } catch (e) {
    console.error('[pipeline] alert check failed:', e instanceof Error ? e.message : e)
  }
  broadcast('pipeline:updated')
  return { added, synced: result.synced, failed: result.failed, errors }
}

/** Picks up the files the Claude Code hook drops, as soon as they appear. */
function startSessionWatcher(): void {
  const dir = hookPaths().eventsDir
  try { mkdirSync(dir, { recursive: true }) } catch { /* retried by the interval */ }

  let busy = false
  const run = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      const r = await ingestSessionEvents(dir)
      if (r.processed > 0) broadcast('pipeline:updated')
    } catch (e) {
      console.error('[pipeline] session ingest failed:', e instanceof Error ? e.message : e)
    } finally {
      busy = false
    }
  }

  let timer: NodeJS.Timeout | undefined
  try {
    watch(dir, () => {
      clearTimeout(timer)
      timer = setTimeout(run, 400)
    })
  } catch { /* the interval below covers it */ }
  setInterval(run, SESSION_POLL_MS)
  run()
}

// Pipeline dashboard: tracked Jira tickets, their stage, and your categories.
export function registerPipelineHandlers(): void {
  ipcMain.handle('pipeline:getBoard', () => getBoard())
  ipcMain.handle('pipeline:sync', () => refresh())

  ipcMain.handle('pipeline:add', (_, ref: string, categoryId?: string) => addItem(String(ref), { categoryId }))
  ipcMain.handle('pipeline:remove', (_, key: string) => {
    removeItem(String(key))
    return { success: true }
  })
  ipcMain.handle('pipeline:move', (_, key: string, categoryId: string, index: number) =>
    moveItem(String(key), String(categoryId), Number(index))
  )
  ipcMain.handle('pipeline:suggestions', () => assignedSuggestions())

  ipcMain.handle('pipeline:getCategories', () => listCategories())
  ipcMain.handle('pipeline:createCategory', (_, name: string, color?: string) => createCategory(String(name), color))
  ipcMain.handle('pipeline:updateCategory', (_, id: string, patch: { name?: string; color?: string; muted?: boolean }) =>
    updateCategory(String(id), patch)
  )
  ipcMain.handle('pipeline:deleteCategory', (_, id: string) => deleteCategory(String(id)))
  ipcMain.handle('pipeline:reorderCategories', (_, ids: string[]) => {
    reorderCategories(ids.map(String))
    return { success: true }
  })

  // ─── GitHub token ─────────────────────────────────────────────────────────
  ipcMain.handle('pipeline:github:status', () => githubTokenStatus())
  ipcMain.handle('pipeline:github:save', (_, token: string) => {
    setGithubToken(String(token))
    return githubTokenStatus()
  })
  ipcMain.handle('pipeline:github:test', async () => {
    const token = githubToken()
    if (!token) return { success: false, error: 'No token saved yet.' }
    return testToken(token)
  })

  // ─── Claude Code hooks ────────────────────────────────────────────────────
  ipcMain.handle('pipeline:hooks:status', () => {
    const p = hookPaths()
    return {
      ...hookStatus(p),
      settingsPath: p.settingsPath,
      eventsDir: p.eventsDir,
      nodeAvailable: nodeAvailable(),
      claude: claudeCliInfo()
    }
  })
  ipcMain.handle('pipeline:hooks:install', () => installHooks(hookPaths()))
  ipcMain.handle('pipeline:hooks:remove', () => removeInstalledHooks(hookPaths()))
  ipcMain.handle('pipeline:claudeInfo', () => claudeCliInfo())
  ipcMain.handle('pipeline:openSession', (_, sessionId: string) => openSessionInDesktop(String(sessionId)))

  ipcMain.handle('pipeline:rivetAuthor', () => rivetAuthor())

  // Poll while the app is open. Failures are logged and retried on the next tick.
  const tick = (): void => {
    refresh().catch((e) => console.error('[pipeline] background refresh failed:', e instanceof Error ? e.message : e))
  }
  setTimeout(tick, 20_000)
  setInterval(tick, POLL_MS)
  startSessionWatcher()
}
