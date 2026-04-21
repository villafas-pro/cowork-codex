import React from 'react'
import { ChevronLeft, ChevronRight, Search, X, Minus, Square } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

export default function TitleBar(): React.JSX.Element {
  const { navIndex, navHistory, goBack, goForward, tabs, activeTabId, setActiveTab, closeTab, setSearchOpen } =
    useAppStore()

  const canGoBack = navIndex > 0
  const canGoForward = navIndex < navHistory.length - 1

  return (
    <div className="flex items-center h-10 bg-th-bg-0 border-b border-th-bd-2 flex-shrink-0 titlebar-drag select-none">
      {/* Back/Forward */}
      <div className="flex items-center gap-0.5 px-2 titlebar-no-drag">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className={`p-1.5 rounded transition-all ${canGoBack ? 'text-th-tx-2 hover:text-th-tx-1 hover:bg-th-bg-6' : 'text-[#484848] cursor-default'}`}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className={`p-1.5 rounded transition-all ${canGoForward ? 'text-th-tx-2 hover:text-th-tx-1 hover:bg-th-bg-6' : 'text-[#484848] cursor-default'}`}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Tabs — container stays draggable; only individual tabs are no-drag */}
      <div className="flex items-center flex-1 overflow-x-auto h-full">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              titlebar-no-drag flex items-center gap-2 px-3 h-full border-r border-th-bd-1 cursor-pointer
              text-xs max-w-[180px] min-w-[100px] flex-shrink-0 transition-all duration-100
              ${activeTabId === tab.id ? 'bg-th-bg-4 text-th-tx-1' : 'text-th-tx-3 hover:text-th-tx-2 hover:bg-th-bg-3'}
            `}
          >
            <span className="truncate flex-1">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="flex-shrink-0 p-0.5 rounded hover:bg-[#3a3a3a] text-th-tx-4 hover:text-th-tx-2"
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
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-th-tx-3 hover:text-th-tx-1 hover:bg-th-bg-4 text-xs transition-all"
        >
          <Search size={13} />
          <span>Search</span>
          <span className="text-th-tx-5 ml-1">Ctrl+T</span>
        </button>
      </div>

      {/* Window controls */}
      <div className="flex items-center titlebar-no-drag">
        <button
          onClick={() => window.api?.window.minimize()}
          className="w-10 h-10 flex items-center justify-center text-th-tx-4 hover:text-th-tx-1 hover:bg-th-bg-4 transition-all"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => window.api?.window.maximize()}
          className="w-10 h-10 flex items-center justify-center text-th-tx-4 hover:text-th-tx-1 hover:bg-th-bg-4 transition-all"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.api?.window.close()}
          className="w-10 h-10 flex items-center justify-center text-th-tx-4 hover:text-th-tx-1 hover:bg-red-600 transition-all"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
