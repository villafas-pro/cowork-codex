/**
 * Minimal clean-up for HTML coming back from work item systems before it is rendered with
 * dangerouslySetInnerHTML. Removes script/style/iframe blocks, inline event handlers and
 * javascript: URLs. This is defense in depth, not a full sanitizer.
 */
export function cleanHtml(html: string | undefined | null): string {
  if (!html) return ''
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2')
}
