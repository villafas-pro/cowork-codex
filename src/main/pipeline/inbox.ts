/**
 * The Inbox is the first column of the board: tickets assigned to you that are not tracked yet.
 * This is the rule for what shows there. Pure, so it can be tested without Jira.
 */
export function selectInbox<T extends { id: string; provider: string }>(
  candidates: T[],
  tracked: Set<string>,
  hidden: Set<string>
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const c of candidates) {
    // Only Jira tickets can be tracked on the board
    if (c.provider !== 'jira') continue
    if (tracked.has(c.id) || hidden.has(c.id) || seen.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
  }
  return out
}
