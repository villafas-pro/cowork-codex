/**
 * Which ticket a Claude Code session belongs to. Pure and dependency free so it is easy to test.
 *
 * The hook reports two candidates: the ticket in the git branch name and the ticket named in the
 * prompt. The branch is only a guess about what the session is for (several sessions can share one
 * folder, and so one branch), while a prompt that names a ticket says it outright. So:
 *  - a ticket named in a prompt wins, and a session pinned that way never moves
 *  - a branch ticket is used when no prompt names one, but not at session start, because the first
 *    prompt may name a different ticket
 *  - a session pinned only by its branch moves to the ticket a later prompt names
 */

export type PinSource = 'prompt' | 'branch'

export interface Pin {
  key: string
  via: PinSource
}

export interface KeyInput {
  type: 'session_start' | 'heartbeat' | 'session_end'
  /** The hook event name: SessionStart, UserPromptSubmit, Stop or SessionEnd */
  event: string
  /** First ticket key written in the prompt, if any */
  promptKey: string | null
  /** Ticket key in the git branch name, if any */
  branchKey: string | null
}

/** The ticket this event belongs to, given what the session was already pinned to. `null` means not yet known. */
export function chooseSessionKey(pinned: Pin | null, ev: KeyInput): Pin | null {
  if (pinned?.via === 'prompt') return pinned
  if (ev.promptKey) return { key: ev.promptKey, via: 'prompt' }
  if (pinned) return pinned
  if (ev.type === 'heartbeat' && ev.branchKey) return { key: ev.branchKey, via: 'branch' }
  return null
}
