// Reads the comments Rivet (the Jira-to-PR agent) leaves on a ticket. Pure functions, no I/O.
//
// Known comment shapes (from a real ticket):
//   "Rivet started on this ticket (session sesn_...). Dispatched by: <name>. Watch live: <url>"
//   "Rivet opened a draft pull request: <github pr url> -- run history: <url>"

export type RivetEvent =
  | { kind: 'dispatched'; sessionId: string | null; dispatchedBy: string | null; runUrl: string | null }
  | { kind: 'pr_opened'; prUrl: string; runUrl: string | null }

const PR_URL = /https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+\/pull\/\d+/

function cleanUrl(url: string | undefined): string | null {
  if (!url) return null
  const trimmed = url.replace(/[.,;:)\]]+$/, '')
  return trimmed || null
}

export function classifyRivetComment(text: string): RivetEvent | null {
  if (/Rivet started on this ticket/i.test(text)) {
    return {
      kind: 'dispatched',
      sessionId: text.match(/\(session\s+([A-Za-z0-9_]+)\)/)?.[1] ?? null,
      dispatchedBy: text.match(/Dispatched by:\s*(.+?)\.?\s*(?:Watch live|$)/i)?.[1]?.trim() || null,
      runUrl: cleanUrl(text.match(/Watch live:\s*(https?:\/\/\S+)/i)?.[1])
    }
  }
  if (/Rivet opened (?:a |the )?(?:draft )?pull request/i.test(text)) {
    const prUrl = text.match(PR_URL)?.[0]
    if (!prUrl) return null
    return { kind: 'pr_opened', prUrl, runUrl: cleanUrl(text.match(/run history:\s*(https?:\/\/\S+)/i)?.[1]) }
  }
  return null
}

/** Only comments from the Rivet bot account count, so a person quoting Rivet never moves a ticket. */
export function isRivetAuthor(name: string, configured: string): boolean {
  const a = name.trim().toLowerCase()
  const b = configured.trim().toLowerCase()
  return a !== '' && b !== '' && a === b
}

/** Jira's rendered comment HTML to plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/?(?:p|br|div|li|ul|ol|h[1-6]|tr|table|blockquote|pre)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
