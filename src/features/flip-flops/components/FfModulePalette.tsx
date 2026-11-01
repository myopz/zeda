import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { catalogKeyFromFfId } from '../db/seed'
import { ffGroupLabel, PRESET_FF_GROUPS, sortFfGroups } from '../lib/groups'
import { getFfModule, listFfModules } from '../lib/ff-modules'
import { DEFAULT_FF_GROUP, type FlipFlopCircuit } from '../types'

export const PALETTE_MIME = 'application/zeda-ff-palette'

export type PalettePayload =
  | { kind: 'gate'; gateId: string; builtinKey?: string; name: string }
  | { kind: 'module'; moduleKey: string; name: string }

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
  /** Library circuits for grouping (default / custom / presets). */
  circuits?: FlipFlopCircuit[]
  excludeCircuitId?: string
  embedded?: boolean
  className?: string
}

const SECTION_KEY = 'zeda.flipflops.paletteSections'

type OpenMap = Record<string, boolean>

type PaletteItem =
  | { id: string; kind: 'module'; moduleKey: string; label: string }
  | { id: string; kind: 'circuit'; circuitId: string; moduleKey: string; label: string }

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

function startDrag(e: React.PointerEvent, payload: PalettePayload) {
  activePaletteDrag = {
    payload,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
  }
}

function GroupHeader({
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
      className="flex w-full items-center gap-1.5 rounded-md bg-muted px-2.5 py-2 text-left text-xs font-bold tracking-wide hover:bg-muted/80"
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

function resolveCircuitModuleKey(c: FlipFlopCircuit): string | undefined {
  if (c.builtinKey && getFfModule(c.builtinKey)) return c.builtinKey
  if (c.behaviorKey && getFfModule(c.behaviorKey)) return c.behaviorKey
  const fromId = catalogKeyFromFfId(c.id)
  if (fromId) return fromId
  const ffNodes = c.nodes.filter((n) => n.kind === 'ff')
  if (ffNodes.length === 1) {
    const key = ffNodes[0]!.moduleKey
    if (getFfModule(key)) return key
  }
  return undefined
}

export function FfModulePalette({
  gates,
  circuits = [],
  excludeCircuitId,
  embedded,
  className,
}: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<OpenMap>(readOpenSections)
  const modules = useMemo(() => listFfModules(), [])

  const q = query.trim().toLowerCase()

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

    for (const preset of PRESET_FF_GROUPS) ensure(preset)

    // Catalog FF modules under their category (latch / edge / ttl).
    for (const m of modules) {
      const label = t(`flipflops.modules.${m.key}`)
      if (
        q &&
        !m.key.toLowerCase().includes(q) &&
        !label.toLowerCase().includes(q)
      ) {
        continue
      }
      ensure(m.category)
      map.get(m.category)!.push({
        id: `mod:${m.key}`,
        kind: 'module',
        moduleKey: m.key,
        label,
      })
    }

    // Library circuits: fill default + custom (+ preset if user assigned).
    // Skip catalog seeds already represented by a module in the same group.
    for (const c of circuits) {
      if (c.id === excludeCircuitId) continue
      const group = c.group?.trim() || DEFAULT_FF_GROUP
      ensure(group)

      const moduleKey = resolveCircuitModuleKey(c)
      const catalogMod = moduleKey ? getFfModule(moduleKey) : undefined
      const isCatalogSeed =
        !!catalogMod &&
        (c.builtinKey === moduleKey ||
          catalogKeyFromFfId(c.id) === moduleKey ||
          (c.nodes.length === 1 &&
            c.nodes[0]?.kind === 'ff' &&
            c.nodes[0].moduleKey === moduleKey))

      // Seed already listed under module category — don't duplicate there.
      if (isCatalogSeed && catalogMod.category === group) continue
      // Without a placeable module key, skip (no circuit nesting in FF canvas).
      if (!moduleKey) continue

      const label = (() => {
        const i18nKey = `flipflops.modules.${moduleKey}`
        const localized = t(i18nKey)
        if (localized !== i18nKey && (c.builtinKey || catalogKeyFromFfId(c.id))) {
          return localized
        }
        return c.name
      })()

      if (
        q &&
        !label.toLowerCase().includes(q) &&
        !group.toLowerCase().includes(q) &&
        !ffGroupLabel(group, t).toLowerCase().includes(q) &&
        !moduleKey.toLowerCase().includes(q)
      ) {
        continue
      }

      map.get(group)!.push({
        id: `ckt:${c.id}`,
        kind: 'circuit',
        circuitId: c.id,
        moduleKey,
        label,
      })
    }

    // Always keep default group visible even when empty.
    ensure(DEFAULT_FF_GROUP)

    return sortFfGroups(map.keys(), t).map((key) => ({
      key,
      label: ffGroupLabel(key, t),
      items: map.get(key) ?? [],
    }))
  }, [circuits, excludeCircuitId, modules, q, t])

  const toggle = (key: string) => {
    setOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      persistSections(next)
      return next
    })
  }

  const onHtmlDragStart = (e: React.DragEvent, payload: PalettePayload) => {
    e.dataTransfer.setData(PALETTE_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        !embedded && 'w-[220px] border-r bg-card',
        className,
      )}
    >
      <div className="shrink-0 space-y-2 border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('flipflops.paletteSearch')}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        <div>
          <GroupHeader
            open={open.gates !== false}
            title={t('flipflops.paletteGates')}
            onToggle={() => toggle('gates')}
          />
          {open.gates !== false
            ? gateGroups.map((group) => {
                const catKey = `gate:${group.key}`
                const catOpen = open[catKey] !== false
                return (
                  <div key={group.key} className="mt-1">
                    <button
                      type="button"
                      onClick={() => toggle(catKey)}
                      className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      {catOpen ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                      {group.label}
                    </button>
                    {catOpen ? (
                      <div className="ml-2 space-y-0.5 border-l border-border pl-1">
                        {group.items.map((g) => {
                          const payload: PalettePayload = {
                            kind: 'gate',
                            gateId: g.id,
                            builtinKey: g.builtinKey,
                            name: g.name,
                          }
                          return (
                            <div
                              key={g.id}
                              draggable
                              onDragStart={(e) => onHtmlDragStart(e, payload)}
                              onPointerDown={(e) => startDrag(e, payload)}
                              className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted active:cursor-grabbing"
                            >
                              <GateSymbol gate={g} width={36} height={18} />
                              <span className="truncate">{g.name}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })
            : null}
        </div>

        <div>
          <GroupHeader
            open={open.modules !== false}
            title={t('flipflops.paletteModules')}
            onToggle={() => toggle('modules')}
          />
          {open.modules !== false
            ? groups.map((group) => {
                const catKey = `cat:${group.key}`
                const catOpen = open[catKey] !== false
                return (
                  <div key={group.key} className="mt-1">
                    <button
                      type="button"
                      onClick={() => toggle(catKey)}
                      className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      {catOpen ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                      {group.label}
                    </button>
                    {catOpen ? (
                      <div className="space-y-0.5">
                        {group.items.length === 0 ? (
                          <p className="px-2 py-1 text-[11px] text-muted-foreground">
                            {t('common.empty')}
                          </p>
                        ) : (
                          group.items.map((item) => {
                            const payload: PalettePayload = {
                              kind: 'module',
                              moduleKey: item.moduleKey,
                              name: item.label,
                            }
                            return (
                              <div
                                key={item.id}
                                draggable
                                onDragStart={(e) => onHtmlDragStart(e, payload)}
                                onPointerDown={(e) => startDrag(e, payload)}
                                className="cursor-grab rounded-md px-2 py-1.5 text-xs hover:bg-muted active:cursor-grabbing"
                              >
                                {item.label}
                              </div>
                            )
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })
            : null}
        </div>
      </div>
    </div>
  )
}
