import React from 'react'
import { Home, FileText, Code2, GitBranch, CheckSquare, Image, Settings, Sun, Moon, AlertTriangle } from 'lucide-react'
import { useAppStore, type Section } from '../../store/appStore'

const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home size={18} /> },
  { id: 'notes', label: 'Notes', icon: <FileText size={18} /> },
  { id: 'code', label: 'Code', icon: <Code2 size={18} /> },
  { id: 'flow', label: 'Flow', icon: <GitBranch size={18} /> },
  { id: 'work-items', label: 'Work Items', icon: <CheckSquare size={18} /> },
  { id: 'images', label: 'Images', icon: <Image size={18} /> }
]

export default function Sidebar(): React.JSX.Element {
  const { activeSection, setActiveSection, theme, toggleTheme, viewMode, adoStatus } = useAppStore()
  const adoError = adoStatus === 'error'

  return (
    <aside className="flex flex-col w-[52px] h-full bg-th-bg-0 border-r border-th-bd-2 py-3 items-center titlebar-no-drag flex-shrink-0">
      {/* Logo */}
      <div className="mb-5 flex-shrink-0">
        <svg width="32" height="32" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="128" height="128" rx="22" fill="#141414"/>
          <rect x="26" y="17" width="62" height="76" rx="5" fill="#2c2c2c" transform="rotate(-7 56 55)"/>
          <path d="M 36 23 L 84 23 L 104 43 L 104 113 L 36 113 Z" fill="#202020"/>
          <path d="M 84 23 L 104 43 L 84 43 Z" fill="#e8b800"/>
          <line x1="84" y1="23" x2="104" y2="43" stroke="#0d0d0d" strokeWidth="1.5" opacity="0.5"/>
          <path d="M 54 51 L 48 57 L 54 63" stroke="#e8b800" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <line x1="58" y1="57" x2="92" y2="57" stroke="#2e2e2e" strokeWidth="3" strokeLinecap="round"/>
          <line x1="48" y1="70" x2="92" y2="70" stroke="#272727" strokeWidth="3" strokeLinecap="round"/>
          <line x1="48" y1="83" x2="78" y2="83" stroke="#2e2e2e" strokeWidth="3" strokeLinecap="round"/>
          <path d="M 81 78 L 87 83 L 81 88" stroke="#e8b800" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 flex-1 w-full px-1.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            title={item.id === 'work-items' && adoError ? 'Work Items — ADO connection error' : item.label}
            onClick={() => setActiveSection(item.id)}
            className={`
              relative w-full flex items-center justify-center p-2.5 rounded-md transition-all duration-150
              ${
                activeSection === item.id && viewMode !== 'tab'
                  ? 'bg-th-bg-6 text-accent'
                  : 'text-th-tx-4 hover:text-th-tx-2 hover:bg-th-bg-4'
              }
            `}
          >
            {item.icon}
            {item.id === 'work-items' && adoError && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-1 ring-th-bg-0" />
            )}
          </button>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="flex flex-col gap-1 w-full px-1.5">
        {adoError && (
          <button
            title="ADO connection error — click to go to Settings"
            onClick={() => setActiveSection('settings')}
            className="w-full flex items-center justify-center p-2.5 rounded-md text-amber-500 hover:bg-th-bg-4 transition-all duration-150"
          >
            <AlertTriangle size={15} />
          </button>
        )}
        <button
          title="Toggle theme"
          onClick={toggleTheme}
          className="w-full flex items-center justify-center p-2.5 rounded-md text-th-tx-4 hover:text-th-tx-2 hover:bg-th-bg-4 transition-all duration-150"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          title="Settings"
          onClick={() => setActiveSection('settings')}
          className={`w-full flex items-center justify-center p-2.5 rounded-md transition-all duration-150 ${activeSection === 'settings' && viewMode !== 'tab' ? 'bg-th-bg-6 text-accent' : 'text-th-tx-4 hover:text-th-tx-2 hover:bg-th-bg-4'}`}
        >
          <Settings size={16} />
        </button>
      </div>
    </aside>
  )
}
