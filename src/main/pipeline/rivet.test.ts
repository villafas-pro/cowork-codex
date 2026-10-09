import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { classifyRivetComment, htmlToText, isRivetAuthor } from './rivet'

const DISPATCH =
  'Rivet started on this ticket (session sesn_018ozZhXHjkVeVmqukpy5APP). Dispatched by: Sebastian Villafane Ramos. Watch live: https://rivet.sandbox.eunacloud.com/?ticket=OB-12064'
const PR =
  'Rivet opened a draft pull request: https://github.com/Budget-OpenBook/Openbook/pull/269 -- run history: https://rivet.sandbox.eunacloud.com/?ticket=OB-12064'

describe('classifyRivetComment', () => {
  it('reads the real dispatch comment', () => {
    expect(classifyRivetComment(DISPATCH)).toEqual({
      kind: 'dispatched',
      sessionId: 'sesn_018ozZhXHjkVeVmqukpy5APP',
      dispatchedBy: 'Sebastian Villafane Ramos',
      runUrl: 'https://rivet.sandbox.eunacloud.com/?ticket=OB-12064'
    })
  })

  it('reads the real PR comment', () => {
    expect(classifyRivetComment(PR)).toEqual({
      kind: 'pr_opened',
      prUrl: 'https://github.com/Budget-OpenBook/Openbook/pull/269',
      runUrl: 'https://rivet.sandbox.eunacloud.com/?ticket=OB-12064'
    })
  })

  it('also accepts a non-draft PR comment', () => {
    const r = classifyRivetComment('Rivet opened a pull request: https://github.com/a/b/pull/1')
    expect(r).toEqual({ kind: 'pr_opened', prUrl: 'https://github.com/a/b/pull/1', runUrl: null })
  })

  it('any owner, repo and PR number round-trips', () => {
    const name = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/)
    fc.assert(
      fc.property(name, name, fc.integer({ min: 1, max: 999999 }), (owner, repo, n) => {
        const url = `https://github.com/${owner}/${repo}/pull/${n}`
        const r = classifyRivetComment(`Rivet opened a draft pull request: ${url} -- run history: https://x.test/`)
        return r?.kind === 'pr_opened' && r.prUrl === url
      })
    )
  })

  it('ignores comments that are not from the Rivet workflow', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        if (/rivet/i.test(s)) return true
        return classifyRivetComment(s) === null
      })
    )
  })

  it('ignores a PR comment with no PR link', () => {
    expect(classifyRivetComment('Rivet opened a draft pull request')).toBeNull()
  })

  it('dispatch comment without a session id still counts', () => {
    const r = classifyRivetComment('Rivet started on this ticket. Dispatched by: Sam. Watch live: https://r.test/')
    expect(r?.kind).toBe('dispatched')
  })
})

describe('isRivetAuthor', () => {
  it('matches case-insensitively and ignores surrounding spaces', () => {
    expect(isRivetAuthor('Rivet Factory Agent', 'Rivet Factory Agent')).toBe(true)
    expect(isRivetAuthor('  rivet factory agent ', 'Rivet Factory Agent')).toBe(true)
  })
  it('rejects other people, including ones who quote Rivet', () => {
    expect(isRivetAuthor('Sebastian Villafane Ramos', 'Rivet Factory Agent')).toBe(false)
    expect(isRivetAuthor('', 'Rivet Factory Agent')).toBe(false)
    expect(isRivetAuthor('Rivet Factory Agent', '')).toBe(false)
  })
})

describe('htmlToText', () => {
  it('strips tags and decodes common entities', () => {
    expect(htmlToText('<p>Rivet opened a <strong>draft</strong> pull request: <a href="https://x.test/p">https://x.test/p</a></p>')).toBe(
      'Rivet opened a draft pull request: https://x.test/p'
    )
    expect(htmlToText('a &amp; b &lt; c &quot;d&quot; &#39;e&#39;&nbsp;f')).toBe('a & b < c "d" \'e\' f')
  })

  it('plain text without markup or entities is unchanged apart from trimming', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9 .,:/_-]{0,80}$/), (s) => {
        return htmlToText(`<p>${s}</p>`) === s.replace(/\s+/g, ' ').trim()
      })
    )
  })
})
