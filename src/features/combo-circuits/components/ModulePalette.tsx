import { ChevronsDownUp, ChevronsUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GateSymbol } from '@/features/logic-gates/components/GateSymbol'
import type { LogicGate } from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import { listModules, type ModuleCategory } from '../lib/modules'

export const PALETTE_MIME = 'application/zeda-palette'

export type PalettePayload =
  | { kind: 'gate'; gateId: string; builtinKey?: string; name: string }
  | { kind: 'module'; moduleKey: string; name: string }

type Props = {
  gates: LogicGate[]
  /** Content-only mode for tab host */
  embedded?: boolean
  className?: string
}

type SectionId = 'gates' | ModuleCategory

const CATEGORY_ORDER: ModuleCategory[] = ['adder', 'encoder', 'decoder', 'ttl']
const ALL_SECTION_IDS: SectionId[] = ['gates', ...CATEGORY_ORDER]
const SECTION_KEY = 'zeda.circuits.paletteSections'

function readOpenSections(): Record<SectionId, boolean> {
  const defaults: Record<SectionId, boolean> = {
    gates: true,
    adder: true,
    encoder: true,
    decoder: true,
    ttl: true,
  }
  try {
    const raw = localStorage.getItem(SECTION_KEY)
    if (!raw) return defaults
    return { ...defaults, ...(JSON.parse(raw) as Record<SectionId, boolean>) }
  } catch {
    return defaults
  }
}

function persistSections(next: Record<SectionId, boolean>) {
  localStorage.setItem(SECTION_KEY, JSON.stringify(next))
}

/** 一级分组标题（可折叠） */
function PrimaryGroupHeader({
  open,
  title,
  onToggle,
}: {
  open: boolean
  title: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md bg-muted px-2.5 py-2 text-left text-xs font-bold tracking-wide text-foreground',
        'hover:bg-muted/80',
      )}
    >
      {open ? (
        <ChevronDown className="size-3.5 shrink-0" />
      ) : (
        <ChevronRight className="size-3.5 shrink-0" />
      )}
      <span className="truncate uppercase">{title}</span>
    </button>
  )
}

/** 二级分类标题（功能模块下） */
function CategoryHeader({
  open,
  title,
  onToggle,
}: {
  open: boolean
  title: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md border-l-[3px] border-primary bg-primary/5 px-2 py-1.5 text-left text-xs font-semibold text-foreground',
        'hover:bg-primary/10',
      )}
    >
      {open ? (
        <ChevronDown className="size-3.5 shrink-0 text-primary" />
      ) : (
        <ChevronRight className="size-3.5 shrink-0 text-primary" />
      )}
      <span className="truncate">{title}</span>
    </button>
  )
}

export function ModulePalette({ gates, embedded, className }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [openSections, setOpenSections] = useState(readOpenSections)
  const [modulesOpen, setModulesOpen] = useState(true)
  const modules = listModules()
  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  const filteredGates = useMemo(() => {
    if (!q) return gates
    return gates.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.builtinKey?.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q),
    )
  }, [gates, q])

  const filteredModules = useMemo(() => {
    if (!q) return modules
    return modules.filter((m) => {
      const label = t(`circuits.modules.${m.key}`).toLowerCase()
      const cat = t(`circuits.category.${m.category}`).toLowerCase()
      return (
        m.key.toLowerCase().includes(q) ||
        label.includes(q) ||
        cat.includes(q)
      )
    })
  }, [modules, q, t])

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      persistSections(next)
      return next
    })
  }

  const setAllSections = (open: boolean) => {
    const next = Object.fromEntries(
      ALL_SECTION_IDS.map((id) => [id, open]),
    ) as Record<SectionId, boolean>
    setOpenSections(next)
    persistSections(next)
  }

  const onDragStart = (e: React.DragEvent, payload: PalettePayload) => {
    e.dataTransfer.setData(PALETTE_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const gatesOpen = searching || openSections.gates
  const showModulesBody = searching || modulesOpen
  const anyOpen =
    modulesOpen || ALL_SECTION_IDS.some((id) => openSections[id])

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        !embedded && 'border-l bg-card',
        className,
      )}
    >
      <div className="shrink-0 space-y-2 border-b p-2">
        <div className="flex gap-1">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('circuits.paletteSearch')}
              className="h-8 pl-7 text-sm"
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            disabled={searching}
            aria-label={t('circuits.paletteToggleAll')}
            title={
              anyOpen
                ? t('circuits.paletteCollapseAll')
                : t('circuits.paletteExpandAll')
            }
            onClick={() => {
              const next = !anyOpen
              setModulesOpen(next)
              setAllSections(next)
            }}
          >
            {anyOpen ? (
              <ChevronsDownUp className="size-3.5" />
            ) : (
              <ChevronsUpDown className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {/* 一级：逻辑门 */}
        <section className="space-y-1.5 rounded-lg border bg-muted/15 p-2">
          <PrimaryGroupHeader
            open={gatesOpen}
            title={t('circuits.paletteGates')}
            onToggle={() => toggleSection('gates')}
          />
          {gatesOpen ? (
            <div className="space-y-1 pl-1">
              {filteredGates.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{t('common.empty')}</p>
              ) : (
                filteredGates.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    draggable
                    onDragStart={(e) =>
                      onDragStart(e, {
                        kind: 'gate',
                        gateId: g.id,
                        builtinKey: g.builtinKey,
                        name: g.name,
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-sm hover:border-primary/40 hover:bg-muted/40"
                  >
                    <GateSymbol
                      gate={g}
                      width={40}
                      height={24}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 truncate font-medium">{g.name}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </section>

        {/* 一级：功能模块 → 二级分类 */}
        <section className="space-y-1.5 rounded-lg border bg-muted/15 p-2">
          <PrimaryGroupHeader
            open={showModulesBody}
            title={t('circuits.paletteModules')}
            onToggle={() => setModulesOpen((v) => !v)}
          />
          {showModulesBody ? (
            <div className="space-y-2 pl-0.5">
              {CATEGORY_ORDER.map((cat) => {
                const items = filteredModules.filter((m) => m.category === cat)
                if (items.length === 0) return null
                const open = searching || openSections[cat]
                return (
                  <div key={cat} className="space-y-1 rounded-md bg-background/70 p-1">
                    <CategoryHeader
                      open={open}
                      title={t(`circuits.category.${cat}`)}
                      onToggle={() => toggleSection(cat)}
                    />
                    {open ? (
                      <div className="ml-1 space-y-1 border-l-2 border-primary/25 pl-2">
                        {items.map((m) => (
                          <button
                            key={m.key}
                            type="button"
                            draggable
                            onDragStart={(e) =>
                              onDragStart(e, {
                                kind: 'module',
                                moduleKey: m.key,
                                name: t(`circuits.modules.${m.key}`),
                              })
                            }
                            className="w-full rounded-md border bg-background px-2 py-1.5 text-left text-sm hover:border-primary/40 hover:bg-muted/40"
                          >
                            {t(`circuits.modules.${m.key}`)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
