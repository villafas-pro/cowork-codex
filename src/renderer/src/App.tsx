import React, { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import Sidebar from './components/layout/Sidebar'
import TitleBar from './components/layout/TitleBar'
import GlobalSearch from './components/layout/GlobalSearch'
import Home from './pages/Home'
import Notes from './pages/Notes'
import Code from './pages/Code'
import Flow from './pages/Flow'
import WorkItems from './pages/WorkItems'
import Images from './pages/Images'
import Settings from './pages/Settings'
import NoteEditor from './components/editors/NoteEditor'
import CodeEditor from './components/editors/CodeEditor'
import FlowEditor from './components/editors/FlowEditor'
import WorkItemViewer from './components/editors/WorkItemViewer'

/** Raw SQLite row returned by tabs:getAll */
interface RawTabRow {
  id: string
  entity_type: string
  entity_id: string
  tab_order: number
  is_active: number
  title: string
}

// Type augmentation for window.api
declare global {
  interface Window {
    api: {
      notes: {
        getAll: () => Promise<any[]>
        get: (id: string) => Promise<any>
        create: (data: object) => Promise<any>
        update: (id: string, data: object) => Promise<any>
        delete: (id: string) => Promise<any>
        togglePin: (id: string) => Promise<any>
        toggleLock: (id: string) => Promise<any>
        unlock: (id: string, password: string) => Promise<any>
        setPassword: (id: string, password: string) => Promise<any>
        removePassword: (id: string, password: string) => Promise<any>
        getVersions: (noteId: string) => Promise<any[]>
        search: (query: string) => Promise<any[]>
        getImages: () => Promise<any[]>
      }
      workItems: {
        getAll: () => Promise<any[]>
        getForEntity: (entityType: string, entityId: string) => Promise<any[]>
        create: (url: string, entityType?: string, entityId?: string) => Promise<any>
        link: (workItemId: string, entityType: string, entityId: string) => Promise<any>
        unlink: (workItemId: string, entityType: string, entityId: string) => Promise<any>
        toggleDone: (id: string) => Promise<any>
        delete: (id: string) => Promise<any>
        getLinks: (id: string) => Promise<any[]>
        getLinkedEntities: (itemNumber: string) => Promise<any[]>
        findByItemNumber: (itemNumber: string) => Promise<any | null>
      }
      code: {
        getAll: () => Promise<any[]>
        get: (id: string) => Promise<any>
        getForNote: (noteId: string) => Promise<any[]>
        create: (data: object) => Promise<any>
        update: (id: string, data: object) => Promise<any>
        delete: (id: string) => Promise<any>
        togglePin: (id: string) => Promise<any>
        syncBlocks: (sourceId: string, targetId: string) => Promise<any>
        import: (sourceId: string, targetNoteId: string, mode: 'copy' | 'sync') => Promise<any>
        getSyncLocations: (syncGroupId: string) => Promise<any[]>
      }
      flows: {
        getAll: () => Promise<any[]>
        get: (id: string) => Promise<any>
        create: (data: object) => Promise<any>
        update: (id: string, data: object) => Promise<any>
        delete: (id: string) => Promise<any>
        togglePin: (id: string) => Promise<any>
      }
      settings: {
        get: (key: string) => Promise<string | undefined>
        set: (key: string, value: string) => Promise<any>
      }
      shell: {
        openExternal: (url: string) => Promise<void>
      }
      tabs: {
        getAll: () => Promise<any[]>
        save: (tabs: object[]) => Promise<any>
      }
      todo: {
        get: () => Promise<any>
        save: (content: string) => Promise<any>
      }
      search: {
        global: (query: string) => Promise<any[]>
      }
      templates: {
        getAll: () => Promise<any[]>
        create: (name: string, contentJson: string) => Promise<any>
        delete: (id: string) => Promise<any>
      }
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
      }
      ado: {
        getConfig: () => Promise<any>
        setConfig: (config: object) => Promise<any>
        testConnection: () => Promise<any>
        search: (filters: object) => Promise<any[]>
        isConfigured: () => Promise<boolean>
        fetchWorkItem: (adoId: number, force?: boolean) => Promise<any>
        syncLinkedWorkItems: () => Promise<void>
      }
    }
  }
}

export default function App(): React.JSX.Element {
  const { activeSection, searchOpen, setSearchOpen, setTheme, setEditorFontSize, viewMode, tabs, activeTabId, restoreTabs, setAdoStatus } = useAppStore()

  // Check ADO connection status
  async function checkAdoConnection(): Promise<void> {
    const configured = await window.api?.ado.isConfigured()
    if (!configured) { setAdoStatus('unconfigured'); return }
    setAdoStatus('checking')
    try {
      const result = await window.api?.ado.testConnection()
      setAdoStatus(result?.success ? 'ok' : 'error')
    } catch {
      setAdoStatus('error')
    }
  }

  // Load persisted theme and restore tabs on startup
  useEffect(() => {
    async function loadSettings(): Promise<void> {
      const theme = (await window.api?.settings.get('theme')) as 'dark' | 'light' | undefined
      if (theme) setTheme(theme)

      const fontSize = (await window.api?.settings.get('editorFontSize')) as import('./store/appStore').EditorFontSize | undefined
      if (fontSize) setEditorFontSize(fontSize)

      // Check ADO connection and background sync
      checkAdoConnection()
      window.api?.ado.syncLinkedWorkItems().catch(() => {})

      const savedTabs = (await window.api?.tabs.getAll()) || []
      if (savedTabs.length > 0) {
        const restoredTabs = (savedTabs as RawTabRow[]).map((t) => ({
          id: t.id,
          entityType: t.entity_type as import('./store/appStore').EntityType,
          entityId: t.entity_id,
          title: t.title || 'Untitled'
        }))
        const activeRow = (savedTabs as RawTabRow[]).find((t) => t.is_active === 1)
        restoreTabs(restoredTabs, activeRow?.id ?? restoredTabs[restoredTabs.length - 1].id)
      }
    }
    loadSettings()
  }, [])

  // Re-check ADO connection every 5 minutes
  useEffect(() => {
    const interval = setInterval(checkAdoConnection, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-save tabs whenever they change (debounced 500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      window.api?.tabs.save(
        tabs.map((t, i) => ({
          id: t.id,
          entityType: t.entityType,
          entityId: t.entityId,
          tabOrder: i,
          isActive: t.id === activeTabId ? 1 : 0
        }))
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [tabs, activeTabId])

  // Register Ctrl+T for global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  const renderContent = (): React.JSX.Element => {
    // If a tab is active and user clicked a tab, show that item's editor
    if (viewMode === 'tab' && activeTabId) {
      const activeTab = tabs.find((t) => t.id === activeTabId)
      if (activeTab) {
        if (activeTab.entityType === 'note') {
          return <NoteEditor noteId={activeTab.entityId} />
        }
        if (activeTab.entityType === 'code') {
          return <CodeEditor blockId={activeTab.entityId} />
        }
        if (activeTab.entityType === 'flow') {
          return <FlowEditor flowId={activeTab.entityId} />
        }
        if (activeTab.entityType === 'work-item') {
          return <WorkItemViewer adoId={activeTab.entityId} />
        }
      }
    }

    // Otherwise show section view
    switch (activeSection) {
      case 'home': return <Home />
      case 'notes': return <Notes />
      case 'code': return <Code />
      case 'flow': return <Flow />
      case 'work-items': return <WorkItems />
      case 'images': return <Images />
      case 'settings': return <Settings />
      default: return <Home />
    }
  }

  return (
    <div className="flex flex-col h-screen bg-th-bg-0 text-th-tx-1 overflow-hidden">
      {/* Title bar with tabs */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 overflow-hidden bg-th-bg-2">
          {renderContent()}
        </main>
      </div>

      {/* Global search overlay */}
      <GlobalSearch />
    </div>
  )
}
