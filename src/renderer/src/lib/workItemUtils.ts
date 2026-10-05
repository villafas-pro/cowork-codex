/** Shared work-item constants and helpers used across editors, pages, and search. */

export type Provider = 'ado' | 'jira' | 'manual'
export type StateCategory = 'todo' | 'in_progress' | 'done' | ''

/** A work item row as returned by workItems:getAll / getForEntity */
export interface WorkItem {
  id: string
  url: string
  item_number: string
  is_done: number
  /** 1 when the item comes from an integration (ADO/Jira) and its state is managed there */
  is_tracked: number
  provider: Provider
  /** Project the item belongs to (ADO project, Jira project key) */
  container: string
  cached_title: string | null
  cached_type: string | null
  cached_state: string | null
  cached_state_category: StateCategory | null
  cached_assigned_to: string | null
  created_at?: number
}

/** Full item from integrations:fetchItem */
export interface CachedWorkItem {
  id: string
  provider: 'ado' | 'jira'
  container: string
  title: string
  type: string
  state: string
  state_category: StateCategory
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
  parent_key: string
  comment_count: number
  url: string
  created_at_ado: string
  changed_at_ado: string
  last_synced_at: number
}

export interface SearchResult {
  id: string
  title: string
  type: string
  state: string
  assignedTo: string
  iterationPath: string
  url: string
  provider: 'ado' | 'jira'
  container: string
  connectionId: string
}

/** Connection as shown in Settings (the token never reaches the renderer) */
export interface ConnectionInfo {
  id: string
  provider: 'ado' | 'jira'
  name: string
  baseUrl: string
  project: string
  email: string
  hasSecret: boolean
  secretUnreadable: boolean
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  ado: 'Azure DevOps',
  jira: 'Jira',
  manual: 'Link'
}

export const PROVIDER_SHORT: Record<Provider, string> = {
  ado: 'ADO',
  jira: 'Jira',
  manual: 'Link'
}

/** How an item number is shown: ADO "#123", Jira "OB-123" */
export function displayKey(provider: Provider | undefined, itemNumber: string): string {
  return provider === 'jira' || /\D/.test(itemNumber) ? itemNumber : `#${itemNumber}`
}

export const TYPE_COLORS: Record<string, string> = {
  // Azure DevOps
  'Bug': '#cc3333',
  'Task': '#007acc',
  'User Story': '#009933',
  'Feature': '#773b93',
  'Epic': '#ff6600',
  'Test Case': '#004b50',
  // Jira
  'Story': '#009933',
  'Sub-task': '#4a9fd8',
  'Subtask': '#4a9fd8',
  'Improvement': '#2e8b57',
  'New Feature': '#773b93',
  'Spike': '#b8860b',
}

export const STATE_COLORS: Record<string, string> = {
  'Active': '#007acc',
  'In Progress': '#007acc',
  'In Review': '#007acc',
  'New': '#888',
  'To Do': '#888',
  'Open': '#888',
  'Backlog': '#888',
  'Resolved': '#009933',
  'Done': '#009933',
  'Closed': '#555',
  'Removed': '#555',
}

const CATEGORY_COLORS: Record<string, string> = {
  todo: '#888',
  in_progress: '#007acc',
  done: '#009933',
}

/** Color for a state: exact name first, then its category, so custom Jira workflows still look right */
export function stateColor(state: string | null | undefined, category?: StateCategory | null): string {
  if (state && STATE_COLORS[state]) return STATE_COLORS[state]
  if (category && CATEGORY_COLORS[category]) return CATEGORY_COLORS[category]
  return '#888'
}

/** Whether an item counts as done. Integration items follow their source system's state. */
export function effectiveDone(item: WorkItem): boolean {
  if (item.is_tracked && item.cached_state_category) return item.cached_state_category === 'done'
  return !!item.is_done
}

/** Types and states offered in search filters. Union of ADO and Jira defaults. */
export const WORK_ITEM_TYPES = ['Bug', 'Task', 'User Story', 'Story', 'Feature', 'Epic', 'Sub-task', 'Test Case']
export const WORK_ITEM_STATES = ['New', 'To Do', 'Active', 'In Progress', 'In Review', 'Resolved', 'Done', 'Closed']
