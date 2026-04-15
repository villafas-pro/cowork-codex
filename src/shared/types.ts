// ─── Shared types between main and renderer ───────────────────────────────

export type EntityType = 'note' | 'code' | 'flow' | 'work-item'

export interface Note {
  id: string
  title: string
  content: string // TipTap JSON
  createdAt: number
  updatedAt: number
  isPinned: number // 0 or 1 (SQLite boolean)
  allWorkItemsDone: number // 0 or 1
}

export interface WorkItem {
  id: string
  url: string
  itemNumber: string
  isDone: number // 0 or 1
  createdAt: number
  updatedAt: number
}

export interface WorkItemLink {
  id: string
  workItemId: string
  entityType: EntityType
  entityId: string
}

export interface CodeBlock {
  id: string
  title: string
  language: string
  content: string
  noteId: string | null
  syncGroupId: string | null
  isPinned: number
  createdAt: number
  updatedAt: number
}

export interface Flow {
  id: string
  title: string
  contentJson: string // React Flow JSON
  noteId: string | null
  isPinned: number
  createdAt: number
  updatedAt: number
}

export interface NoteVersion {
  id: string
  noteId: string
  content: string
  createdAt: number
}

export interface NoteImage {
  id: string
  noteId: string
  filename: string
  data: Buffer
  createdAt: number
}

export interface Template {
  id: string
  name: string
  contentJson: string
  createdAt: number
}

export interface OpenTab {
  id: string
  entityType: EntityType
  entityId: string
  tabOrder: number
  isActive: number
}

export interface AppSettings {
  dbPath: string
  theme: 'dark' | 'light'
  isFirstLaunch: boolean
}
