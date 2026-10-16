// GitHub pull request status for the pipeline. Read-only: uses a fine-grained personal access
// token with "Pull requests: read" (and "Contents: read" for commit dates) on the repos in use.
import type { PrEvidence } from '../../shared/pipeline'

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export interface GhPull {
  state: string
  merged: boolean
  draft: boolean
  /** Login of whoever opened the PR */
  author?: string
  /** Logins currently requested for review */
  requestedReviewers?: string[]
  /** Team slugs currently requested for review */
  requestedTeams?: string[]
}

export interface GhReview {
  user: string
  state: string
  submitted_at: string
}

/**
 * Collapse a PR's reviews into what the dashboard needs.
 *  - PENDING (your own unsent) and DISMISSED reviews are ignored
 *  - each reviewer's decision is their latest APPROVED or CHANGES_REQUESTED; a later plain comment
 *    does not change it (same as GitHub)
 *  - any outstanding change request wins, then approval, then plain comments
 *  - commitsAfterReview: a commit newer than the latest review
 *  - humanRequested / humanReview: the same, for people only (Copilot, other bots and the PR author
 *    are left out). Needed because GitHub drops a reviewer from the requested list once they review.
 */
/** Copilot and any other bot account. Their reviews never count as a person looking at the PR. */
export function isBot(login: string): boolean {
  return /copilot/i.test(login) || /\[bot\]$/i.test(login)
}

function decide(reviews: GhReview[], commented: boolean): PrEvidence['review'] {
  const decision = new Map<string, string>()
  for (const r of reviews) {
    if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED') decision.set(r.user, r.state)
  }
  const decisions = [...decision.values()]
  return decisions.includes('CHANGES_REQUESTED')
    ? 'changes_requested'
    : decisions.includes('APPROVED')
      ? 'approved'
      : commented
        ? 'commented'
        : 'none'
}

export function summarizePr(pull: GhPull, reviews: GhReview[], commitDates: string[], reviewCommentCount: number): PrEvidence {
  const state: PrEvidence['state'] = pull.merged ? 'merged' : pull.state === 'closed' ? 'closed' : 'open'

  const counted = reviews
    .filter((r) => r.state !== 'PENDING' && r.state !== 'DISMISSED')
    // Ties broken by state so the input order never matters
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at) || a.state.localeCompare(b.state))

  const commented = counted.some((r) => r.state === 'COMMENTED') || reviewCommentCount > 0
  const review = decide(counted, commented)

  // People only: not Copilot or other bots, and not the author replying to their own threads
  const people = counted.filter((r) => !isBot(r.user) && r.user !== pull.author)
  const humanReview = decide(people, people.some((r) => r.state === 'COMMENTED'))
  const humanRequested =
    (pull.requestedReviewers ?? []).some((login) => !isBot(login)) || (pull.requestedTeams ?? []).length > 0

  const lastReview = counted.length ? Math.max(...counted.map((r) => Date.parse(r.submitted_at))) : null
  const lastCommit = commitDates.length ? Math.max(...commitDates.map((d) => Date.parse(d))) : null
  const commitsAfterReview = lastReview !== null && lastCommit !== null && lastCommit > lastReview

  return { state, draft: pull.draft, review, commitsAfterReview, humanRequested, humanReview }
}

export function parsePullUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/)
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null
}

/** Rivet tags tickets with `repo:owner/name`. Jira labels arrive as a "; " separated string. */
export function repoFromTags(tags: string): string | null {
  for (const raw of tags.split(';')) {
    const m = raw.trim().match(/^repo:([^/\s]+\/[^/\s]+)$/i)
    if (m) return m[1]
  }
  return null
}

// ─── API calls ────────────────────────────────────────────────────────────────

const API = 'https://api.github.com'

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'cowork-codex'
  }
}

async function errorFor(res: Response): Promise<string> {
  if (res.status === 401) return 'GitHub rejected the token. Create a new one and save it again.'
  if (res.status === 403) {
    if (res.headers.get('x-ratelimit-remaining') === '0') return 'GitHub rate limit reached. It resets within the hour.'
    return 'GitHub denied access. The token may need access to this repo, or SSO authorization for the organization.'
  }
  if (res.status === 404) return 'Not found. The token may not have access to this repo (private repos return 404).'
  return `GitHub returned HTTP ${res.status}`
}

export async function testToken(token: string): Promise<{ success: boolean; detail?: string; error?: string }> {
  try {
    const res = await fetch(`${API}/user`, { headers: headers(token) })
    if (!res.ok) return { success: false, error: await errorFor(res) }
    const me = (await res.json()) as { login?: string }
    return { success: true, detail: `Connected as ${me.login ?? 'unknown'}` }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Current status of one PR: three small requests (the PR, its reviews, its newest commit). */
export async function fetchPrEvidence(
  token: string,
  ref: { owner: string; repo: string; number: number }
): Promise<{ ok: true; pr: PrEvidence; url: string } | { ok: false; error: string }> {
  const base = `${API}/repos/${ref.owner}/${ref.repo}`
  try {
    const pullRes = await fetch(`${base}/pulls/${ref.number}`, { headers: headers(token) })
    if (!pullRes.ok) return { ok: false, error: await errorFor(pullRes) }
    const raw = (await pullRes.json()) as {
      state: string; merged: boolean; draft: boolean; html_url: string; review_comments?: number; head?: { sha?: string }
      user?: { login?: string }; requested_reviewers?: { login?: string }[]; requested_teams?: { slug?: string }[]
    }
    const pull: GhPull & { html_url: string; review_comments?: number; head?: { sha?: string } } = {
      ...raw,
      author: raw.user?.login,
      requestedReviewers: (raw.requested_reviewers ?? []).map((u) => u.login ?? '').filter(Boolean),
      requestedTeams: (raw.requested_teams ?? []).map((t) => t.slug ?? '').filter(Boolean)
    }

    let reviews: GhReview[] = []
    const reviewsRes = await fetch(`${base}/pulls/${ref.number}/reviews?per_page=100`, { headers: headers(token) })
    if (reviewsRes.ok) {
      reviews = ((await reviewsRes.json()) as any[]).map((r) => ({
        user: r.user?.login ?? '',
        state: String(r.state ?? ''),
        submitted_at: r.submitted_at ?? ''
      })).filter((r) => r.submitted_at)
    }

    const commitDates: string[] = []
    if (pull.head?.sha) {
      const cRes = await fetch(`${base}/commits/${pull.head.sha}`, { headers: headers(token) })
      if (cRes.ok) {
        const c = (await cRes.json()) as { commit?: { committer?: { date?: string } } }
        if (c.commit?.committer?.date) commitDates.push(c.commit.committer.date)
      }
    }

    return { ok: true, pr: summarizePr(pull, reviews, commitDates, pull.review_comments ?? 0), url: pull.html_url }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Find a PR that mentions the ticket key in its title. Returns the newest match, if any. */
export async function findPrByTicket(token: string, repoSlug: string, key: string): Promise<string | null> {
  const q = encodeURIComponent(`repo:${repoSlug} is:pr ${key} in:title`)
  const res = await fetch(`${API}/search/issues?q=${q}&sort=created&order=desc&per_page=1`, { headers: headers(token) })
  if (!res.ok) return null
  const data = (await res.json()) as { items?: { html_url: string }[] }
  return data.items?.[0]?.html_url ?? null
}
