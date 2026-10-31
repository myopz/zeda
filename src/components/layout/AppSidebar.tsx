import { Boxes, CircuitBoard, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  collapsed: boolean
  onToggle: () => void
}

function navClass(isActive: boolean, collapsed: boolean) {
  return cn(
    'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    collapsed && 'justify-center px-0',
  )
}

export function AppSidebar({ collapsed, onToggle }: Props) {
  const { t } = useTranslation()

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-card transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className="flex h-12 items-center justify-between gap-2 border-b px-2">
        {!collapsed && (
          <span className="truncate px-2 text-sm font-semibold tracking-wide">
            {t('app.name')}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          className={cn(collapsed && 'mx-auto')}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        <NavLink
          to="/lgc"
          className={({ isActive }) => navClass(isActive, collapsed)}
          title={t('nav.logicGates')}
        >
          <CircuitBoard className="size-4 shrink-0" />
          {!collapsed && <span>{t('nav.logicGates')}</span>}
        </NavLink>
        <NavLink
          to="/clc"
          className={({ isActive }) => navClass(isActive, collapsed)}
          title={t('nav.comboCircuits')}
        >
          <Boxes className="size-4 shrink-0" />
          {!collapsed && <span>{t('nav.comboCircuits')}</span>}
        </NavLink>
      </nav>
    </aside>
  )
}
