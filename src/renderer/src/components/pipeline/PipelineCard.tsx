import React from 'react'
import { Activity, AlertTriangle, ArrowRightLeft, Clock, Code2, ExternalLink, FileText, GitBranch, GitPullRequest, Terminal, Trash2 } from 'lucide-react'
import RowMenu from '../RowMenu'
import { tagColor } from '../../lib/tags'
import {
  STAGE_META, STAGE_ORDER, finalReviewNote, parsePrUrl, timeAgo,
  type PipelineCategory, type PipelineItem
} from '../../lib/pipelineUi'

function tint(hex: string): string {
  return `${hex}26` // 15% alpha
}

/** Short PR status for the PR link, from GitHub when we have it. */
function prStatus(item: PipelineItem): string {
  const pr = item.pr
  if (!pr) return ''
  if (pr.state === 'merged') return 'merged'
  if (pr.state === 'closed') return 'closed'
  if (pr.humanReview === 'approved') return 'approved'
  if (pr.humanReview === 'changes_requested') return 'changes requested'
  if (pr.review === 'changes_requested') return 'changes requested'
  if (pr.review === 'approved') return 'approved'
  if (pr.draft) return 'draft'
  if (pr.review === 'commented') return 'commented'
  return 'open'
}

const NOTE_TONE = {
  wait: 'text-th-tx-3 bg-th-bg-6',
  good: 'text-green-400 bg-green-500/15',
  warn: 'text-amber-400 bg-amber-500/15',
  info: 'text-sky-400 bg-sky-500/15'
} as const

const ENTITY_ICON: Record<string, React.ReactNode> = {
  note: <FileText size={11} />,
  code: <Code2 size={11} />,
  flow: <GitBranch size={11} />
}

export default function PipelineCard({
  item,
  categories,
  showCategory,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onOpenTicket,
  onOpenLink,
  onOpenEntity,
  canOpenSession,
  onOpenSession,
  onMove,
  onRemove
}: {
  item: PipelineItem
  categories: PipelineCategory[]
  /** Show which category the card is in (used by the stage view) */
  showCategory: boolean
  draggable: boolean
  dragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onOpenTicket: () => void
  onOpenLink: (url: string) => void
  onOpenEntity: (entityType: string, entityId: string, title: string) => void
  /** The claude command can open sessions in the Desktop app */
  canOpenSession: boolean
  onOpenSession: (sessionId: string) => void
  onMove: (categoryId: string) => void
  onRemove: () => void
}): React.JSX.Element {
  const meta = STAGE_META[item.stage]
  const stageIdx = STAGE_ORDER.indexOf(item.stage)
  const pr = parsePrUrl(item.pr_url)
  const category = categories.find((c) => c.id === item.category_id)
  const catColor = category ? tagColor(category.color) : null
  const muted = !!category?.muted
  const reviewNote = item.stage === 'final_review' ? finalReviewNote(item.pr) : null

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-lg border border-th-bd-2 bg-th-bg-3 p-3 transition-all hover:border-th-bd-3 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${dragging ? 'opacity-40' : ''} ${muted ? 'opacity-80' : ''}`}
    >
      {/* Key and menu */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenTicket}
          className="font-mono text-xs text-accent hover:underline"
          title="Open the ticket in this app"
        >
          {item.item_key}
        </button>
        {item.type && <span className="text-[10px] uppercase tracking-wide text-th-tx-5 truncate">{item.type}</span>}
        <span className="flex-1" />
        <RowMenu
          items={[
            ...categories
              .filter((c) => c.id !== item.category_id)
              .map((c) => ({
                label: `Move to ${c.name}`,
                icon: <ArrowRightLeft size={13} />,
                onClick: () => onMove(c.id)
              })),
            { label: 'Remove from board', icon: <Trash2 size={13} />, danger: true, divider: true, onClick: onRemove }
          ]}
        />
      </div>

      {/* Title */}
      <button onClick={onOpenTicket} className="mt-1 block w-full text-left text-sm text-th-tx-1 leading-snug line-clamp-2 hover:text-accent">
        {item.title}
      </button>

      {/* Stage chips */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* In the stage view the column already says the stage, so the chip is hidden there */}
        {!showCategory && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-4"
            style={{ color: meta.color, backgroundColor: tint(meta.color) }}
            title={meta.hint}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${item.stage === 'local' ? 'animate-pulse' : ''}`} style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        )}
        {item.local_active && item.stage !== 'local' && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-4"
            style={{ color: STAGE_META.local.color, backgroundColor: tint(STAGE_META.local.color) }}
            title="A Claude Code session is active on this ticket"
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: STAGE_META.local.color }} />
            Local live
          </span>
        )}
        {item.stale && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 text-amber-400 bg-amber-500/15"
            title={`No change for ${timeAgo(item.stage_since)}. Longer than usual for this stage.`}
          >
            <Clock size={10} />
            Stale {timeAgo(item.stage_since)}
          </span>
        )}
        {reviewNote && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-4 ${NOTE_TONE[reviewNote.tone]}`}
            title="What the people reviewing this PR have done (Copilot and the PR author are not counted)"
          >
            {reviewNote.label}
          </span>
        )}
        {item.attention === 'pr_closed' && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 text-amber-400 bg-amber-500/15" title="The PR was closed without merging">
            <AlertTriangle size={10} />
            PR closed
          </span>
        )}
        {showCategory && category && catColor && (
          <span className="rounded-full px-2 py-0.5 text-[11px] leading-4" style={{ color: catColor.fg, backgroundColor: catColor.bg }}>
            {category.name}
          </span>
        )}
      </div>

      {/* Progress through the pipeline */}
      <div className="mt-2.5 flex gap-0.5" aria-hidden>
        {STAGE_ORDER.map((s, i) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full ${i <= stageIdx ? '' : 'bg-th-bg-6'}`}
            style={i <= stageIdx ? { backgroundColor: meta.color } : undefined}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-th-tx-5 truncate">
        {timeAgo(item.stage_since)} in this stage
        {item.jira_state ? ` · Jira: ${item.jira_state}` : ''}
      </p>

      {/* Links */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {item.url && (
          <LinkButton onClick={() => onOpenLink(item.url)} title="Open in Jira">
            <ExternalLink size={11} /> Jira
          </LinkButton>
        )}
        {pr && item.pr_url && (
          <LinkButton onClick={() => onOpenLink(item.pr_url as string)} title={`Open PR #${pr.number} in ${pr.repo}`}>
            <GitPullRequest size={11} /> #{pr.number}
            {prStatus(item) && <span className="text-th-tx-5">{prStatus(item)}</span>}
          </LinkButton>
        )}
        {item.run_url && (
          <LinkButton onClick={() => onOpenLink(item.run_url as string)} title="Open Rivet run history">
            <Activity size={11} /> Run
          </LinkButton>
        )}
        {canOpenSession && item.last_session && (
          <LinkButton
            onClick={() => onOpenSession((item.last_session as { session_id: string }).session_id)}
            title={`Open the Claude Code session${item.last_session.branch ? ` on ${item.last_session.branch}` : ''} in Claude Desktop`}
          >
            <Terminal size={11} /> Claude
          </LinkButton>
        )}
        {item.links.slice(0, 2).map((l) => (
          <LinkButton key={`${l.entity_type}-${l.entity_id}`} onClick={() => onOpenEntity(l.entity_type, l.entity_id, l.title)} title={`Open ${l.entity_type}: ${l.title}`}>
            {ENTITY_ICON[l.entity_type] ?? <FileText size={11} />}
            <span className="max-w-[90px] truncate">{l.title}</span>
          </LinkButton>
        ))}
        {item.links.length > 2 && <span className="text-[11px] text-th-tx-5">+{item.links.length - 2}</span>}
      </div>
    </div>
  )
}

function LinkButton({
  onClick,
  title,
  children
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 rounded-md border border-th-bd-2 px-1.5 py-0.5 text-[11px] text-th-tx-3 hover:text-th-tx-1 hover:bg-th-bg-5 transition-colors"
    >
      {children}
    </button>
  )
}
