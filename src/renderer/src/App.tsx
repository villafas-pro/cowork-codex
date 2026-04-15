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
        getVersions: (noteId: string) => Promise<any[]>
        search: (query: string) => Promise<any[]>
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
    }
  }
}

export default function App(): React.JSX.Element {
  const { activeSection, searchOpen, setSearchOpen, setTheme } = useAppStore()

  // Load persisted theme on startup
  useEffect(() => {
    async function loadSettings(): Promise<void> {
      const theme = (await window.api?.settings.get('theme')) as 'dark' | 'light' | undefined
      if (theme) {
        setTheme(theme)
      }
    }
    loadSettings()
  }, [])

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

  const renderSection = (): React.JSX.Element => {
    switch (activeSection) {
      case 'home':
        return <Home />
      case 'notes':
        return <Notes />
      case 'code':
        return <Code />
      case 'flow':
        return <Flow />
      case 'work-items':
        return <WorkItems />
      default:
        return <Home />
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#141414] text-[#e5e5e5] overflow-hidden">
      {/* Title bar with tabs */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 overflow-hidden bg-[#171717]">
          {renderSection()}
        </main>
      </div>

      {/* Global search overlay */}
      <GlobalSearch />
    </div>
  )
}
