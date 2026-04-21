import React, { useEffect, useState, useCallback } from 'react'
import {
  RefreshCw, ExternalLink, User, GitBranch, Tag, Layers,
  AlertCircle, CheckCircle, Clock, Loader, ChevronRight,
  FileText, Code2, Workflow, Link2
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { EntityType } from '../../store/appStore'

interface CachedWorkItem {
  id: string
  title: string
  type: string
  state: string
  assigned_to: string
  created_by: string
  description: string
  acceptance_criteria: string
  tags: string
  iteration_path: string
  area_path: string
  priority: number | null
  story_points: number | null
  parent_id: number | null
  comment_count: number
  ado_url: string
  created_at_ado: string
  changed_at_ado: string
  last_synced_at: number
}

const TYPE_COLORS: Record<string, string> = {
  'Bug': '#cc3333',
  'Task': '#007acc',
  'User Story': '#009933',
  'Feature': '#773b93',
  'Epic': '#ff6600',
  'Test Case': '#004b50',
}

const STATE_COLORS: Record<string, string> = {
  'Active': '#007acc',
  'In Progress': '#007acc',
  'New': '#888888',
  'Resolved': '#009933',
  'Done': '#009933',
  'Closed': '#555555',
  'Removed': '#555555',
}

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

const PRIORITY_COLORS: Record<number, string> = {
  1: '#cc3333',
  2: '#e8b800',
  3: '#007acc',
  4: '#666',
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return '' }
}

function HtmlBlock({ html, label }: { html: string; label: string }): React.JSX.Element | null {
  if (!html || html.trim() === '') return null
  return (
    <section>
      <h3 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-2">{label}</h3>
      <div
        className="ado-html text-[14px] text-[#d0d0d0] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  )
}

interface LinkedEntity {
  entityType: EntityType
  entityId: string
  title: string
}

const ENTITY_ICONS: Record<EntityType, React.ReactNode> = {
  note: <FileText size={11} />,
  code: <Code2 size={11} />,
  flow: <Workflow size={11} />,
  'work-item': null,
}

export default function WorkItemViewer({ adoId }: { adoId: string }): React.JSX.Element {
  const { updateTabTitle, openTab } = useAppStore()
  const [item, setItem] = useState<CachedWorkItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [linkedEntities, setLinkedEntities] = useState<LinkedEntity[]>([])

  const load = useCallback(async (force = false) => {
    try {
      const result = await window.api?.ado.fetchWorkItem(parseInt(adoId, 10), force)
      if (result) {
        setItem(result)
        updateTabTitle(adoId, result.title || `#${adoId}`)
      } else {
        setError('Work item not found or ADO not configured.')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load work item.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [adoId])

  useEffect(() => {
    setLoading(true)
    setError('')
    setItem(null)
    setLinkedEntities([])
    load(false)
    window.api?.workItems.getLinkedEntities(adoId).then(setLinkedEntities).catch(() => {})
  }, [adoId])

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    await load(true)
  }

  const openParent = (): void => {
    if (item?.parent_id) {
      openTab({ entityType: 'work-item', entityId: String(item.parent_id), title: `#${item.parent_id}` })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader size={18} className="text-[#555] animate-spin" />
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle size={24} className="text-[#555]" />
        <p className="text-sm text-[#666]">{error || 'Work item unavailable'}</p>
        <button
          onClick={handleRefresh}
          className="px-3 py-1.5 rounded-lg border border-[#383838] text-xs text-[#aaa] hover:text-white hover:border-[#555] transition-all"
        >
          Retry
        </button>
      </div>
    )
  }

  const typeColor = TYPE_COLORS[item.type] || '#555'
  const stateColor = STATE_COLORS[item.state] || '#888'

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#303030] bg-[#141414] flex-shrink-0">
          {/* Type badge */}
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded flex-shrink-0"
            style={{ background: typeColor + '22', color: typeColor, border: `1px solid ${typeColor}44` }}
          >
            {item.type}
          </span>

          {/* State pill */}
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: stateColor + '22', color: stateColor }}
          >
            {item.state}
          </span>

          <span className="text-xs text-[#555] flex-shrink-0">#{item.id}</span>

          <div className="flex-1" />

          {/* Last synced */}
          <span className="text-[10px] text-[#444] flex-shrink-0">
            synced {timeAgo(item.last_synced_at)}
          </span>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh from ADO"
            className="p-1.5 rounded text-[#555] hover:text-[#ccc] hover:bg-[#222] transition-all flex-shrink-0 disabled:opacity-40"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>

          {/* Open in browser */}
          <button
            onClick={() => window.api?.shell.openExternal(item.ado_url)}
            title="Open in Azure DevOps"
            className="p-1.5 rounded text-[#555] hover:text-[#ccc] hover:bg-[#222] transition-all flex-shrink-0"
          >
            <ExternalLink size={12} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-7 flex flex-col gap-7">

            {/* Title */}
            <h1 className="text-xl font-semibold text-white leading-snug">{item.title}</h1>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
              {item.assigned_to && (
                <div className="flex items-center gap-2">
                  <User size={11} className="text-[#555] flex-shrink-0" />
                  <span className="text-[#666]">Assigned to</span>
                  <span className="text-[#ccc]">{item.assigned_to}</span>
                </div>
              )}
              {item.created_by && (
                <div className="flex items-center gap-2">
                  <User size={11} className="text-[#555] flex-shrink-0" />
                  <span className="text-[#666]">Created by</span>
                  <span className="text-[#ccc]">{item.created_by}</span>
                </div>
              )}
              {item.priority != null && (
                <div className="flex items-center gap-2">
                  <AlertCircle size={11} className="flex-shrink-0" style={{ color: PRIORITY_COLORS[item.priority] || '#888' }} />
                  <span className="text-[#666]">Priority</span>
                  <span style={{ color: PRIORITY_COLORS[item.priority] || '#ccc' }}>
                    {PRIORITY_LABELS[item.priority] || item.priority}
                  </span>
                </div>
              )}
              {item.story_points != null && (
                <div className="flex items-center gap-2">
                  <Layers size={11} className="text-[#555] flex-shrink-0" />
                  <span className="text-[#666]">Story points</span>
                  <span className="text-[#ccc]">{item.story_points}</span>
                </div>
              )}
              {item.iteration_path && (
                <div className="flex items-center gap-2 col-span-2">
                  <GitBranch size={11} className="text-[#555] flex-shrink-0" />
                  <span className="text-[#666]">Iteration</span>
                  <span className="text-[#ccc]">{item.iteration_path.split('\\').pop()}</span>
                  <span className="text-[#444] text-[10px]">{item.iteration_path}</span>
                </div>
              )}
              {item.parent_id && (
                <div className="flex items-center gap-2">
                  <ChevronRight size={11} className="text-[#555] flex-shrink-0" />
                  <span className="text-[#666]">Parent</span>
                  <button
                    onClick={openParent}
                    className="text-accent hover:underline transition-all"
                  >
                    #{item.parent_id}
                  </button>
                </div>
              )}
              {item.changed_at_ado && (
                <div className="flex items-center gap-2">
                  <Clock size={11} className="text-[#555] flex-shrink-0" />
                  <span className="text-[#666]">Updated</span>
                  <span className="text-[#ccc]">{formatDate(item.changed_at_ado)}</span>
                </div>
              )}
              {item.comment_count > 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle size={11} className="text-[#555] flex-shrink-0" />
                  <span className="text-[#666]">Comments</span>
                  <span className="text-[#ccc]">{item.comment_count}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {item.tags && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag size={11} className="text-[#555] flex-shrink-0" />
                {item.tags.split(';').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#252525] border border-[#383838] text-[#aaa]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-[#252525]" />

            {/* Description */}
            <HtmlBlock html={item.description} label="Description" />

            {/* Acceptance Criteria */}
            <HtmlBlock html={item.acceptance_criteria} label="Acceptance Criteria" />

            {/* Empty state */}
            {!item.description && !item.acceptance_criteria && (
              <p className="text-sm text-[#444] text-center py-4">No description provided.</p>
            )}

          </div>
        </div>
      </div>

      {/* Right panel — Linked In Codex */}
      <div className="w-56 flex-shrink-0 border-l border-[#303030] bg-[#111111] flex flex-col">
        <div className="flex items-center gap-1.5 px-3 py-3 border-b border-[#282828]">
          <Link2 size={12} className="text-[#666]" />
          <span className="text-xs text-[#888] font-medium uppercase tracking-wide">Linked In Codex</span>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {linkedEntities.length === 0 ? (
            <p className="text-xs text-[#333] text-center py-6">Not linked to anything</p>
          ) : (
            linkedEntities.map((e, i) => (
              <button
                key={i}
                onClick={() => openTab({ entityType: e.entityType, entityId: e.entityId, title: e.title })}
                className="w-full flex items-start gap-2 px-3 py-2 hover:bg-[#1a1a1a] transition-all text-left group"
              >
                <span className="text-[#555] group-hover:text-accent transition-colors flex-shrink-0 mt-0.5">
                  {ENTITY_ICONS[e.entityType] || <FileText size={11} />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-[#ddd] group-hover:text-accent transition-colors truncate leading-snug">
                    {e.title || 'Untitled'}
                  </p>
                  <p className="text-[10px] text-[#555] capitalize mt-0.5">{e.entityType}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

    </div>
  )
}
