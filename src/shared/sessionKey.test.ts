import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { chooseSessionKey, type KeyInput, type Pin } from './sessionKey'

const ev = (event: KeyInput['event'], promptKey: string | null, branchKey: string | null): KeyInput => ({
  type: event === 'SessionStart' ? 'session_start' : event === 'SessionEnd' ? 'session_end' : 'heartbeat',
  event,
  promptKey,
  branchKey
})

const keyArb = fc.option(fc.constantFrom('OB-1', 'OB-2', 'OB-3'), { nil: null })
const eventArb = fc.constantFrom<KeyInput['event']>('SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd')
const pinArb = fc.option(
  fc.record({ key: fc.constantFrom('OB-1', 'OB-2', 'OB-3'), via: fc.constantFrom<Pin['via']>('prompt', 'branch') }),
  { nil: null }
)

describe('chooseSessionKey', () => {
  it('the ticket named in a prompt beats the branch', () => {
    expect(chooseSessionKey(null, ev('UserPromptSubmit', 'OB-12707', 'OB-12701'))).toEqual({ key: 'OB-12707', via: 'prompt' })
  })

  it('falls back to the branch on a prompt or a turn end when the prompt names no ticket', () => {
    expect(chooseSessionKey(null, ev('UserPromptSubmit', null, 'OB-12701'))).toEqual({ key: 'OB-12701', via: 'branch' })
    expect(chooseSessionKey(null, ev('Stop', null, 'OB-12701'))).toEqual({ key: 'OB-12701', via: 'branch' })
  })

  it('a branch alone does not pin a session at its start, because the prompt may name another ticket', () => {
    expect(chooseSessionKey(null, ev('SessionStart', null, 'OB-12701'))).toBeNull()
  })

  it('a session pinned by its prompt never moves', () => {
    const pin: Pin = { key: 'OB-12707', via: 'prompt' }
    expect(chooseSessionKey(pin, ev('UserPromptSubmit', 'OB-9', 'OB-12701'))).toEqual(pin)
    expect(chooseSessionKey(pin, ev('Stop', null, 'OB-12701'))).toEqual(pin)
    expect(chooseSessionKey(pin, ev('SessionEnd', null, null))).toEqual(pin)
  })

  it('a session pinned only by its branch moves to the ticket a prompt names, and otherwise stays', () => {
    const pin: Pin = { key: 'OB-12701', via: 'branch' }
    expect(chooseSessionKey(pin, ev('UserPromptSubmit', 'OB-12707', 'OB-12701'))).toEqual({ key: 'OB-12707', via: 'prompt' })
    expect(chooseSessionKey(pin, ev('Stop', null, 'OB-12702'))).toEqual(pin)
  })

  it('the end of a session is matched by its existing pin, and without one it has no ticket', () => {
    expect(chooseSessionKey(null, ev('SessionEnd', null, 'OB-1'))).toBeNull()
  })

  it('a pinned session always keeps a ticket', () => {
    fc.assert(
      fc.property(pinArb, eventArb, keyArb, keyArb, (pin, event, promptKey, branchKey) => {
        const out = chooseSessionKey(pin, ev(event, promptKey, branchKey))
        return pin === null || out !== null
      })
    )
  })

  it('only a prompt can change a pin, and only from a branch pin', () => {
    fc.assert(
      fc.property(pinArb, eventArb, keyArb, keyArb, (pin, event, promptKey, branchKey) => {
        const out = chooseSessionKey(pin, ev(event, promptKey, branchKey))
        if (!pin || !out || out.key === pin.key) return true
        return pin.via === 'branch' && out.via === 'prompt' && out.key === promptKey
      })
    )
  })

  it('never invents a ticket that was not offered', () => {
    fc.assert(
      fc.property(pinArb, eventArb, keyArb, keyArb, (pin, event, promptKey, branchKey) => {
        const out = chooseSessionKey(pin, ev(event, promptKey, branchKey))
        return out === null || [pin?.key, promptKey, branchKey].includes(out.key)
      })
    )
  })
})
