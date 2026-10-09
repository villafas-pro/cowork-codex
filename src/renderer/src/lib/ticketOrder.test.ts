import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { compareKeys, sortKeys, nextDirection } from './ticketOrder'

describe('compareKeys', () => {
  it('orders numerically, not as text', () => {
    expect(['OB-10', 'OB-9', 'OB-100'].sort(compareKeys)).toEqual(['OB-9', 'OB-10', 'OB-100'])
  })
  it('groups by project prefix first', () => {
    expect(['PA-2', 'OB-5', 'PA-1', 'OB-12'].sort(compareKeys)).toEqual(['OB-5', 'OB-12', 'PA-1', 'PA-2'])
  })
  it('handles plain numeric ids (Azure DevOps) and puts unparseable keys last', () => {
    expect(['12', 'weird', '3'].sort(compareKeys)).toEqual(['3', '12', 'weird'])
  })
  it('is a consistent total order', () => {
    const key = fc.oneof(
      fc.tuple(fc.constantFrom('OB', 'PA', 'X'), fc.nat(5000)).map(([p, n]) => `${p}-${n}`),
      fc.nat(5000).map(String),
      fc.string({ maxLength: 4 })
    )
    fc.assert(fc.property(key, key, key, (a, b, c) => {
      expect(Math.sign(compareKeys(a, b))).toBe(-Math.sign(compareKeys(b, a)))
      if (compareKeys(a, b) <= 0 && compareKeys(b, c) <= 0) expect(compareKeys(a, c)).toBeLessThanOrEqual(0)
    }))
  })
})

describe('sortKeys / nextDirection', () => {
  it('sorts descending as the reverse of ascending', () => {
    const keys = ['OB-3', 'OB-1', 'PA-9', 'OB-20']
    expect(sortKeys(keys, 'desc')).toEqual([...sortKeys(keys, 'asc')].reverse())
  })
  it('does not mutate its input', () => {
    const keys = ['OB-3', 'OB-1']
    sortKeys(keys, 'asc')
    expect(keys).toEqual(['OB-3', 'OB-1'])
  })
  it('first click sorts ascending, then flips', () => {
    expect(nextDirection(['OB-3', 'OB-1'])).toBe('asc')
    expect(nextDirection(['OB-1', 'OB-3'])).toBe('desc')
    expect(nextDirection(['OB-3', 'OB-1'])).toBe('asc')
  })
})
