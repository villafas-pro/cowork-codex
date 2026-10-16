import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { parsePullUrl, repoFromTags, summarizePr, type GhPull, type GhReview } from './github'

const open: GhPull = { state: 'open', merged: false, draft: false, author: 'rivet-author' }
const iso = (n: number): string => new Date(1_700_000_000_000 + n * 1000).toISOString()

const reviewArb: fc.Arbitrary<GhReview> = fc.record({
  user: fc.constantFrom('a', 'b', 'c'),
  state: fc.constantFrom('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING'),
  submitted_at: fc.integer({ min: 0, max: 10_000 }).map(iso)
})

describe('summarizePr state', () => {
  it('merged wins over the open/closed field', () => {
    for (const state of ['open', 'closed'] as const) {
      expect(summarizePr({ state, merged: true, draft: false }, [], [], 0).state).toBe('merged')
    }
  })
  it('maps open and closed, and passes draft through', () => {
    expect(summarizePr({ state: 'closed', merged: false, draft: false }, [], [], 0).state).toBe('closed')
    expect(summarizePr({ ...open, draft: true }, [], [], 0).draft).toBe(true)
  })
})

describe('summarizePr review', () => {
  it('no reviews and no comments means none', () => {
    expect(summarizePr(open, [], [iso(1)], 0)).toMatchObject({ review: 'none', commitsAfterReview: false })
  })

  it('pending and dismissed reviews do not count', () => {
    const reviews: GhReview[] = [
      { user: 'a', state: 'PENDING', submitted_at: iso(1) },
      { user: 'b', state: 'DISMISSED', submitted_at: iso(2) }
    ]
    expect(summarizePr(open, reviews, [iso(5)], 0)).toMatchObject({ review: 'none', commitsAfterReview: false })
  })

  it('inline review comments alone count as commented', () => {
    expect(summarizePr(open, [], [], 3).review).toBe('commented')
  })

  it('a comment-only review is commented', () => {
    expect(summarizePr(open, [{ user: 'a', state: 'COMMENTED', submitted_at: iso(1) }], [], 0).review).toBe('commented')
  })

  it('changes requested beats approval from someone else', () => {
    const reviews: GhReview[] = [
      { user: 'a', state: 'APPROVED', submitted_at: iso(1) },
      { user: 'b', state: 'CHANGES_REQUESTED', submitted_at: iso(2) }
    ]
    expect(summarizePr(open, reviews, [], 0).review).toBe('changes_requested')
  })

  it('the same reviewer approving later clears their own change request', () => {
    const reviews: GhReview[] = [
      { user: 'a', state: 'CHANGES_REQUESTED', submitted_at: iso(1) },
      { user: 'a', state: 'APPROVED', submitted_at: iso(2) }
    ]
    expect(summarizePr(open, reviews, [], 0).review).toBe('approved')
  })

  it('a later comment does not undo a change request', () => {
    const reviews: GhReview[] = [
      { user: 'a', state: 'CHANGES_REQUESTED', submitted_at: iso(1) },
      { user: 'a', state: 'COMMENTED', submitted_at: iso(2) }
    ]
    expect(summarizePr(open, reviews, [], 0).review).toBe('changes_requested')
  })

  it('review order in the input does not matter', () => {
    fc.assert(
      fc.property(fc.array(reviewArb, { maxLength: 8 }), fc.nat(5), fc.array(fc.integer({ min: 0, max: 10_000 }).map(iso), { maxLength: 4 }), (reviews, comments, commits) => {
        const a = summarizePr(open, reviews, commits, comments)
        const b = summarizePr(open, [...reviews].reverse(), commits, comments)
        return a.review === b.review && a.commitsAfterReview === b.commitsAfterReview
      })
    )
  })

  it('a review that counts is always reflected as activity', () => {
    fc.assert(
      fc.property(fc.array(reviewArb, { minLength: 1, maxLength: 8 }), (reviews) => {
        const counted = reviews.some((r) => r.state !== 'PENDING' && r.state !== 'DISMISSED')
        const out = summarizePr(open, reviews, [], 0)
        return counted ? out.review !== 'none' : out.review === 'none'
      })
    )
  })
})

describe('summarizePr commitsAfterReview', () => {
  const approved: GhReview[] = [{ user: 'a', state: 'APPROVED', submitted_at: iso(100) }]
  it('is true only when a commit is newer than the latest review', () => {
    expect(summarizePr(open, approved, [iso(99)], 0).commitsAfterReview).toBe(false)
    expect(summarizePr(open, approved, [iso(100)], 0).commitsAfterReview).toBe(false)
    expect(summarizePr(open, approved, [iso(50), iso(101)], 0).commitsAfterReview).toBe(true)
  })
  it('needs a review to be after', () => {
    expect(summarizePr(open, [], [iso(500)], 0).commitsAfterReview).toBe(false)
  })
})

describe('summarizePr human reviewers', () => {
  const copilot = 'Copilot'
  const withRequested = (requestedReviewers: string[], requestedTeams: string[] = []): GhPull => ({ ...open, requestedReviewers, requestedTeams })

  it('is empty with no reviewers requested and no reviews', () => {
    expect(summarizePr(open, [], [], 0)).toMatchObject({ humanRequested: false, humanReview: 'none' })
  })

  it('a requested person or team counts as a human request', () => {
    expect(summarizePr(withRequested(['alice']), [], [], 0).humanRequested).toBe(true)
    expect(summarizePr(withRequested([], ['core-devs']), [], [], 0).humanRequested).toBe(true)
  })

  it('Copilot (and other bots) requested for review is not a human request', () => {
    for (const bot of [copilot, 'copilot-pull-request-reviewer[bot]', 'github-actions[bot]']) {
      expect(summarizePr(withRequested([bot]), [], [], 0).humanRequested).toBe(false)
    }
    expect(summarizePr(withRequested([copilot, 'alice']), [], [], 0).humanRequested).toBe(true)
  })

  it('Copilot reviews and inline comments never count as a human review', () => {
    const reviews: GhReview[] = [
      { user: copilot, state: 'COMMENTED', submitted_at: iso(1) },
      { user: 'copilot-pull-request-reviewer[bot]', state: 'APPROVED', submitted_at: iso(2) }
    ]
    const out = summarizePr(open, reviews, [], 4)
    expect(out.humanReview).toBe('none')
    expect(out.review).not.toBe('none') // still visible to the review loop
  })

  it('the PR author replying to threads is not a human review', () => {
    const reviews: GhReview[] = [{ user: 'rivet-author', state: 'COMMENTED', submitted_at: iso(1) }]
    expect(summarizePr(open, reviews, [], 0).humanReview).toBe('none')
  })

  it('maps a person\'s review to approved, changes requested or commented', () => {
    expect(summarizePr(open, [{ user: 'alice', state: 'APPROVED', submitted_at: iso(1) }], [], 0).humanReview).toBe('approved')
    expect(summarizePr(open, [{ user: 'alice', state: 'CHANGES_REQUESTED', submitted_at: iso(1) }], [], 0).humanReview).toBe('changes_requested')
    expect(summarizePr(open, [{ user: 'alice', state: 'COMMENTED', submitted_at: iso(1) }], [], 0).humanReview).toBe('commented')
  })

  it('applies the same rules as the overall review: changes requested wins, then approval, a later comment does not undo', () => {
    const reviews: GhReview[] = [
      { user: 'alice', state: 'APPROVED', submitted_at: iso(1) },
      { user: 'bob', state: 'CHANGES_REQUESTED', submitted_at: iso(2) },
      { user: 'bob', state: 'COMMENTED', submitted_at: iso(3) }
    ]
    expect(summarizePr(open, reviews, [], 0).humanReview).toBe('changes_requested')
    expect(
      summarizePr(open, [
        { user: 'bob', state: 'CHANGES_REQUESTED', submitted_at: iso(1) },
        { user: 'bob', state: 'APPROVED', submitted_at: iso(2) }
      ], [], 0).humanReview
    ).toBe('approved')
  })

  it('pending and dismissed human reviews do not count', () => {
    const reviews: GhReview[] = [
      { user: 'alice', state: 'PENDING', submitted_at: iso(1) },
      { user: 'bob', state: 'DISMISSED', submitted_at: iso(2) }
    ]
    expect(summarizePr(open, reviews, [], 0).humanReview).toBe('none')
  })

  it('review order and Copilot noise never change the human result', () => {
    const humanArb: fc.Arbitrary<GhReview> = fc.record({
      user: fc.constantFrom('alice', 'bob'),
      state: fc.constantFrom('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING'),
      submitted_at: fc.integer({ min: 0, max: 10_000 }).map(iso)
    })
    const noiseArb: fc.Arbitrary<GhReview> = fc.record({
      user: fc.constantFrom(copilot, 'copilot-pull-request-reviewer[bot]', 'rivet-author'),
      state: fc.constantFrom('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'),
      submitted_at: fc.integer({ min: 0, max: 10_000 }).map(iso)
    })
    fc.assert(
      fc.property(fc.array(humanArb, { maxLength: 6 }), fc.array(noiseArb, { maxLength: 4 }), (humans, noise) => {
        const base = summarizePr(open, humans, [], 0).humanReview
        const mixed = summarizePr(open, [...noise, ...humans].reverse(), [], 0).humanReview
        return base === mixed
      })
    )
  })

  it('a human review is always reflected in the overall review', () => {
    fc.assert(
      fc.property(fc.array(reviewArb, { maxLength: 8 }), (reviews) => {
        const out = summarizePr(open, reviews, [], 0)
        return out.humanReview === 'none' || out.review !== 'none'
      })
    )
  })
})

describe('parsePullUrl', () => {
  it('splits a PR url', () => {
    expect(parsePullUrl('https://github.com/Budget-OpenBook/Openbook/pull/269')).toEqual({
      owner: 'Budget-OpenBook',
      repo: 'Openbook',
      number: 269
    })
  })
  it('rejects anything else', () => {
    expect(parsePullUrl('https://github.com/a/b/issues/3')).toBeNull()
    expect(parsePullUrl('not a url')).toBeNull()
    expect(parsePullUrl('https://example.com/a/b/pull/3')).toBeNull()
  })
})

describe('repoFromTags', () => {
  it('reads the repo label from the Jira labels string', () => {
    expect(repoFromTags('Accessibility; agent:partial; repo:Budget-OpenBook/Openbook; team:dev')).toBe('Budget-OpenBook/Openbook')
  })
  it('returns null without one, or with a malformed one', () => {
    expect(repoFromTags('Accessibility; team:dev')).toBeNull()
    expect(repoFromTags('repo:justname')).toBeNull()
    expect(repoFromTags('')).toBeNull()
  })
})
