import React from 'react'
import { ChevronLeft, ChevronRight, Search, X, Minus, Square } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export default function TitleBar(): React.JSX.Element {
  const { navIndex, navHistory, goBack, goForward, tabs, activeTabId, setActiveTab, closeTab, setSearchOpen } =
    useAppStore()

  const canGoBack = navIndex > 0
  const canGoForward = navIndex < navHistory.length - 1

  return (
    <div className="flex items-center h-10 bg-[#0a0a0a] border-b border-[#2e2e2e] flex-shrink-0 titlebar-drag select-none">
      {/* Back/Forward */}
      <div className="flex items-center gap-0.5 px-2 titlebar-no-drag">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className={`p-1.5 rounded transition-all ${canGoBack ? 'text-[#aaa] hover:text-white hover:bg-[#2a2a2a]' : 'text-[#333] cursor-default'}`}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className={`p-1.5 rounded transition-all ${canGoForward ? 'text-[#aaa] hover:text-white hover:bg-[#2a2a2a]' : 'text-[#333] cursor-default'}`}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center flex-1 overflow-x-auto titlebar-no-drag h-full">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-3 h-full border-r border-[#2a2a2a] cursor-pointer
              text-xs max-w-[180px] min-w-[100px] flex-shrink-0 transition-all duration-100
              ${activeTabId === tab.id ? 'bg-[#1e1e1e] text-[#e5e5e5]' : 'text-[#666] hover:text-[#aaa] hover:bg-[#181818]'}
            `}
          >
            <span className="truncate flex-1">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="flex-shrink-0 p-0.5 rounded hover:bg-[#333] text-[#555] hover:text-[#aaa]"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* Search button */}
      <div className="px-2 titlebar-no-drag">
        <button
          onClick={() => setSearchOpen(true)}
          title="Search (Ctrl+T)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[#555] hover:text-[#aaa] hover:bg-[#1e1e1e] text-xs transition-all"
        >
          <Search size={13} />
          <span>Search</span>
          <span className="text-[#333] ml-1">Ctrl+T</span>
        </button>
      </div>

      {/* Window controls */}
      <div className="flex items-center titlebar-no-drag">
        <button
          onClick={() => window.api?.window.minimize()}
          className="w-10 h-10 flex items-center justify-center text-[#555] hover:text-[#aaa] hover:bg-[#1e1e1e] transition-all"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => window.api?.window.maximize()}
          className="w-10 h-10 flex items-center justify-center text-[#555] hover:text-[#aaa] hover:bg-[#1e1e1e] transition-all"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.api?.window.close()}
          className="w-10 h-10 flex items-center justify-center text-[#555] hover:text-white hover:bg-red-600 transition-all"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
