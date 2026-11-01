import { ChevronsDownUp, ChevronsUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GateSymbol } from '@/features/logic-gates/components/GateSymbol'
import {
  gateGroupLabel,
  sortGateGroups,
} from '@/features/logic-gates/lib/groups'
import {
  DEFAULT_GATE_GROUP,
  type LogicGate,
} from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import {
  circuitGroupLabel,
  sortCircuitGroups,
} from '../lib/groups'
import { DEFAULT_CIRCUIT_GROUP, type ComboCircuit } from '../types'

export const PALETTE_MIME = 'application/zeda-palette'

export type PalettePayload =
  | { kind: 'gate'; gateId: string; builtinKey?: string; name: string }
  | { kind: 'module'; moduleKey: string; name: string }
  | { kind: 'circuit'; circuitId: string; name: string }

/** Cross-component drag state for touch / pointer (HTML5 DnD fails on many mobile browsers). */
export type PaletteDragState = {
  payload: PalettePayload
  startX: number
  startY: number
  moved: boolean
}

let activePaletteDrag: PaletteDragState | null = null

const DRAG_THRESHOLD_PX = 10

export function peekPaletteDrag(): PaletteDragState | null {
  return activePaletteDrag
}

export function clearPaletteDrag() {
  activePaletteDrag = null
}

export function notePaletteDragMove(clientX: number, clientY: number) {
  if (!activePaletteDrag) return
  const dx = clientX - activePaletteDrag.startX
  const dy = clientY - activePaletteDrag.startY
  if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
    activePaletteDrag = { ...activePaletteDrag, moved: true }
  }
}

type Props = {
  gates: LogicGate[]
  /** Catalog + custom circuits for the modules section */
  circuits?: ComboCircuit[]
  /** Exclude the circuit currently being edited */
  excludeCircuitId?: string
  /** Content-only mode for tab host */
  embedded?: boolean
  className?: string
}

const SECTION_KEY = 'zeda.circuits.paletteSections'

type OpenMap = Record<string, boolean>

function readOpenSections(): OpenMap {
  try {
    const raw = localStorage.getItem(SECTION_KEY)
    if (!raw) return { gates: true }
    return { gates: true, ...(JSON.parse(raw) as OpenMap) }
  } catch {
    return { gates: true }
  }
}

function persistSections(next: OpenMap) {
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

export function ModulePalette({
  gates,
  circuits = [],
  excludeCircuitId,
  embedded,
  className,
}: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [openSections, setOpenSections] = useState(readOpenSections)
  const [modulesOpen, setModulesOpen] = useState(true)
  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  const filteredGates = useMemo(() => {
    if (!q) return gates
    return gates.filter((g) => {
      const group = gateGroupLabel(g.group || DEFAULT_GATE_GROUP, t).toLowerCase()
      return (
        g.name.toLowerCase().includes(q) ||
        g.builtinKey?.toLowerCase().includes(q) ||
        group.includes(q) ||
        (g.group?.toLowerCase().includes(q) ?? false) ||
        (g.description?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [gates, q, t])

  const gateGroups = useMemo(() => {
    const map = new Map<string, LogicGate[]>()
    for (const g of filteredGates) {
      const key = g.group?.trim() || DEFAULT_GATE_GROUP
      const list = map.get(key) ?? []
      list.push(g)
      map.set(key, list)
    }
    return sortGateGroups(map.keys(), t).map((key) => ({
      key,
      label: gateGroupLabel(key, t),
      items: map.get(key)!,
    }))
  }, [filteredGates, t])

  const moduleCircuits = useMemo(() => {
    return circuits.filter((c) => c.id !== excludeCircuitId)
  }, [circuits, excludeCircuitId])

  const filteredCircuits = useMemo(() => {
    if (!q) return moduleCircuits
    return moduleCircuits.filter((c) => {
      const name = c.name.toLowerCase()
      const group = circuitGroupLabel(c.group, t).toLowerCase()
      const builtin =
        c.builtinKey != null
          ? t(`circuits.modules.${c.builtinKey}`).toLowerCase()
          : ''
      return (
        name.includes(q) ||
        group.includes(q) ||
        builtin.includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [moduleCircuits, q, t])

  const groups = useMemo(() => {
    const map = new Map<string, ComboCircuit[]>()
    for (const c of filteredCircuits) {
      const g = c.group || DEFAULT_CIRCUIT_GROUP
      const list = map.get(g) ?? []
      list.push(c)
      map.set(g, list)
    }
    const keys = sortCircuitGroups(map.keys(), t)
    return keys.map((key) => ({
      key,
      label: circuitGroupLabel(key, t),
      items: map.get(key)!,
    }))
  }, [filteredCircuits, t])

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) }
      persistSections(next)
      return next
    })
  }

  const setAllSections = (open: boolean) => {
    const next: OpenMap = { gates: open }
    for (const g of gateGroups) next[`gate:${g.key}`] = open
    for (const g of groups) next[g.key] = open
    setOpenSections(next)
    persistSections(next)
  }

  const onDragStart = (e: React.DragEvent, payload: PalettePayload) => {
    activePaletteDrag = {
      payload,
      startX: e.clientX,
      startY: e.clientY,
      moved: true,
    }
    e.dataTransfer.setData(PALETTE_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const onDragEnd = () => {
    window.setTimeout(() => {
      clearPaletteDrag()
    }, 0)
  }

  const onPointerDownItem = (
    e: React.PointerEvent,
    payload: PalettePayload,
  ) => {
    // Mouse HTML5 DnD handles desktop; pointer path is for touch.
    if (e.pointerType === 'mouse') return
    activePaletteDrag = {
      payload,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
  }

  const circuitDisplayName = (c: ComboCircuit) => {
    if (c.builtinKey) {
      const key = `circuits.modules.${c.builtinKey}`
      const localized = t(key)
      if (localized !== key) return localized
    }
    return c.name
  }

  const gatesOpen = searching || (openSections.gates ?? true)
  const showModulesBody = searching || modulesOpen
  const anyOpen =
    modulesOpen ||
    (openSections.gates ?? true) ||
    groups.some((g) => openSections[g.key] ?? true)

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
            <div className="space-y-2 pl-0.5">
              {gateGroups.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{t('common.empty')}</p>
              ) : (
                gateGroups.map((group) => {
                  const sectionKey = `gate:${group.key}`
                  const open = searching || (openSections[sectionKey] ?? true)
                  return (
                    <div
                      key={group.key}
                      className="space-y-1 rounded-md bg-background/70 p-1"
                    >
                      <CategoryHeader
                        open={open}
                        title={group.label}
                        onToggle={() => toggleSection(sectionKey)}
                      />
                      {open ? (
                        <div className="ml-1 space-y-1 border-l-2 border-primary/25 pl-2">
                          {group.items.map((g) => {
                            const payload: PalettePayload = {
                              kind: 'gate',
                              gateId: g.id,
                              builtinKey: g.builtinKey,
                              name: g.name,
                            }
                            return (
                              <button
                                key={g.id}
                                type="button"
                                draggable
                                onDragStart={(e) => onDragStart(e, payload)}
                                onDragEnd={onDragEnd}
                                onPointerDown={(e) => onPointerDownItem(e, payload)}
                                className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-sm hover:border-primary/40 hover:bg-muted/40"
                              >
                                <GateSymbol
                                  gate={g}
                                  width={40}
                                  height={24}
                                  className="shrink-0 text-muted-foreground"
                                />
                                <span className="min-w-0 truncate font-medium">
                                  {g.name}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          ) : null}
        </section>

        {/* 一级：功能模块 → 按 group 分组（含自定义电路，排除自己） */}
        <section className="space-y-1.5 rounded-lg border bg-muted/15 p-2">
          <PrimaryGroupHeader
            open={showModulesBody}
            title={t('circuits.paletteModules')}
            onToggle={() => setModulesOpen((v) => !v)}
          />
          {showModulesBody ? (
            <div className="space-y-2 pl-0.5">
              {groups.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{t('common.empty')}</p>
              ) : (
                groups.map((group) => {
                  const open = searching || (openSections[group.key] ?? true)
                  return (
                    <div
                      key={group.key}
                      className="space-y-1 rounded-md bg-background/70 p-1"
                    >
                      <CategoryHeader
                        open={open}
                        title={group.label}
                        onToggle={() => toggleSection(group.key)}
                      />
                      {open ? (
                        <div className="ml-1 space-y-1 border-l-2 border-primary/25 pl-2">
                          {group.items.map((c) => {
                            const name = circuitDisplayName(c)
                            const payload: PalettePayload = {
                              kind: 'circuit',
                              circuitId: c.id,
                              name,
                            }
                            return (
                              <button
                                key={c.id}
                                type="button"
                                draggable
                                onDragStart={(e) => onDragStart(e, payload)}
                                onDragEnd={onDragEnd}
                                onPointerDown={(e) => onPointerDownItem(e, payload)}
                                className="w-full rounded-md border bg-background px-2 py-1.5 text-left text-sm hover:border-primary/40 hover:bg-muted/40"
                              >
                                {name}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
