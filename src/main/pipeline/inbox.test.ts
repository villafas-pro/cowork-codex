import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { selectInbox } from './inbox'

const cand = (id: string, provider = 'jira') => ({ id, provider, title: `T ${id}` })

const idArb = fc.constantFrom('OB-1', 'OB-2', 'OB-3', 'OB-4', 'OB-5', 'OB-6')
const candArb = fc.record({ id: idArb, provider: fc.constantFrom('jira', 'ado'), title: fc.string({ maxLength: 8 }) })
const setArb = fc.array(idArb).map((a) => new Set(a))

describe('selectInbox', () => {
  it('keeps assigned Jira tickets that are neither tracked nor hidden, in order', () => {
    const out = selectInbox([cand('OB-3'), cand('OB-1'), cand('OB-2')], new Set(['OB-1']), new Set())
    expect(out.map((c) => c.id)).toEqual(['OB-3', 'OB-2'])
  })

  it('drops hidden tickets', () => {
    expect(selectInbox([cand('OB-1'), cand('OB-2')], new Set(), new Set(['OB-2'])).map((c) => c.id)).toEqual(['OB-1'])
  })

  it('drops non-Jira results, since only Jira tickets can be tracked', () => {
    expect(selectInbox([cand('123', 'ado'), cand('OB-1')], new Set(), new Set()).map((c) => c.id)).toEqual(['OB-1'])
  })

  it('never returns a tracked or hidden ticket, a non-Jira one, or a duplicate', () => {
    fc.assert(
      fc.property(fc.array(candArb), setArb, setArb, (cands, tracked, hidden) => {
        const out = selectInbox(cands, tracked, hidden)
        const ids = out.map((c) => c.id)
        return (
          out.every((c) => c.provider === 'jira' && !tracked.has(c.id) && !hidden.has(c.id)) &&
          new Set(ids).size === ids.length
        )
      })
    )
  })

  it('loses nothing it should keep', () => {
    fc.assert(
      fc.property(fc.array(candArb), setArb, setArb, (cands, tracked, hidden) => {
        const kept = new Set(selectInbox(cands, tracked, hidden).map((c) => c.id))
        return cands.every((c) => c.provider !== 'jira' || tracked.has(c.id) || hidden.has(c.id) || kept.has(c.id))
      })
    )
  })

  it('keeps the first occurrence when a ticket appears twice', () => {
    const out = selectInbox([{ ...cand('OB-1'), title: 'first' }, { ...cand('OB-1'), title: 'second' }], new Set(), new Set())
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('first')
  })

  it('is stable: running it on its own output changes nothing', () => {
    fc.assert(
      fc.property(fc.array(candArb), setArb, setArb, (cands, tracked, hidden) => {
        const once = selectInbox(cands, tracked, hidden)
        return JSON.stringify(selectInbox(once, tracked, hidden)) === JSON.stringify(once)
      })
    )
  })
})
