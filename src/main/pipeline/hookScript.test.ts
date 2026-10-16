import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HOOK_SCRIPT_SOURCE } from './hookScript'

let root: string
let script: string
let repo: string // a git repo on a branch that contains a ticket key
let plainRepo: string // a git repo on a branch with no key

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function makeRepo(dir: string, branch: string): void {
  git(dir, 'init', '-q')
  git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init')
  git(dir, 'checkout', '-q', '-b', branch)
}

function run(payload: object, eventsDir: string): { stdout: string; stderr: string; status: number | null } {
  const r = spawnSync(process.execPath, [script, eventsDir], { input: JSON.stringify(payload), encoding: 'utf8' })
  return { stdout: r.stdout, stderr: r.stderr, status: r.status }
}

function events(dir: string): any[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  } catch {
    return []
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'hook-test-'))
  script = join(root, 'hook.js')
  writeFileSync(script, HOOK_SCRIPT_SOURCE)
  repo = join(root, 'repo')
  plainRepo = join(root, 'plain')
  for (const d of [repo, plainRepo]) execFileSync('mkdir', ['-p', d])
  makeRepo(repo, 'ob-12064-combobox-aria')
  makeRepo(plainRepo, 'main-work')
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('pipeline hook script', () => {
  it('records a session start with the ticket from the branch name, upper-cased', () => {
    const out = join(root, 'e1')
    const r = run({ hook_event_name: 'SessionStart', session_id: 's1', cwd: repo, source: 'startup' }, out)
    expect(r.status).toBe(0)
    expect(events(out)).toMatchObject([{ v: 1, type: 'session_start', session_id: 's1', key: 'OB-12064', branch: 'ob-12064-combobox-aria' }])
  })

  it('never prints anything (UserPromptSubmit output would reach Claude)', () => {
    const out = join(root, 'e2')
    const r = run({ hook_event_name: 'UserPromptSubmit', session_id: 's2', cwd: repo, prompt: 'work on OB-1' }, out)
    expect(r.stdout).toBe('')
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })

  it('takes the ticket from the prompt when the branch has none', () => {
    const out = join(root, 'e3')
    run({ hook_event_name: 'UserPromptSubmit', session_id: 's3', cwd: plainRepo, prompt: 'Please fix OB-12511, the CSV export' }, out)
    expect(events(out)).toMatchObject([{ type: 'heartbeat', key: 'OB-12511' }])
  })

  it('ignores things that look like keys but are not tickets', () => {
    const out = join(root, 'e4')
    run({ hook_event_name: 'UserPromptSubmit', session_id: 's4', cwd: plainRepo, prompt: 'use UTF-8 and SHA-256 with ISO-8601' }, out)
    expect(events(out)).toEqual([])
  })

  it('writes nothing for a keyless start or heartbeat', () => {
    const out = join(root, 'e5')
    run({ hook_event_name: 'SessionStart', session_id: 's5', cwd: plainRepo }, out)
    run({ hook_event_name: 'Stop', session_id: 's5', cwd: plainRepo }, out)
    expect(events(out)).toEqual([])
  })

  it('still records the end of a session without a key, so the app can match it by session id', () => {
    const out = join(root, 'e6')
    run({ hook_event_name: 'SessionEnd', session_id: 's6', cwd: plainRepo }, out)
    expect(events(out)).toMatchObject([{ type: 'session_end', session_id: 's6', key: null }])
  })

  it('reports the branch ticket and the prompt ticket separately, and the prompt wins the combined key', () => {
    const out = join(root, 'e11')
    run({ hook_event_name: 'UserPromptSubmit', session_id: 's11', cwd: repo, prompt: 'A11y ticket OB-12707: fix the filter' }, out)
    expect(events(out)).toMatchObject([{ type: 'heartbeat', key: 'OB-12707', prompt_key: 'OB-12707', branch_key: 'OB-12064' }])
  })

  it('has no prompt key at session start or turn end, only the branch one', () => {
    const out = join(root, 'e12')
    run({ hook_event_name: 'SessionStart', session_id: 's12', cwd: repo }, out)
    run({ hook_event_name: 'Stop', session_id: 's12', cwd: repo }, out)
    const got = events(out)
    expect(got).toHaveLength(2)
    for (const g of got) expect(g).toMatchObject({ prompt_key: null, branch_key: 'OB-12064', key: 'OB-12064' })
  })

  it('reports a prompt ticket on its own when the branch has none', () => {
    const out = join(root, 'e13')
    run({ hook_event_name: 'UserPromptSubmit', session_id: 's13', cwd: plainRepo, prompt: 'OB-12709 please' }, out)
    expect(events(out)).toMatchObject([{ key: 'OB-12709', prompt_key: 'OB-12709', branch_key: null }])
  })

  it('maps Stop to a heartbeat', () => {
    const out = join(root, 'e7')
    run({ hook_event_name: 'Stop', session_id: 's7', cwd: repo }, out)
    expect(events(out)).toMatchObject([{ type: 'heartbeat', key: 'OB-12064' }])
  })

  it('survives garbage input and a missing folder without failing', () => {
    const r = spawnSync(process.execPath, [script, join(root, 'e8')], { input: 'not json', encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout + r.stderr).toBe('')
    const r2 = run({ hook_event_name: 'SessionStart', session_id: 'x', cwd: join(root, 'does-not-exist') }, join(root, 'e9'))
    expect(r2.status).toBe(0)
  })

  it('leaves no temporary files behind', () => {
    const out = join(root, 'e10')
    run({ hook_event_name: 'SessionStart', session_id: 's10', cwd: repo }, out)
    expect(readdirSync(out).every((f) => f.endsWith('.json'))).toBe(true)
  })
})
