/** Shared work-item constants and helpers used across editors, pages, and search. */

export interface WorkItem {
  id: string
  url: string
  item_number: string
  is_done: number
  is_ado: number
  cached_title: string | null
  cached_type: string | null
  cached_state: string | null
  cached_assigned_to: string | null
  created_at?: number
}

export const TYPE_COLORS: Record<string, string> = {
  'Bug': '#cc3333',
  'Task': '#007acc',
  'User Story': '#009933',
  'Feature': '#773b93',
  'Epic': '#ff6600',
  'Test Case': '#004b50',
}

export const STATE_COLORS: Record<string, string> = {
  'Active': '#007acc',
  'In Progress': '#007acc',
  'New': '#888',
  'Resolved': '#009933',
  'Done': '#009933',
  'Closed': '#555',
  'Removed': '#555',
}

export const DONE_STATES = new Set(['Closed', 'Resolved', 'Done', 'Removed'])

export function effectiveDone(item: WorkItem): boolean {
  if (item.is_ado && item.cached_state) return DONE_STATES.has(item.cached_state)
  return !!item.is_done
}
