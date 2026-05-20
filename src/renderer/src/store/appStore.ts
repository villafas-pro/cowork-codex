import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type Section = 'home' | 'notes' | 'code' | 'flow' | 'work-items' | 'images' | 'settings'
export type EntityType = 'note' | 'code' | 'flow' | 'work-item'

export interface Tab {
  id: string
  entityType: EntityType
  entityId: string
  title: string
}

export interface NavEntry {
  section?: Section
  entityType?: EntityType
  entityId?: string
}

export type EditorFontSize = 'small' | 'medium' | 'large'
const FONT_SIZE_MAP: Record<EditorFontSize, string> = { small: '13px', medium: '15px', large: '17px' }

interface AppStore {
  // Theme
  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void
  toggleTheme: () => void

  // Editor font size
  editorFontSize: EditorFontSize
  setEditorFontSize: (size: EditorFontSize) => void

  // Active section (sidebar)
  activeSection: Section
  setActiveSection: (section: Section) => void

  // Open tabs
  tabs: Tab[]
  activeTabId: string | null
  openTab: (tab: Omit<Tab, 'id'>) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabTitle: (id: string, title: string) => void
  restoreTabs: (tabs: Tab[], activeTabId: string | null) => void

  // Navigation history (back/forward)
  navHistory: NavEntry[]
  navIndex: number
  navigate: (entry: NavEntry) => void
  goBack: () => void
  goForward: () => void

  // View mode: are we looking at a section list or a tab's content?
  viewMode: 'section' | 'tab'
  setViewMode: (mode: 'section' | 'tab') => void

  // Global search
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void

  // ADO connection status
  adoStatus: 'ok' | 'error' | 'unconfigured' | 'checking'
  setAdoStatus: (status: 'ok' | 'error' | 'unconfigured' | 'checking') => void

  // Confirm dialog
  confirmDialog: { message: string; resolve: (v: boolean) => void } | null
  showConfirm: (message: string) => Promise<boolean>
  resolveConfirm: (result: boolean) => void
}

// Apply default dark class immediately so there's no flash-of-light on startup
// (loadSettings in App.tsx will override this once the persisted preference loads)
document.documentElement.classList.add('dark')

export const useAppStore = create<AppStore>((set, get) => ({
  theme: 'dark',
  setTheme: (theme) => {
    set({ theme })
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.api?.settings.set('theme', theme)
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  activeSection: 'home',
  setActiveSection: (section) => {
    set({ activeSection: section, viewMode: 'section' })
    get().navigate({ section })
  },

  viewMode: 'section',
  setViewMode: (mode) => set({ viewMode: mode }),

  tabs: [],
  activeTabId: null,

  openTab: (tab) => {
    const { tabs, activeTabId } = get()
    const existing = tabs.find((t) => t.entityType === tab.entityType && t.entityId === tab.entityId)
    if (existing) {
      if (existing.id !== activeTabId) {
        get().navigate({ entityType: tab.entityType, entityId: tab.entityId })
      }
      set({ activeTabId: existing.id, viewMode: 'tab' })
      return
    }
    const newTab = { ...tab, id: uuidv4() }
    set({ tabs: [...tabs, newTab], activeTabId: newTab.id, viewMode: 'tab' })
    get().navigate({ entityType: tab.entityType, entityId: tab.entityId })
  },

  closeTab: (id) => {
    const { tabs, activeTabId, navHistory, navIndex } = get()
    const closedTab = tabs.find((t) => t.id === id)
    const idx = tabs.findIndex((t) => t.id === id)
    const newTabs = tabs.filter((t) => t.id !== id)
    let newActiveId = activeTabId
    if (activeTabId === id) {
      // Activate the tab to the left, or right
      const newActive = newTabs[idx - 1] || newTabs[idx] || null
      newActiveId = newActive?.id || null
    }
    // Prune all history entries for the closed tab so back/forward never
    // tries to navigate to something that no longer exists.
    let newHistory = navHistory
    let newNavIndex = navIndex
    if (closedTab) {
      const removedIndices = new Set<number>()
      newHistory = navHistory.filter((entry, i) => {
        if (entry.entityType === closedTab.entityType && entry.entityId === closedTab.entityId) {
          removedIndices.add(i)
          return false
        }
        return true
      })
      // Shift navIndex down by the number of removed entries that were at or before it
      const removedBeforeOrAt = [...removedIndices].filter((i) => i <= navIndex).length
      newNavIndex = Math.max(-1, navIndex - removedBeforeOrAt)
    }
    set({
      tabs: newTabs,
      activeTabId: newActiveId,
      viewMode: newTabs.length === 0 ? 'section' : get().viewMode,
      navHistory: newHistory,
      navIndex: newNavIndex,
    })
  },

  setActiveTab: (id) => {
    set({ activeTabId: id, viewMode: 'tab' })
    const tab = get().tabs.find((t) => t.id === id)
    if (tab) {
      get().navigate({ entityType: tab.entityType, entityId: tab.entityId })
    }
  },

  updateTabTitle: (entityId, title) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.entityId === entityId ? { ...t, title } : t))
    }))
  },

  restoreTabs: (tabs, activeTabId) => {
    if (tabs.length === 0) return
    set({ tabs, activeTabId, viewMode: activeTabId ? 'tab' : 'section' })
  },

  navHistory: [],
  navIndex: -1,

  navigate: (entry) => {
    const { navHistory, navIndex } = get()
    // Skip if the current entry is identical — avoids stacking duplicates when
    // the user clicks the same section or tab multiple times in a row.
    const current = navHistory[navIndex]
    if (
      current &&
      current.section === entry.section &&
      current.entityType === entry.entityType &&
      current.entityId === entry.entityId
    ) return
    const newHistory = navHistory.slice(0, navIndex + 1)
    newHistory.push(entry)
    set({ navHistory: newHistory, navIndex: newHistory.length - 1 })
  },

  goBack: () => {
    const { navIndex, navHistory, tabs } = get()
    if (navIndex <= 0) return
    // Walk backwards to find the nearest valid entry (skip any stale tab entries)
    let newIndex = navIndex - 1
    while (newIndex >= 0) {
      const entry = navHistory[newIndex]
      if (entry.section) break
      if (entry.entityId && tabs.find((t) => t.entityType === entry.entityType && t.entityId === entry.entityId)) break
      newIndex--
    }
    if (newIndex < 0) return
    const entry = navHistory[newIndex]
    set({ navIndex: newIndex })
    if (entry.section) {
      set({ activeSection: entry.section, viewMode: 'section' })
    } else if (entry.entityId) {
      const tab = tabs.find((t) => t.entityType === entry.entityType && t.entityId === entry.entityId)
      if (tab) set({ activeTabId: tab.id, viewMode: 'tab' })
    }
  },

  goForward: () => {
    const { navIndex, navHistory, tabs } = get()
    if (navIndex >= navHistory.length - 1) return
    // Walk forwards to find the nearest valid entry (skip any stale tab entries)
    let newIndex = navIndex + 1
    while (newIndex < navHistory.length) {
      const entry = navHistory[newIndex]
      if (entry.section) break
      if (entry.entityId && tabs.find((t) => t.entityType === entry.entityType && t.entityId === entry.entityId)) break
      newIndex++
    }
    if (newIndex >= navHistory.length) return
    const entry = navHistory[newIndex]
    set({ navIndex: newIndex })
    if (entry.section) {
      set({ activeSection: entry.section, viewMode: 'section' })
    } else if (entry.entityId) {
      const tab = tabs.find((t) => t.entityType === entry.entityType && t.entityId === entry.entityId)
      if (tab) set({ activeTabId: tab.id, viewMode: 'tab' })
    }
  },

  editorFontSize: 'medium',
  setEditorFontSize: (size) => {
    set({ editorFontSize: size })
    document.documentElement.style.setProperty('--editor-font-size', FONT_SIZE_MAP[size])
    window.api?.settings.set('editorFontSize', size)
  },

  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),

  adoStatus: 'unconfigured',
  setAdoStatus: (status) => set({ adoStatus: status }),

  confirmDialog: null,
  showConfirm: (message) =>
    new Promise((resolve) => {
      set({ confirmDialog: { message, resolve } })
    }),
  resolveConfirm: (result) => {
    const { confirmDialog } = get()
    confirmDialog?.resolve(result)
    set({ confirmDialog: null })
  },
}))
