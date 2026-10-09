// Installing the pipeline hooks into Claude Code, and checking the `claude` command-line tool.
// Plain file and process work with the paths passed in, so it is easy to test.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { spawnSync } from 'child_process'
import { HOOK_SCRIPT_SOURCE } from './hookScript'
import { hasHooks, mergeHooks, removeHooks } from './claudeSettings'

export interface HookPaths {
  scriptPath: string
  eventsDir: string
  /** Claude Code's user settings, normally ~/.claude/settings.json */
  settingsPath: string
}

type Result = { success: true } | { success: false; error: string }

const posix = (p: string): string => p.replace(/\\/g, '/')

/** Forward slashes and double quotes work the same in bash and PowerShell. */
export function hookCommand(p: HookPaths): string {
  return `node "${posix(p.scriptPath)}" "${posix(p.eventsDir)}"`
}

function readSettings(path: string): { ok: true; value: Record<string, any>; raw: string | null } | { ok: false; error: string } {
  if (!existsSync(path)) return { ok: true, value: {}, raw: null }
  const raw = readFileSync(path, 'utf8')
  if (raw.trim() === '') return { ok: true, value: {}, raw }
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object')
    return { ok: true, value, raw }
  } catch {
    return {
      ok: false,
      error: `Could not read ${path} as JSON (comments or trailing commas?). Nothing was changed.`
    }
  }
}

function backup(path: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.cowork-codex-backup-${Date.now()}`)
}

export function installHooks(p: HookPaths): Result {
  try {
    const current = readSettings(p.settingsPath)
    if (!current.ok) return { success: false, error: current.error }

    mkdirSync(dirname(p.scriptPath), { recursive: true })
    mkdirSync(p.eventsDir, { recursive: true })
    writeFileSync(p.scriptPath, HOOK_SCRIPT_SOURCE)

    const merged = mergeHooks(current.value, hookCommand(p))
    if (JSON.stringify(merged) !== JSON.stringify(current.value)) {
      mkdirSync(dirname(p.settingsPath), { recursive: true })
      if (current.raw !== null) backup(p.settingsPath)
      writeFileSync(p.settingsPath, JSON.stringify(merged, null, 2) + '\n')
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function removeInstalledHooks(p: HookPaths): Result {
  try {
    const current = readSettings(p.settingsPath)
    if (!current.ok) return { success: false, error: current.error }
    if (current.raw !== null) {
      const cleaned = removeHooks(current.value)
      if (JSON.stringify(cleaned) !== JSON.stringify(current.value)) {
        backup(p.settingsPath)
        writeFileSync(p.settingsPath, JSON.stringify(cleaned, null, 2) + '\n')
      }
    }
    rmSync(p.scriptPath, { force: true })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function hookStatus(p: HookPaths): { installed: boolean; scriptExists: boolean; settingsReadable: boolean } {
  const current = readSettings(p.settingsPath)
  return {
    installed: current.ok && hasHooks(current.value),
    scriptExists: existsSync(p.scriptPath),
    settingsReadable: current.ok
  }
}

// ─── Command-line tool checks ─────────────────────────────────────────────────

export function parseVersion(text: string): [number, number, number] | null {
  const m = text.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function versionAtLeast(v: [number, number, number], min: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (v[i] !== min[i]) return v[i] > min[i]
  }
  return true
}

/** `claude --desktop --resume` needs Claude Code 2.1.285 or later. */
export const MIN_DESKTOP_RESUME: [number, number, number] = [2, 1, 285]

export function nodeAvailable(): boolean {
  try {
    return spawnSync('node', ['--version'], { shell: true, timeout: 5000, windowsHide: true }).status === 0
  } catch {
    return false
  }
}

export function claudeCliInfo(): { found: boolean; version: string | null; canOpenInDesktop: boolean } {
  try {
    const r = spawnSync('claude', ['--version'], { shell: true, timeout: 8000, windowsHide: true, encoding: 'utf8' })
    if (r.status !== 0) return { found: false, version: null, canOpenInDesktop: false }
    const v = parseVersion(r.stdout ?? '')
    return { found: true, version: v ? v.join('.') : null, canOpenInDesktop: !!v && versionAtLeast(v, MIN_DESKTOP_RESUME) }
  } catch {
    return { found: false, version: null, canOpenInDesktop: false }
  }
}

/** Session ids are letters, digits, dashes and underscores. Anything else never reaches a shell. */
export function isSafeSessionId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,100}$/.test(id)
}

export function openSessionInDesktop(sessionId: string): { success: boolean; message: string } {
  if (!isSafeSessionId(sessionId)) return { success: false, message: 'That session id looks invalid.' }
  try {
    const r = spawnSync('claude', ['--desktop', '--resume', sessionId], {
      shell: true, timeout: 15000, windowsHide: true, encoding: 'utf8'
    })
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
    if (r.status === 0) return { success: true, message: out || 'Opening in Claude Desktop' }
    return { success: false, message: out.split('\n')[0] || 'Claude could not open that session.' }
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : String(e) }
  }
}
