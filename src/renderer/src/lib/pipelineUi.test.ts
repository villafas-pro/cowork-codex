import { describe, it, expect } from 'vitest'
import { updatedLabel } from './pipelineUi'

describe('updatedLabel', () => {
  const now = 1_000_000_000
  it('says "Updated just now" without a stray "ago"', () => {
    expect(updatedLabel(now - 5_000, now)).toBe('Updated just now')
  })
  it('adds "ago" for minutes, hours and days', () => {
    expect(updatedLabel(now - 5 * 60_000, now)).toBe('Updated 5m ago')
    expect(updatedLabel(now - 3 * 3_600_000, now)).toBe('Updated 3h ago')
    expect(updatedLabel(now - 2 * 86_400_000, now)).toBe('Updated 2d ago')
  })
})
