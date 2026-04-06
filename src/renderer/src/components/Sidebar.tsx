import { LayoutDashboard, Clock, Settings } from 'lucide-react'
import { Page } from '../App'

interface SidebarProps {
  page: Page
  onPageChange: (page: Page) => void
  hotkey: string
}

const NAV_ITEMS: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
  { id: 'history', label: 'История', icon: Clock },
  { id: 'settings', label: 'Настройки', icon: Settings }
]

export function Sidebar({ page, onPageChange, hotkey }: SidebarProps): JSX.Element {
  return (
    <aside className="w-56 flex flex-col shrink-0" style={{ background: 'var(--surface-panel)', borderRight: '1px solid var(--border)', borderRadius: 'var(--radius-panel)' }}>
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = page === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                color: isActive ? 'var(--accent-on-bg)' : 'var(--text-3)',
                border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent'
              }}
            >
              <Icon size={18} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="px-3.5 py-2 text-xs" style={{ color: 'var(--text-4)' }}>
          {hotkey.replace('CommandOrControl', 'Ctrl').replace('CmdOrCtrl', 'Ctrl')} — запись
        </div>
      </div>
    </aside>
  )
}
