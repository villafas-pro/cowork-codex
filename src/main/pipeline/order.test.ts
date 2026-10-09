import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { applyOrder } from './order'

describe('applyOrder', () => {
  it('uses the requested order', () => {
    expect(applyOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })
  it('keeps cards that were not listed, after the listed ones, in their old order', () => {
    expect(applyOrder(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })
  it('ignores unknown and duplicate keys', () => {
    expect(applyOrder(['a', 'b'], ['zzz', 'b', 'b', 'a'])).toEqual(['b', 'a'])
  })
  it('always returns the same set of cards', () => {
    fc.assert(fc.property(fc.uniqueArray(fc.nat(30)), fc.array(fc.nat(40)), (cur, req) => {
      const out = applyOrder(cur.map(String), req.map(String))
      expect([...out].sort()).toEqual(cur.map(String).sort())
    }))
  })
})
