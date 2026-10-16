import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  SESSION_ACTIVE_MS, STAGES, STALE_AFTER_MS, activeSessions, deriveStage, isStale, stageIndex, transitionAlert,
  type HumanReview, type PrEvidence, type Stage, type StageEvidence
} from './pipeline'

const prArb: fc.Arbitrary<PrEvidence> = fc.record({
  state: fc.constantFrom('open', 'merged', 'closed'),
  draft: fc.boolean(),
  review: fc.constantFrom('none', 'commented', 'changes_requested', 'approved'),
  commitsAfterReview: fc.boolean(),
  humanRequested: fc.boolean(),
  humanReview: fc.constantFrom('none', 'commented', 'changes_requested', 'approved')
})

/** PR evidence for an open PR with no human involvement. */
const noHumans = { humanRequested: false, humanReview: 'none' as const }

const evidenceArb: fc.Arbitrary<StageEvidence> = fc.record({
  jiraDone: fc.boolean(),
  localActive: fc.boolean(),
  rivetDispatchedAt: fc.option(fc.integer({ min: 1 }), { nil: null }),
  rivetPrOpenedAt: fc.option(fc.integer({ min: 1 }), { nil: null }),
  pr: fc.option(prArb, { nil: null })
})

const empty: StageEvidence = {
  jiraDone: false,
  localActive: false,
  rivetDispatchedAt: null,
  rivetPrOpenedAt: null,
  pr: null
}

describe('transitionAlert', () => {
  const state = (stage: Stage, attention: 'pr_closed' | null = null, stale = false, humanReview: HumanReview = 'none') => ({
    stage, attention, stale, humanReview
  })
  const stateArb = fc.record({
    stage: fc.constantFrom<Stage>(...STAGES),
    attention: fc.constantFrom<'pr_closed' | null>(null, 'pr_closed'),
    stale: fc.boolean(),
    humanReview: fc.constantFrom<HumanReview>('none', 'commented', 'changes_requested', 'approved')
  })

  it('never alerts the first time a ticket is seen', () => {
    fc.assert(fc.property(stateArb, (next) => transitionAlert(null, next) === null))
  })

  it('never alerts when nothing changed', () => {
    fc.assert(fc.property(stateArb, (s) => transitionAlert(s, s) === null))
  })

  it('alerts when a ticket moves forward into PR ready, review or merged', () => {
    expect(transitionAlert(state('rivet'), state('pr_ready'))).toMatch(/PR ready/i)
    expect(transitionAlert(state('pr_ready'), state('review'))).toMatch(/review/i)
    expect(transitionAlert(state('review'), state('merged'))).toMatch(/merged/i)
    expect(transitionAlert(state('rivet'), state('merged'))).toMatch(/merged/i)
  })

  it('stays quiet for stages you caused yourself, and for going backwards', () => {
    expect(transitionAlert(state('assigned'), state('local'))).toBeNull()
    expect(transitionAlert(state('local'), state('rivet'))).toBeNull()
    expect(transitionAlert(state('review'), state('pr_ready'))).toBeNull()
    expect(transitionAlert(state('pr_ready'), state('rivet'))).toBeNull()
  })

  it('alerts when a PR gets closed without merging, once', () => {
    expect(transitionAlert(state('pr_ready'), state('pr_ready', 'pr_closed'))).toMatch(/closed/i)
    expect(transitionAlert(state('pr_ready', 'pr_closed'), state('pr_ready', 'pr_closed'))).toBeNull()
  })

  it('alerts when a ticket newly goes stale, but not while it stays stale', () => {
    expect(transitionAlert(state('rivet'), state('rivet', null, true))).toMatch(/stale|no change/i)
    expect(transitionAlert(state('rivet', null, true), state('rivet', null, true))).toBeNull()
  })

  it('alerts when a PR moves into final review', () => {
    expect(transitionAlert(state('pr_ready'), state('final_review'))).toMatch(/final review/i)
    expect(transitionAlert(state('review'), state('final_review'))).toMatch(/final review/i)
  })

  it('notes an approval, change request or comments that arrive during final review', () => {
    expect(transitionAlert(state('final_review'), state('final_review', null, false, 'approved'))).toMatch(/approved/i)
    expect(transitionAlert(state('final_review'), state('final_review', null, false, 'changes_requested'))).toMatch(/changes/i)
    expect(transitionAlert(state('final_review'), state('final_review', null, false, 'commented'))).toMatch(/comment/i)
    expect(transitionAlert(state('final_review', null, false, 'commented'), state('final_review', null, false, 'approved'))).toMatch(/approved/i)
  })

  it('does not note a reviewer outcome that is cleared, or one seen outside final review', () => {
    expect(transitionAlert(state('final_review', null, false, 'approved'), state('final_review'))).toBeNull()
    expect(transitionAlert(state('review'), state('review', null, false, 'approved'))).toBeNull()
  })

  it('going from final review back to review, or on to merged, behaves like any other move', () => {
    expect(transitionAlert(state('final_review'), state('review'))).toBeNull()
    expect(transitionAlert(state('final_review'), state('merged'))).toMatch(/merged/i)
  })

  it('any alert is a non-empty message', () => {
    fc.assert(
      fc.property(stateArb, stateArb, (a, b) => {
        const r = transitionAlert(a, b)
        return r === null || r.length > 0
      })
    )
  })
})

describe('isStale', () => {
  const stageArb = fc.constantFrom<Stage>(...STAGES)

  it('stages that are waiting on you or finished are never stale', () => {
    fc.assert(
      fc.property(fc.constantFrom<Stage>('assigned', 'local', 'merged'), fc.integer({ min: 0, max: 1e10 }), (s, age) =>
        isStale(s, 0, age) === false
      )
    )
  })

  it('waiting stages go stale exactly at their limit', () => {
    for (const s of ['rivet', 'pr_ready', 'review', 'final_review'] as const) {
      const limit = STALE_AFTER_MS[s] as number
      expect(isStale(s, 1000, 1000 + limit - 1)).toBe(false)
      expect(isStale(s, 1000, 1000 + limit)).toBe(true)
    }
  })

  it('once stale, always stale as time passes', () => {
    fc.assert(
      fc.property(stageArb, fc.integer({ min: 0, max: 1e9 }), fc.integer({ min: 0, max: 1e9 }), (s, age, extra) =>
        !isStale(s, 0, age) || isStale(s, 0, age + extra)
      )
    )
  })

  it('a future timestamp is never stale', () => {
    fc.assert(fc.property(stageArb, (s) => isStale(s, 5000, 1000) === false))
  })
})

describe('deriveStage', () => {
  it('no evidence means assigned', () => {
    expect(deriveStage(empty)).toEqual({ stage: 'assigned', localActive: false, attention: null })
  })

  it('always returns a known stage', () => {
    fc.assert(fc.property(evidenceArb, (e) => STAGES.includes(deriveStage(e).stage)))
  })

  it('a done Jira ticket is always merged', () => {
    fc.assert(fc.property(evidenceArb, (e) => deriveStage({ ...e, jiraDone: true }).stage === 'merged'))
  })

  it('a merged PR is always merged', () => {
    fc.assert(
      fc.property(evidenceArb, prArb, (e, pr) => deriveStage({ ...e, pr: { ...pr, state: 'merged' } }).stage === 'merged')
    )
  })

  it('the local badge never shows once merged', () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        const r = deriveStage(e)
        return r.stage !== 'merged' || r.localActive === false
      })
    )
  })

  it('local badge mirrors the evidence while not merged', () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        const r = deriveStage(e)
        return r.stage === 'merged' || r.localActive === e.localActive
      })
    )
  })

  it('a dispatch comment alone means rivet working', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1 }), fc.boolean(), (at, localActive) => {
        return deriveStage({ ...empty, rivetDispatchedAt: at, localActive }).stage === 'rivet'
      })
    )
  })

  it('a PR comment or a PR means PR ready, even without a dispatch comment', () => {
    expect(deriveStage({ ...empty, rivetPrOpenedAt: 5 }).stage).toBe('pr_ready')
    expect(
      deriveStage({ ...empty, pr: { state: 'open', draft: true, review: 'none', commitsAfterReview: false, ...noHumans } }).stage
    ).toBe('pr_ready')
  })

  it('an open PR with review activity is in the review loop', () => {
    for (const review of ['commented', 'changes_requested', 'approved'] as const) {
      const r = deriveStage({
        ...empty,
        rivetPrOpenedAt: 5,
        pr: { state: 'open', draft: false, review, commitsAfterReview: false, ...noHumans }
      })
      expect(r.stage).toBe('review')
    }
    expect(
      deriveStage({
        ...empty,
        pr: { state: 'open', draft: false, review: 'none', commitsAfterReview: true, ...noHumans }
      }).stage
    ).toBe('review')
  })

  it('final review sits between the review loop and merged', () => {
    expect(stageIndex('review')).toBeLessThan(stageIndex('final_review'))
    expect(stageIndex('final_review')).toBeLessThan(stageIndex('merged'))
  })

  it('an open PR with a human reviewer requested is in final review, whatever else is going on', () => {
    for (const review of ['none', 'commented', 'changes_requested', 'approved'] as const) {
      const r = deriveStage({
        ...empty,
        rivetPrOpenedAt: 5,
        pr: { state: 'open', draft: false, review, commitsAfterReview: true, humanRequested: true, humanReview: 'none' }
      })
      expect(r.stage).toBe('final_review')
    }
  })

  it('a human review keeps the PR in final review after the request is gone (an approval clears it on GitHub)', () => {
    for (const humanReview of ['commented', 'changes_requested', 'approved'] as const) {
      const r = deriveStage({
        ...empty,
        pr: { state: 'open', draft: false, review: humanReview, commitsAfterReview: false, humanRequested: false, humanReview }
      })
      expect(r.stage).toBe('final_review')
    }
  })

  it('without any human involvement, review activity stays in the review loop (Copilot only)', () => {
    expect(
      deriveStage({
        ...empty,
        pr: { state: 'open', draft: false, review: 'commented', commitsAfterReview: false, ...noHumans }
      }).stage
    ).toBe('review')
  })

  it('final review only applies to open PRs', () => {
    fc.assert(
      fc.property(evidenceArb, prArb, (e, pr) => {
        const stage = deriveStage({ ...e, pr: { ...pr, state: 'closed' } }).stage
        return stage !== 'final_review'
      })
    )
    fc.assert(
      fc.property(evidenceArb, prArb, (e, pr) => {
        return deriveStage({ ...e, pr: { ...pr, state: 'merged' } }).stage === 'merged'
      })
    )
  })

  it('final review is only ever the result of an open PR with human involvement', () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        if (deriveStage(e).stage !== 'final_review') return true
        return e.pr?.state === 'open' && (e.pr.humanRequested || e.pr.humanReview !== 'none') && !e.jiraDone
      })
    )
  })

  it('draft status never changes the stage', () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        if (!e.pr) return true
        const a = deriveStage({ ...e, pr: { ...e.pr, draft: true } })
        const b = deriveStage({ ...e, pr: { ...e.pr, draft: false } })
        return a.stage === b.stage
      })
    )
  })

  it('a closed, unmerged PR is flagged for attention and is not merged', () => {
    fc.assert(
      fc.property(evidenceArb, prArb, (e, pr) => {
        const r = deriveStage({ ...e, jiraDone: false, pr: { ...pr, state: 'closed' } })
        return r.attention === 'pr_closed' && r.stage !== 'merged'
      })
    )
  })

  it('attention is only ever set for closed PRs', () => {
    fc.assert(
      fc.property(evidenceArb, (e) => {
        const r = deriveStage(e)
        return r.attention === null || (e.pr?.state === 'closed' && r.stage !== 'merged')
      })
    )
  })

  it('new evidence never moves a ticket backwards', () => {
    fc.assert(
      fc.property(
        evidenceArb,
        fc.constantFrom('local', 'dispatch', 'prComment', 'done'),
        (e, kind) => {
          const before = stageIndex(deriveStage(e).stage)
          const next: StageEvidence = { ...e }
          if (kind === 'local') next.localActive = true
          if (kind === 'dispatch') next.rivetDispatchedAt = next.rivetDispatchedAt ?? 1
          if (kind === 'prComment') next.rivetPrOpenedAt = next.rivetPrOpenedAt ?? 1
          if (kind === 'done') next.jiraDone = true
          return stageIndex(deriveStage(next).stage) >= before
        }
      )
    )
  })
})

describe('activeSessions', () => {
  const now = 10_000_000_000
  const e = (sessionId: string, type: string, ago: number) => ({ sessionId, type, at: now - ago })

  it('a session is active until it ends, however long it has been idle within the window', () => {
    expect(activeSessions([e('a', 'heartbeat', 3 * 60 * 60 * 1000)], now)).toEqual(['a'])
    expect(activeSessions([e('a', 'session_start', 1000), e('a', 'heartbeat', 500)], now)).toEqual(['a'])
  })

  it('an ended session is not active', () => {
    expect(activeSessions([e('a', 'heartbeat', 2000), e('a', 'session_end', 1000)], now)).toEqual([])
  })

  it('a session with no news for longer than the backstop is treated as gone (it probably crashed)', () => {
    expect(activeSessions([e('a', 'heartbeat', SESSION_ACTIVE_MS - 1)], now)).toEqual(['a'])
    expect(activeSessions([e('a', 'heartbeat', SESSION_ACTIVE_MS)], now)).toEqual([])
  })

  it('one ended session does not hide another that is still open', () => {
    const out = activeSessions([e('a', 'session_end', 1000), e('b', 'heartbeat', 5000)], now)
    expect(out).toEqual(['b'])
  })

  it('lists the most recently active session first', () => {
    expect(activeSessions([e('a', 'heartbeat', 9000), e('b', 'heartbeat', 1000), e('c', 'heartbeat', 5000)], now)).toEqual(['b', 'c', 'a'])
  })

  it('only each session\'s latest event matters, whatever order the events arrive in', () => {
    const evArb = fc.record({
      sessionId: fc.constantFrom('a', 'b', 'c'),
      type: fc.constantFrom('session_start', 'heartbeat', 'session_end'),
      at: fc.integer({ min: now - 2 * SESSION_ACTIVE_MS, max: now })
    })
    fc.assert(
      fc.property(fc.array(evArb, { maxLength: 12 }), (events) => {
        const a = activeSessions(events, now)
        const b = activeSessions([...events].reverse(), now)
        return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
      })
    )
  })

  it('never reports an ended or expired session', () => {
    const evArb = fc.record({
      sessionId: fc.constantFrom('a', 'b', 'c'),
      type: fc.constantFrom('session_start', 'heartbeat', 'session_end'),
      at: fc.integer({ min: now - 2 * SESSION_ACTIVE_MS, max: now })
    })
    fc.assert(
      fc.property(fc.array(evArb, { maxLength: 12 }), (events) => {
        return activeSessions(events, now).every((id) => {
          const last = events.filter((x) => x.sessionId === id).sort((p, q) => q.at - p.at || (q.type === 'session_end' ? 1 : -1))[0]
          return last.type !== 'session_end' && now - last.at < SESSION_ACTIVE_MS
        })
      })
    )
  })
})
