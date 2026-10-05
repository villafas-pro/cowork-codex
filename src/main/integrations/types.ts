// Shared types for work item providers (Azure DevOps, Jira).

export type ProviderId = 'ado' | 'jira'
export type StateCategory = 'todo' | 'in_progress' | 'done'

/** A saved connection with its token already decrypted. Never send this to the renderer. */
export interface Connection {
  id: string
  provider: ProviderId
  name: string
  base_url: string
  /** ADO: project name. Jira: optional project key(s), comma separated, to scope search. */
  project: string
  /** Jira only: account email used for basic auth with the API token. */
  email: string
  secret: string
  created_at: number
}

/**
 * One work item in a provider-neutral shape. Field names match the cached_work_items table so
 * the renderer can use rows and fresh fetches interchangeably.
 * `id` is the item number: ADO "1234", Jira "OB-1234".
 */
export interface NormalizedItem {
  id: string
  provider: ProviderId
  connection_id: string
  container: string
  title: string
  type: string
  state: string
  state_category: StateCategory
  assigned_to: string
  created_by: string
  description: string // HTML
  acceptance_criteria: string // HTML
  tags: string // semicolon separated
  iteration_path: string // ADO iteration path, or Jira sprint name
  area_path: string
  priority: number | null // 1 critical .. 4 low
  story_points: number | null
  parent_id: number | null
  parent_key: string
  comment_count: number
  url: string
  created_at_ado: string
  changed_at_ado: string
  last_synced_at: number
}

export interface SearchFilters {
  search: string
  assignedToMe: boolean
  type: string
  state: string
  connectionId?: string
  /** Only return items that are not done/closed (used for "my open items") */
  excludeDone?: boolean
}

export interface SearchResult {
  id: string
  title: string
  type: string
  state: string
  assignedTo: string
  iterationPath: string
  url: string
  provider: ProviderId
  container: string
  connectionId: string
}

export interface ParsedRef {
  provider: ProviderId
  itemNumber: string
  container: string
  /** Canonical browser URL for the item */
  url: string
}

export interface TestResult {
  success: boolean
  error?: string
  detail?: string
}

export interface Provider {
  id: ProviderId
  /** Recognize a pasted URL or bare key. Returns null if it isn't an item for this provider. */
  parseRef(ref: string, connections: Connection[]): ParsedRef | null
  test(conn: Connection): Promise<TestResult>
  search(conn: Connection, filters: SearchFilters): Promise<SearchResult[]>
  fetch(conn: Connection, itemNumber: string): Promise<NormalizedItem | null>
}
