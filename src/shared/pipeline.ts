/**
 * Pipeline stage logic. Pure and dependency free so it is easy to test.
 *
 * A ticket is in exactly one stage, taken from the strongest evidence we have:
 *   merged > final_review > review > pr_ready > rivet > local > assigned
 * A live Claude Code session does not move a ticket forward once Rivet has it; it shows as a badge.
 */

export type Stage = 'assigned' | 'local' | 'rivet' | 'pr_ready' | 'review' | 'final_review' | 'merged'

/** In pipeline order, earliest first. */
export const STAGES: Stage[] = ['assigned', 'local', 'rivet', 'pr_ready', 'review', 'final_review', 'merged']

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage)
}

const HOUR = 60 * 60 * 1000

/**
 * How long a ticket can sit in a stage before it is flagged as stale. `null` means never:
 * Assigned and Local are waiting on you rather than on a machine or a reviewer, and Merged is done.
 */
export const STALE_AFTER_MS: Record<Stage, number | null> = {
  assigned: null,
  local: null,
  rivet: 3 * HOUR,
  pr_ready: 24 * HOUR,
  review: 48 * HOUR,
  final_review: 48 * HOUR,
  merged: null
}

export function isStale(stage: Stage, since: number, now: number): boolean {
  const limit = STALE_AFTER_MS[stage]
  return limit !== null && now - since >= limit
}

/** What people (not Copilot or other bots, not the PR author) have done on a PR. */
export type HumanReview = 'none' | 'commented' | 'changes_requested' | 'approved'

export interface AlertState {
  stage: Stage
  attention: 'pr_closed' | null
  stale: boolean
  /** Outcome of the human reviews, used to note approvals and comments during final review */
  humanReview: HumanReview
}

/**
 * What, if anything, to tell the user when a ticket's state changes. Only events you did not cause
 * yourself and might want to act on: PR ready, review activity, merged, PR closed, gone stale.
 * `prev` is null the first time a ticket is seen, which never alerts.
 */
export function transitionAlert(prev: AlertState | null, next: AlertState): string | null {
  if (!prev) return null
  if (next.attention === 'pr_closed' && prev.attention !== 'pr_closed') return 'The PR was closed without merging'
  if (next.stage !== prev.stage && stageIndex(next.stage) > stageIndex(prev.stage)) {
    if (next.stage === 'pr_ready') return 'PR ready'
    if (next.stage === 'review') return 'Review activity on the PR'
    if (next.stage === 'final_review') return 'Sent for final review'
    if (next.stage === 'merged') return 'Merged'
    return null
  }
  if (next.stage === 'final_review' && prev.stage === 'final_review' && next.humanReview !== prev.humanReview) {
    if (next.humanReview === 'approved') return 'Approved by a reviewer'
    if (next.humanReview === 'changes_requested') return 'A reviewer requested changes'
    if (next.humanReview === 'commented') return 'A reviewer left comments'
  }
  if (next.stale && !prev.stale && next.stage === prev.stage) return 'No change for a while (stale)'
  return null
}

export interface PrEvidence {
  state: 'open' | 'merged' | 'closed'
  draft: boolean
  review: 'none' | 'commented' | 'changes_requested' | 'approved'
  /** New commits were pushed after the latest review */
  commitsAfterReview: boolean
  /** A person or team (not Copilot or another bot) is requested for review */
  humanRequested: boolean
  /** Outcome of reviews by people, ignoring Copilot, other bots and the PR author */
  humanReview: HumanReview
}

export interface StageEvidence {
  jiraDone: boolean
  /** A Claude Code session on this ticket is currently active */
  localActive: boolean
  /** Time of Rivet's "started on this ticket" comment */
  rivetDispatchedAt: number | null
  /** Time of Rivet's "opened a pull request" comment */
  rivetPrOpenedAt: number | null
  /** Live PR details from GitHub, when known */
  pr: PrEvidence | null
}

export interface StageResult {
  stage: Stage
  /** Show a "local session active" badge */
  localActive: boolean
  attention: 'pr_closed' | null
}

export function deriveStage(e: StageEvidence): StageResult {
  const merged = e.jiraDone || e.pr?.state === 'merged'
  const closedUnmerged = !merged && e.pr?.state === 'closed'

  let stage: Stage
  if (merged) stage = 'merged'
  else if (e.pr?.state === 'open' && (e.pr.humanRequested || e.pr.humanReview !== 'none')) stage = 'final_review'
  else if (e.pr?.state === 'open' && (e.pr.review !== 'none' || e.pr.commitsAfterReview)) stage = 'review'
  else if (e.rivetPrOpenedAt !== null || e.pr !== null) stage = 'pr_ready'
  else if (e.rivetDispatchedAt !== null) stage = 'rivet'
  else if (e.localActive) stage = 'local'
  else stage = 'assigned'

  return {
    stage,
    localActive: stage !== 'merged' && e.localActive,
    attention: closedUnmerged ? 'pr_closed' : null
  }
}
