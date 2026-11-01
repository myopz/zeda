import {
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Search,
} from 'lucide-react'
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
} from '@/features/combo-circuits/lib/groups'
import {
  DEFAULT_CIRCUIT_GROUP,
  type ComboCircuit,
} from '@/features/combo-circuits/types'
import { listFfModules } from '@/features/flip-flops/lib/ff-modules'
import { catalogKeyFromSeqId } from '../db/seed'
import { seqGroupLabel, PRESET_SEQ_GROUPS, sortSeqGroups } from '../lib/groups'
import { getSeqModule, listSeqModules } from '../lib/seq-modules'
import { DEFAULT_SEQ_GROUP, type SequentialCircuit } from '../types'

export const PALETTE_MIME = 'application/zeda-seq-palette'

export type PalettePayload =
  | { kind: 'gate'; gateId: string; builtinKey?: string; name: string }
  | { kind: 'ff'; moduleKey: string; name: string }
  | { kind: 'seq'; moduleKey: string; name: string }
  | { kind: 'circuit'; circuitId: string; name: string }
  | { kind: 'combo'; circuitId: string; name: string }

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
  /** Other sequential circuits (nested seq). */
  circuits?: SequentialCircuit[]
  /** Combo logic circuits from /clc. */
  comboCircuits?: ComboCircuit[]
  excludeCircuitId?: string
  embedded?: boolean
  className?: string
}

const SECTION_KEY = 'zeda.sequential.paletteSections'

type OpenMap = Record<string, boolean>

type PaletteItem =
  | { id: string; kind: 'ff'; moduleKey: string; label: string }
  | { id: string; kind: 'seq'; moduleKey: string; label: string }
  | {
      id: string
      kind: 'circuit'
      circuitId: string
      label: string
    }

function readOpenSections(): OpenMap {
  try {
    const raw = localStorage.getItem(SECTION_KEY)
    if (!raw) return { gates: true, modules: true }
    return { gates: true, modules: true, ...(JSON.parse(raw) as OpenMap) }
  } catch {
    return { gates: true, modules: true }
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

/** 二级分类标题 */
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

export function SeqModulePalette({
  gates,
  circuits = [],
  comboCircuits = [],
  excludeCircuitId,
  embedded,
  className,
}: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<OpenMap>(readOpenSections)
  const [comboOpen, setComboOpen] = useState(true)
  const seqModules = useMemo(() => listSeqModules(), [])
  const ffModules = useMemo(() => listFfModules(), [])

  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  const comboDisplayName = (c: ComboCircuit) => {
    if (c.builtinKey) {
      const key = `circuits.modules.${c.builtinKey}`
      const localized = t(key)
      if (localized !== key) return localized
    }
    return c.name
  }

  const comboGroups = useMemo(() => {
    const filtered = comboCircuits.filter((c) => {
      const name = comboDisplayName(c).toLowerCase()
      const group = circuitGroupLabel(
        c.group || DEFAULT_CIRCUIT_GROUP,
        t,
      ).toLowerCase()
      if (!q) return true
      return (
        name.includes(q) ||
        group.includes(q) ||
        (c.builtinKey?.toLowerCase().includes(q) ?? false) ||
        (c.description?.toLowerCase().includes(q) ?? false)
      )
    })
    const map = new Map<string, ComboCircuit[]>()
    for (const c of filtered) {
      const g = c.group || DEFAULT_CIRCUIT_GROUP
      const list = map.get(g) ?? []
      list.push(c)
      map.set(g, list)
    }
    return sortCircuitGroups(map.keys(), t).map((key) => ({
      key,
      label: circuitGroupLabel(key, t),
      items: map.get(key)!,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t + comboDisplayName
  }, [comboCircuits, q, t])

  const filteredGates = useMemo(() => {
    if (!q) return gates
    return gates.filter((g) => {
      const group = gateGroupLabel(g.group || DEFAULT_GATE_GROUP, t).toLowerCase()
      return (
        g.name.toLowerCase().includes(q) ||
        g.builtinKey?.toLowerCase().includes(q) ||
        group.includes(q) ||
        (g.group?.toLowerCase().includes(q) ?? false)
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

  const groups = useMemo(() => {
    const map = new Map<string, PaletteItem[]>()

    const ensure = (key: string) => {
      if (!map.has(key)) map.set(key, [])
    }

    for (const preset of PRESET_SEQ_GROUPS) ensure(preset)
    ensure('flipflop')

    for (const m of ffModules) {
      const label = t(`flipflops.modules.${m.key}`, { defaultValue: m.key })
      if (
        q &&
        !m.key.toLowerCase().includes(q) &&
        !label.toLowerCase().includes(q)
      ) {
        continue
      }
      ensure('flipflop')
      map.get('flipflop')!.push({
        id: `ff:${m.key}`,
        kind: 'ff',
        moduleKey: m.key,
        label,
      })
    }

    for (const m of seqModules) {
      const label = t(`sequential.modules.${m.key}`)
      if (
        q &&
        !m.key.toLowerCase().includes(q) &&
        !label.toLowerCase().includes(q)
      ) {
        continue
      }
      ensure(m.category)
      map.get(m.category)!.push({
        id: `seq:${m.key}`,
        kind: 'seq',
        moduleKey: m.key,
        label,
      })
    }

    for (const c of circuits) {
      if (c.id === excludeCircuitId) continue
      // Skip builtin catalog seeds (already listed as seq modules).
      if (c.builtinKey && getSeqModule(c.builtinKey)) continue
      if (catalogKeyFromSeqId(c.id)) continue

      const group = c.group?.trim() || DEFAULT_SEQ_GROUP
      ensure(group)

      const label = c.name
      if (
        q &&
        !label.toLowerCase().includes(q) &&
        !group.toLowerCase().includes(q) &&
        !seqGroupLabel(group, t).toLowerCase().includes(q)
      ) {
        continue
      }

      map.get(group)!.push({
        id: `ckt:${c.id}`,
        kind: 'circuit',
        circuitId: c.id,
        label,
      })
    }

    ensure(DEFAULT_SEQ_GROUP)

    return sortSeqGroups([...map.keys(), 'flipflop'], t).map((key) => ({
      key,
      label:
        key === 'flipflop'
          ? t('sequential.paletteFlipFlops')
          : seqGroupLabel(key, t),
      items: map.get(key) ?? [],
    }))
  }, [circuits, excludeCircuitId, ffModules, seqModules, q, t])

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = { ...prev, [key]: !(prev[key] ?? true) }
      persistSections(next)
      return next
    })
  }

  const setAllSections = (nextOpen: boolean) => {
    const next: OpenMap = {
      gates: nextOpen,
      modules: nextOpen,
      combo: nextOpen,
    }
    for (const g of gateGroups) next[`gate:${g.key}`] = nextOpen
    for (const g of groups) next[`cat:${g.key}`] = nextOpen
    for (const g of comboGroups) next[`combo:${g.key}`] = nextOpen
    setOpen(next)
    setComboOpen(nextOpen)
    persistSections(next)
  }

  const onHtmlDragStart = (e: React.DragEvent, payload: PalettePayload) => {
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
    if (e.pointerType === 'mouse') return
    activePaletteDrag = {
      payload,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
  }

  const gatesOpen = searching || (open.gates ?? true)
  const modulesOpen = searching || (open.modules ?? true)
  const anyOpen =
    (open.gates ?? true) ||
    (open.modules ?? true) ||
    comboOpen ||
    gateGroups.some((g) => open[`gate:${g.key}`] ?? true) ||
    groups.some((g) => open[`cat:${g.key}`] ?? true) ||
    comboGroups.some((g) => open[`combo:${g.key}`] ?? true)

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        !embedded && 'w-[220px] border-r bg-card',
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
              placeholder={t('sequential.paletteSearch')}
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            disabled={searching}
            aria-label={t('sequential.paletteToggleAll')}
            title={
              anyOpen
                ? t('sequential.paletteCollapseAll')
                : t('sequential.paletteExpandAll')
            }
            onClick={() => setAllSections(!anyOpen)}
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
        <section className="space-y-1.5 rounded-lg border bg-muted/15 p-2">
          <PrimaryGroupHeader
            open={gatesOpen}
            title={t('sequential.paletteGates')}
            onToggle={() => toggle('gates')}
          />
          {gatesOpen ? (
            <div className="space-y-2 pl-0.5">
              {gateGroups.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('common.empty')}
                </p>
              ) : (
                gateGroups.map((group) => {
                  const catKey = `gate:${group.key}`
                  const catOpen = searching || (open[catKey] ?? true)
                  return (
                    <div
                      key={group.key}
                      className="space-y-1 rounded-md bg-background/70 p-1"
                    >
                      <CategoryHeader
                        open={catOpen}
                        title={group.label}
                        onToggle={() => toggle(catKey)}
                      />
                      {catOpen ? (
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
                                onDragStart={(e) => onHtmlDragStart(e, payload)}
                                onDragEnd={onDragEnd}
                                onPointerDown={(e) =>
                                  onPointerDownItem(e, payload)
                                }
                                className="flex w-full items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs hover:border-primary/40 hover:bg-muted/40"
                              >
                                <GateSymbol
                                  gate={g}
                                  width={36}
                                  height={18}
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

        <section className="space-y-1.5 rounded-lg border bg-muted/15 p-2">
          <PrimaryGroupHeader
            open={searching || comboOpen}
            title={t('sequential.paletteCombo')}
            onToggle={() => setComboOpen((v) => !v)}
          />
          {searching || comboOpen ? (
            <div className="space-y-2 pl-0.5">
              {comboGroups.every((g) => g.items.length === 0) ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('common.empty')}
                </p>
              ) : (
                comboGroups.map((group) => {
                  if (!searching && group.items.length === 0) return null
                  const catKey = `combo:${group.key}`
                  const catOpen = searching || (open[catKey] ?? true)
                  return (
                    <div
                      key={group.key}
                      className="space-y-1 rounded-md bg-background/70 p-1"
                    >
                      <CategoryHeader
                        open={catOpen}
                        title={group.label}
                        onToggle={() => toggle(catKey)}
                      />
                      {catOpen ? (
                        <div className="ml-1 space-y-1 border-l-2 border-primary/25 pl-2">
                          {group.items.map((c) => {
                            const name = comboDisplayName(c)
                            const payload: PalettePayload = {
                              kind: 'combo',
                              circuitId: c.id,
                              name,
                            }
                            return (
                              <button
                                key={c.id}
                                type="button"
                                draggable
                                onDragStart={(e) => onHtmlDragStart(e, payload)}
                                onDragEnd={onDragEnd}
                                onPointerDown={(e) =>
                                  onPointerDownItem(e, payload)
                                }
                                className="w-full rounded-md border bg-background px-2 py-1.5 text-left text-xs font-medium hover:border-primary/40 hover:bg-muted/40"
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

        <section className="space-y-1.5 rounded-lg border bg-muted/15 p-2">
          <PrimaryGroupHeader
            open={modulesOpen}
            title={t('sequential.paletteModules')}
            onToggle={() => toggle('modules')}
          />
          {modulesOpen ? (
            <div className="space-y-2 pl-0.5">
              {groups.every((g) => g.items.length === 0) ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('common.empty')}
                </p>
              ) : (
                groups.map((group) => {
                  if (!searching && group.items.length === 0) return null
                  const catKey = `cat:${group.key}`
                  const catOpen = searching || (open[catKey] ?? true)
                  return (
                    <div
                      key={group.key}
                      className="space-y-1 rounded-md bg-background/70 p-1"
                    >
                      <CategoryHeader
                        open={catOpen}
                        title={group.label}
                        onToggle={() => toggle(catKey)}
                      />
                      {catOpen ? (
                        <div className="ml-1 space-y-1 border-l-2 border-primary/25 pl-2">
                          {group.items.length === 0 ? (
                            <p className="px-2 py-1 text-[11px] text-muted-foreground">
                              {t('common.empty')}
                            </p>
                          ) : (
                            group.items.map((item) => {
                              const payload: PalettePayload =
                                item.kind === 'circuit'
                                  ? {
                                      kind: 'circuit',
                                      circuitId: item.circuitId,
                                      name: item.label,
                                    }
                                  : {
                                      kind: item.kind,
                                      moduleKey: item.moduleKey,
                                      name: item.label,
                                    }
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  draggable
                                  onDragStart={(e) =>
                                    onHtmlDragStart(e, payload)
                                  }
                                  onDragEnd={onDragEnd}
                                  onPointerDown={(e) =>
                                    onPointerDownItem(e, payload)
                                  }
                                  className="w-full rounded-md border bg-background px-2 py-1.5 text-left text-xs font-medium hover:border-primary/40 hover:bg-muted/40"
                                >
                                  {item.label}
                                </button>
                              )
                            })
                          )}
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
