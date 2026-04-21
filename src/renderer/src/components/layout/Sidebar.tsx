import React from 'react'
import { Home, FileText, Code2, GitBranch, CheckSquare, Image, Settings, Sun, Moon } from 'lucide-react'
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
  const { activeSection, setActiveSection, theme, toggleTheme, viewMode } = useAppStore()

  return (
    <aside className="flex flex-col w-[52px] h-full bg-[#0a0a0a] border-r border-[#383838] py-3 items-center titlebar-no-drag flex-shrink-0">
      {/* Logo */}
      <div className="mb-5 w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
        <span className="text-white font-bold text-sm">CC</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 flex-1 w-full px-1.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            title={item.label}
            onClick={() => setActiveSection(item.id)}
            className={`
              w-full flex items-center justify-center p-2.5 rounded-md transition-all duration-150
              ${
                activeSection === item.id && viewMode !== 'tab'
                  ? 'bg-[#2e2e2e] text-accent'
                  : 'text-[#888] hover:text-[#d0d0d0] hover:bg-[#222]'
              }
            `}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="flex flex-col gap-1 w-full px-1.5">
        <button
          title="Toggle theme"
          onClick={toggleTheme}
          className="w-full flex items-center justify-center p-2.5 rounded-md text-[#888] hover:text-[#d0d0d0] hover:bg-[#222] transition-all duration-150"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          title="Settings"
          onClick={() => setActiveSection('settings')}
          className={`w-full flex items-center justify-center p-2.5 rounded-md transition-all duration-150 ${activeSection === 'settings' && viewMode !== 'tab' ? 'bg-[#2e2e2e] text-accent' : 'text-[#888] hover:text-[#d0d0d0] hover:bg-[#222]'}`}
        >
          <Settings size={16} />
        </button>
      </div>
    </aside>
  )
}
