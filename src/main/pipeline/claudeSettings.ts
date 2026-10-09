// Adds and removes our entries in Claude Code's settings.json `hooks` section.
// Pure functions: they never touch the disk and never mutate their input. Anything that was
// already in the file is left exactly as it was.

export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd'] as const

/** Our hook script's file name. Commands containing it are ours. */
export const HOOK_MARKER = 'cowork-codex-pipeline-hook'

type Json = Record<string, any>

function isOurs(entry: any): boolean {
  return Array.isArray(entry?.hooks) && entry.hooks.some((h: any) => typeof h?.command === 'string' && h.command.includes(HOOK_MARKER))
}

export function removeHooks(settings: Json): Json {
  const out: Json = JSON.parse(JSON.stringify(settings ?? {}))
  if (!out.hooks || typeof out.hooks !== 'object') return out
  let removedAny = false
  for (const ev of Object.keys(out.hooks)) {
    if (!Array.isArray(out.hooks[ev])) continue
    const kept = out.hooks[ev].filter((e: unknown) => !isOurs(e))
    if (kept.length === out.hooks[ev].length) continue // nothing of ours here: leave it exactly as found
    removedAny = true
    if (kept.length === 0) delete out.hooks[ev]
    else out.hooks[ev] = kept
  }
  // Only tidy up an empty `hooks` object if our removal is what emptied it
  if (removedAny && Object.keys(out.hooks).length === 0) delete out.hooks
  return out
}

/** `command` is run for every event; our older entries are replaced, never duplicated. */
export function mergeHooks(settings: Json, command: string): Json {
  const out = removeHooks(settings)
  out.hooks = out.hooks ?? {}
  for (const ev of HOOK_EVENTS) {
    const list = Array.isArray(out.hooks[ev]) ? out.hooks[ev] : []
    list.push({ hooks: [{ type: 'command', command, timeout: 10 }] })
    out.hooks[ev] = list
  }
  return out
}

export function hasHooks(settings: Json): boolean {
  const hooks = settings?.hooks
  if (!hooks || typeof hooks !== 'object') return false
  return HOOK_EVENTS.every((ev) => Array.isArray(hooks[ev]) && hooks[ev].some(isOurs))
}
