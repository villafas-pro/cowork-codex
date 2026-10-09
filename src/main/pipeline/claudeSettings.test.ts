import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { isDeepStrictEqual } from 'util'
import { HOOK_EVENTS, HOOK_MARKER, hasHooks, mergeHooks, removeHooks } from './claudeSettings'

const CMD = `node "C:/Users/me/AppData/Roaming/cowork-codex/${HOOK_MARKER}.js" "C:/Users/me/AppData/Roaming/cowork-codex/pipeline-events"`

const otherEntry = fc.record({
  matcher: fc.option(fc.constantFrom('Bash', 'Edit', '*'), { nil: undefined }),
  hooks: fc.array(
    fc.record({ type: fc.constant('command'), command: fc.constantFrom('echo hi', 'prettier --write .', 'npm test') }),
    { minLength: 1, maxLength: 2 }
  )
})

const settingsArb = fc.record(
  {
    model: fc.constantFrom('opus', 'sonnet'),
    permissions: fc.constant({ allow: ['Bash(npm test)'] }),
    hooks: fc.record(
      {
        SessionStart: fc.array(otherEntry, { maxLength: 2 }),
        Stop: fc.array(otherEntry, { maxLength: 2 }),
        PreToolUse: fc.array(otherEntry, { maxLength: 2 })
      },
      { requiredKeys: [] }
    )
  },
  { requiredKeys: [] }
)

const clean = (o: unknown): unknown => JSON.parse(JSON.stringify(o))

/**
 * Compare settings as Claude Code would read them: key order is irrelevant, and an empty `hooks`
 * object or an empty list for an event means the same as leaving it out.
 */
function same(a: unknown, b: unknown): boolean {
  const norm = (o: any): any => {
    const c = JSON.parse(JSON.stringify(o))
    if (c.hooks && typeof c.hooks === 'object') {
      for (const ev of Object.keys(c.hooks)) if (Array.isArray(c.hooks[ev]) && c.hooks[ev].length === 0) delete c.hooks[ev]
      if (Object.keys(c.hooks).length === 0) delete c.hooks
    }
    return c
  }
  return isDeepStrictEqual(norm(a), norm(b))
}

describe('mergeHooks', () => {
  it('adds an entry for every event on empty settings', () => {
    const out = mergeHooks({}, CMD)
    expect(hasHooks(out)).toBe(true)
    for (const e of HOOK_EVENTS) expect(out.hooks[e]).toHaveLength(1)
  })

  it('is idempotent', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const once = mergeHooks(clean(s), CMD)
        const twice = mergeHooks(once, CMD)
        return same(once, twice)
      })
    )
  })

  it('never removes or changes anything that was already there', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const before = clean(s) as any
        const out = mergeHooks(clean(s), CMD)
        for (const k of Object.keys(before)) {
          if (k === 'hooks') continue
          if (JSON.stringify(out[k]) !== JSON.stringify(before[k])) return false
        }
        for (const [ev, entries] of Object.entries(before.hooks ?? {}) as [string, unknown[]][]) {
          for (const entry of entries) {
            if (!out.hooks[ev].some((e: unknown) => JSON.stringify(e) === JSON.stringify(entry))) return false
          }
        }
        return true
      })
    )
  })

  it('does not mutate its input', () => {
    const input = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }
    const snapshot = JSON.stringify(input)
    mergeHooks(input, CMD)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('replaces an older entry of ours with the new command', () => {
    const oldCmd = `node "D:/old/${HOOK_MARKER}.js" "D:/old/events"`
    const out = mergeHooks(mergeHooks({}, oldCmd), CMD)
    for (const e of HOOK_EVENTS) {
      expect(out.hooks[e]).toHaveLength(1)
      expect(out.hooks[e][0].hooks[0].command).toBe(CMD)
    }
  })
})

describe('removeHooks', () => {
  it('undoes mergeHooks exactly', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        return same(removeHooks(mergeHooks(clean(s) as any, CMD)), clean(s))
      })
    )
  })

  it('leaves settings without our hooks byte for byte unchanged', () => {
    fc.assert(fc.property(settingsArb, (s) => JSON.stringify(removeHooks(clean(s) as any)) === JSON.stringify(clean(s))))
  })

  it('hasHooks is false after removal', () => {
    expect(hasHooks(removeHooks(mergeHooks({}, CMD)))).toBe(false)
  })
})
