// Renderer-side types and display info for the Pipeline dashboard.
// Keep Stage and BoardItem in step with src/shared/pipeline.ts and src/main/pipeline/index.ts.

export type Stage = 'assigned' | 'local' | 'rivet' | 'pr_ready' | 'review' | 'final_review' | 'merged'

export const STAGE_ORDER: Stage[] = ['assigned', 'local', 'rivet', 'pr_ready', 'review', 'final_review', 'merged']

export const STAGE_META: Record<Stage, { label: string; short: string; color: string; hint: string }> = {
  assigned: { label: 'Assigned', short: 'Assigned', color: '#9ca3af', hint: 'On your plate, not started' },
  local: { label: 'Local', short: 'Local', color: '#a78bfa', hint: 'A Claude Code session is working on it' },
  rivet: { label: 'Rivet working', short: 'Rivet', color: '#60a5fa', hint: 'Dispatched to Rivet' },
  pr_ready: { label: 'PR ready', short: 'PR ready', color: '#2dd4bf', hint: 'Rivet opened a pull request' },
  review: { label: 'In review loop', short: 'Review', color: '#fb923c', hint: 'PR has review activity (Copilot or automated), no person involved yet' },
  final_review: { label: 'Final review', short: 'Final', color: '#f472b6', hint: 'A person (not Copilot) is reviewing the PR' },
  merged: { label: 'Merged', short: 'Merged', color: '#4ade80', hint: 'PR merged or ticket done' }
}

/** "just now", "5m", "3h", "2d" */
export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** "Updated just now", "Updated 5m ago" */
export function updatedLabel(ts: number, now = Date.now()): string {
  const t = timeAgo(ts, now)
  return t === 'just now' ? 'Updated just now' : `Updated ${t} ago`
}

/** Pull request number and repo name from a GitHub PR URL. */
export function parsePrUrl(url: string | null): { repo: string; number: string } | null {
  const m = url?.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/)
  return m ? { repo: m[1], number: m[2] } : null
}

export interface PipelineCategory {
  id: string
  name: string
  color: string
  sort_order: number
  muted: number
  is_default: number
}

export type HumanReview = 'none' | 'commented' | 'changes_requested' | 'approved'

export interface PipelinePr {
  state: 'open' | 'merged' | 'closed'
  draft: boolean
  review: 'none' | 'commented' | 'changes_requested' | 'approved'
  commitsAfterReview: boolean
  /** A person or team (not Copilot) is requested for review */
  humanRequested: boolean
  /** Outcome of reviews by people, ignoring Copilot and the PR author */
  humanReview: HumanReview
}

/** What people have done on the PR during final review, for the card. */
export function finalReviewNote(pr: PipelinePr | null): { label: string; tone: 'wait' | 'good' | 'warn' | 'info' } | null {
  if (!pr) return null
  if (pr.humanReview === 'approved') return { label: 'Approved', tone: 'good' }
  if (pr.humanReview === 'changes_requested') return { label: 'Changes requested', tone: 'warn' }
  if (pr.humanReview === 'commented') return { label: 'Comments added', tone: 'info' }
  if (pr.humanRequested) return { label: 'Awaiting review', tone: 'wait' }
  return null
}

export interface PipelineItem {
  item_key: string
  category_id: string
  position: number
  added_via: 'manual' | 'rivet' | 'session'
  added_at: number
  title: string
  type: string
  jira_state: string
  state_category: string
  url: string
  priority: number | null
  stage: Stage
  stage_since: number
  local_active: boolean
  attention: 'pr_closed' | null
  stale: boolean
  pr_url: string | null
  pr: PipelinePr | null
  run_url: string | null
  session: { session_id: string; cwd: string; branch: string } | null
  last_session: { session_id: string; cwd: string; branch: string; active: boolean } | null
  links: { entity_type: string; entity_id: string; title: string }[]
}

export interface InboxItem {
  key: string
  title: string
  type: string
  state: string
  url: string
  project: string
  sprint: string
}

export interface PipelineInbox {
  items: InboxItem[]
  hiddenCount: number
}

export interface PipelineBoard {
  categories: PipelineCategory[]
  items: PipelineItem[]
  stageCounts: Record<Stage, number>
}

export interface ClaudeInfo {
  found: boolean
  version: string | null
  /** Claude Code is new enough for `claude --desktop --resume` */
  canOpenInDesktop: boolean
}

export interface HooksStatus {
  installed: boolean
  scriptExists: boolean
  settingsReadable: boolean
  settingsPath: string
  eventsDir: string
  nodeAvailable: boolean
  claude: ClaudeInfo
}

export interface PipelineSyncResult {
  added: string[]
  synced: number
  failed: number
  errors: string[]
}
