import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { STAGES, deriveStage, stageIndex, type PrEvidence, type StageEvidence } from './pipeline'

const prArb: fc.Arbitrary<PrEvidence> = fc.record({
  state: fc.constantFrom('open', 'merged', 'closed'),
  draft: fc.boolean(),
  review: fc.constantFrom('none', 'commented', 'changes_requested', 'approved'),
  commitsAfterReview: fc.boolean()
})

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
      deriveStage({ ...empty, pr: { state: 'open', draft: true, review: 'none', commitsAfterReview: false } }).stage
    ).toBe('pr_ready')
  })

  it('an open PR with review activity is in the review loop', () => {
    for (const review of ['commented', 'changes_requested', 'approved'] as const) {
      const r = deriveStage({
        ...empty,
        rivetPrOpenedAt: 5,
        pr: { state: 'open', draft: false, review, commitsAfterReview: false }
      })
      expect(r.stage).toBe('review')
    }
    expect(
      deriveStage({
        ...empty,
        pr: { state: 'open', draft: false, review: 'none', commitsAfterReview: true }
      }).stage
    ).toBe('review')
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
