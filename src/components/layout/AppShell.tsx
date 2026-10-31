import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { AppFooter } from './AppFooter'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'

const SIDEBAR_KEY = 'zeda.sidebar.collapsed'

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader />
      <div className="flex min-h-0 flex-1">
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      <AppFooter />
    </div>
  )
}
