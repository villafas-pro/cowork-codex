/**
 * Pipeline stage logic. Pure and dependency free so it is easy to test.
 *
 * A ticket is in exactly one stage, taken from the strongest evidence we have:
 *   merged > review > pr_ready > rivet > local > assigned
 * A live Claude Code session does not move a ticket forward once Rivet has it; it shows as a badge.
 */

export type Stage = 'assigned' | 'local' | 'rivet' | 'pr_ready' | 'review' | 'merged'

/** In pipeline order, earliest first. */
export const STAGES: Stage[] = ['assigned', 'local', 'rivet', 'pr_ready', 'review', 'merged']

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage)
}

export interface PrEvidence {
  state: 'open' | 'merged' | 'closed'
  draft: boolean
  review: 'none' | 'commented' | 'changes_requested' | 'approved'
  /** New commits were pushed after the latest review */
  commitsAfterReview: boolean
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
