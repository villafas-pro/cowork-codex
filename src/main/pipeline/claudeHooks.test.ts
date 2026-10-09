import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { hookStatus, installHooks, parseVersion, removeInstalledHooks, versionAtLeast } from './claudeHooks'
import { HOOK_EVENTS, HOOK_MARKER } from './claudeSettings'

let root: string
const paths = () => ({
  scriptPath: join(root, 'data', `${HOOK_MARKER}.js`),
  eventsDir: join(root, 'data', 'pipeline-events'),
  settingsPath: join(root, 'home', '.claude', 'settings.json')
})

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'hooks-test-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

const readSettings = (p: string): any => JSON.parse(readFileSync(p, 'utf8'))

describe('installHooks', () => {
  it('creates the settings file, the script and the events folder when none exist', () => {
    const p = paths()
    expect(installHooks(p)).toEqual({ success: true })
    expect(existsSync(p.scriptPath)).toBe(true)
    expect(existsSync(p.eventsDir)).toBe(true)
    const s = readSettings(p.settingsPath)
    for (const e of HOOK_EVENTS) expect(s.hooks[e][0].hooks[0].command).toContain(HOOK_MARKER)
    expect(hookStatus(p).installed).toBe(true)
  })

  it('uses forward slashes so the command works in both bash and PowerShell', () => {
    const p = paths()
    installHooks(p)
    const cmd = readSettings(p.settingsPath).hooks.Stop[0].hooks[0].command as string
    expect(cmd).not.toContain('\\')
    expect(cmd.startsWith('node "')).toBe(true)
  })

  it('keeps everything that was already in the settings and backs the original up', () => {
    const p = paths()
    mkdirSync(join(root, 'home', '.claude'), { recursive: true })
    const original = { model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }] } }
    writeFileSync(p.settingsPath, JSON.stringify(original, null, 2))
    installHooks(p)
    const s = readSettings(p.settingsPath)
    expect(s.model).toBe('opus')
    expect(s.hooks.Stop[0]).toEqual(original.hooks.Stop[0])
    expect(s.hooks.Stop).toHaveLength(2)
    const backups = readdirSync(join(root, 'home', '.claude')).filter((f) => f.includes('cowork-codex-backup'))
    expect(backups).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(root, 'home', '.claude', backups[0]), 'utf8'))).toEqual(original)
  })

  it('refuses to touch a settings file it cannot parse', () => {
    const p = paths()
    mkdirSync(join(root, 'home', '.claude'), { recursive: true })
    writeFileSync(p.settingsPath, '{ "model": "opus", // comment\n }')
    const r = installHooks(p)
    expect(r.success).toBe(false)
    expect(readFileSync(p.settingsPath, 'utf8')).toContain('// comment')
  })

  it('is safe to run twice', () => {
    const p = paths()
    installHooks(p)
    installHooks(p)
    for (const e of HOOK_EVENTS) expect(readSettings(p.settingsPath).hooks[e]).toHaveLength(1)
  })
})

describe('removeInstalledHooks', () => {
  it('removes only our entries and reports not installed', () => {
    const p = paths()
    mkdirSync(join(root, 'home', '.claude'), { recursive: true })
    const original = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }] } }
    writeFileSync(p.settingsPath, JSON.stringify(original))
    installHooks(p)
    expect(removeInstalledHooks(p)).toEqual({ success: true })
    expect(readSettings(p.settingsPath)).toEqual(original)
    expect(hookStatus(p).installed).toBe(false)
  })

  it('does nothing when there is no settings file', () => {
    expect(removeInstalledHooks(paths())).toEqual({ success: true })
    expect(existsSync(paths().settingsPath)).toBe(false)
  })
})

describe('versions', () => {
  it('parses what `claude --version` prints', () => {
    expect(parseVersion('2.1.285 (Claude Code)')).toEqual([2, 1, 285])
    expect(parseVersion('claude 3.0.1')).toEqual([3, 0, 1])
    expect(parseVersion('nope')).toBeNull()
  })
  it('compares versions numerically, not as text', () => {
    expect(versionAtLeast([2, 1, 285], [2, 1, 285])).toBe(true)
    expect(versionAtLeast([2, 1, 1000], [2, 1, 285])).toBe(true)
    expect(versionAtLeast([2, 1, 99], [2, 1, 285])).toBe(false)
    expect(versionAtLeast([2, 10, 0], [2, 9, 999])).toBe(true)
    expect(versionAtLeast([1, 99, 999], [2, 0, 0])).toBe(false)
  })
})
