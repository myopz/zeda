import { ArrowLeft, ChevronRight, Copy, Redo2, Save, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listGates } from '@/features/logic-gates/db/repository'
import type { LogicGate } from '@/features/logic-gates/types'
import { useHistoryState } from '@/features/logic-gates/lib/history'
import { defaultPinName } from '@/features/logic-gates/lib/bool-engine'
import { createId, cn } from '@/lib/utils'
import { CircuitCanvas } from '../components/CircuitCanvas'
import { CircuitSidePanel } from '../components/CircuitSidePanel'
import {
  duplicateCircuit,
  getCircuit,
  listCircuits,
  updateCircuit,
} from '../db/repository'
import { buildModuleInternals } from '../lib/internals'
import { evaluateCircuit, NetlistError } from '../lib/netlist'
import type { Bit, CircuitPin, ComboCircuit } from '../types'

type Draft = ComboCircuit

type DrillFrame = {
  key: string
  label: string
  circuit: ComboCircuit
}

const SIDE_COLLAPSE_KEY = 'zeda.circuits.sideCollapsed'

function resizePins(count: number, kind: 'in' | 'out', prev: CircuitPin[]): CircuitPin[] {
  const next: CircuitPin[] = []
  for (let i = 0; i < count; i += 1) {
    next.push(prev[i] ?? { id: createId('pin'), name: defaultPinName(i, kind) })
  }
  return next
}

function defaultInputs(circuit: ComboCircuit): Record<string, Bit> {
  const next: Record<string, Bit> = {}
  for (const p of circuit.inputs) next[p.id] = 0
  return next
}

function readCollapsed(key: string, fallbackNarrow: boolean): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(key)
  if (stored != null) return stored === '1'
  return fallbackNarrow ? window.matchMedia('(max-width: 1023px)').matches : false
}

export function ComboCircuitDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const backTo =
    (location.state as { fromList?: string } | null)?.fromList || '/clc'

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [gates, setGates] = useState<LogicGate[]>([])
  const [allCircuits, setAllCircuits] = useState<ComboCircuit[]>([])
  const history = useHistoryState<Draft | null>(null)

  const [drillStack, setDrillStack] = useState<DrillFrame[]>([])
  const [simInputs, setSimInputs] = useState<Record<string, Bit>>({})
  const [sideCollapsed, setSideCollapsed] = useState(() =>
    readCollapsed(SIDE_COLLAPSE_KEY, true),
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!id) return
      setLoading(true)
      const [circuit, gateList, circuitList] = await Promise.all([
        getCircuit(id),
        listGates(),
        listCircuits(),
      ])
      if (cancelled) return
      setGates(gateList)
      setAllCircuits(circuitList)
      if (!circuit) {
        setNotFound(true)
        setLoading(false)
        return
      }
      history.reset(structuredClone(circuit))
      setDrillStack([])
      setSimInputs(defaultInputs(circuit))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per id
  }, [id])

  const rootCircuit = history.state
  const viewing =
    drillStack.length > 0 ? drillStack[drillStack.length - 1]!.circuit : rootCircuit
  const inDrill = drillStack.length > 0
  const readOnly = inDrill || rootCircuit?.kind === 'builtin'

  const gateMap = useMemo(() => {
    const map = new Map<string, LogicGate>()
    for (const g of gates) map.set(g.id, g)
    return map
  }, [gates])

  const circuitMap = useMemo(() => {
    const map = new Map<string, ComboCircuit>()
    for (const c of allCircuits) map.set(c.id, c)
    if (rootCircuit) map.set(rootCircuit.id, rootCircuit)
    return map
  }, [allCircuits, rootCircuit])

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of allCircuits) {
      if (c.group) set.add(c.group)
    }
    if (rootCircuit?.group) set.add(rootCircuit.group)
    return [...set]
  }, [allCircuits, rootCircuit])

  useEffect(() => {
    if (!viewing) return
    setSimInputs(defaultInputs(viewing))
  }, [viewing?.id])

  const evalState = useMemo(() => {
    if (!viewing) return { ok: false as const, message: '' }
    try {
      const result = evaluateCircuit(
        viewing,
        simInputs,
        (node) => {
          if (node.ref.builtinKey) {
            for (const g of gateMap.values()) {
              if (g.builtinKey === node.ref.builtinKey) return g
            }
          }
          if (node.ref.gateId) return gateMap.get(node.ref.gateId)
          return undefined
        },
        (circuitId) => circuitMap.get(circuitId),
      )
      return { ok: true as const, ...result }
    } catch (err) {
      return {
        ok: false as const,
        message:
          err instanceof NetlistError || err instanceof Error
            ? err.message
            : String(err),
      }
    }
  }, [viewing, simInputs, gateMap, circuitMap])

  const commit = (next: Draft) => {
    if (inDrill) return
    history.set(next)
  }

  const displayName = (c: ComboCircuit) => {
    if (c.builtinKey) {
      const key = `circuits.modules.${c.builtinKey}`
      const localized = t(key)
      if (localized !== key) return localized
    }
    return c.name
  }

  const moduleLabel = (key: string) => {
    const i18nKey = `circuits.modules.${key}`
    const label = t(i18nKey)
    return label === i18nKey ? key : label
  }

  const onDrillModule = useCallback(
    (moduleKey: string) => {
      const internals = buildModuleInternals(moduleKey, gates)
      if (!internals) return
      setDrillStack((prev) => [
        ...prev,
        { key: `module:${moduleKey}`, label: moduleLabel(moduleKey), circuit: internals },
      ])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gates, t],
  )

  const onDrillCircuit = useCallback(
    (circuitId: string) => {
      const target = circuitMap.get(circuitId)
      if (!target) return
      setDrillStack((prev) => [
        ...prev,
        {
          key: `circuit:${circuitId}`,
          label: displayName(target),
          circuit: structuredClone(target),
        },
      ])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [circuitMap, t],
  )

  const popDrillTo = (index: number) => {
    if (index < 0) {
      setDrillStack([])
      return
    }
    setDrillStack((prev) => prev.slice(0, index + 1))
  }

  const popDrillOne = useCallback(() => {
    setDrillStack((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1)))
  }, [])

  useEffect(() => {
    if (!inDrill) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      popDrillOne()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inDrill, popDrillOne])

  const onSideCollapsedChange = (collapsed: boolean) => {
    setSideCollapsed(collapsed)
    localStorage.setItem(SIDE_COLLAPSE_KEY, collapsed ? '1' : '0')
  }

  const onToggleInput = useCallback((pinId: string) => {
    setSimInputs((prev) => ({
      ...prev,
      [pinId]: prev[pinId] === 1 ? 0 : 1,
    }))
  }, [])

  const onInputCountChange = (count: number) => {
    if (!rootCircuit || readOnly || !Number.isFinite(count)) return
    const n = Math.max(1, Math.trunc(count))
    const inputs = resizePins(n, 'in', rootCircuit.inputs)
    const keep = new Set(inputs.map((p) => p.id))
    const wires = rootCircuit.wires.filter(
      (w) =>
        !(w.from.nodeId === 'io' && !keep.has(w.from.pinId)) &&
        !(w.to.nodeId === 'io' && !keep.has(w.to.pinId)),
    )
    commit({ ...rootCircuit, inputs, wires, updatedAt: Date.now() })
  }

  const onOutputCountChange = (count: number) => {
    if (!rootCircuit || readOnly || !Number.isFinite(count)) return
    const n = Math.max(1, Math.trunc(count))
    const outputs = resizePins(n, 'out', rootCircuit.outputs)
    const keep = new Set(outputs.map((p) => p.id))
    const wires = rootCircuit.wires.filter(
      (w) =>
        !(w.from.nodeId === 'io' && !keep.has(w.from.pinId)) &&
        !(w.to.nodeId === 'io' && !keep.has(w.to.pinId)),
    )
    commit({ ...rootCircuit, outputs, wires, updatedAt: Date.now() })
  }

  const onRenamePin = (kind: 'in' | 'out', pinId: string, name: string) => {
    if (!rootCircuit || readOnly) return
    const clean = name.trim() || 'X'
    if (kind === 'in') {
      const inputs = rootCircuit.inputs.map((p) =>
        p.id === pinId ? { ...p, name: clean } : p,
      )
      commit({ ...rootCircuit, inputs, updatedAt: Date.now() })
    } else {
      const outputs = rootCircuit.outputs.map((p) =>
        p.id === pinId ? { ...p, name: clean } : p,
      )
      commit({ ...rootCircuit, outputs, updatedAt: Date.now() })
    }
  }

  const onSave = async () => {
    if (!rootCircuit || rootCircuit.kind === 'builtin' || inDrill) return
    await updateCircuit(rootCircuit)
    history.reset(structuredClone(rootCircuit))
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2000)
  }

  const onCopyAsCustom = async () => {
    if (!rootCircuit) return
    const copy = await duplicateCircuit(rootCircuit.id, t('circuits.copySuffix'))
    navigate(`/clc/${copy.id}`, { state: location.state })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
  }

  if (notFound || !rootCircuit || !viewing) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('common.empty')}</p>
        <Button asChild variant="outline">
          <Link to={backTo}>
            <ArrowLeft /> {t('common.back')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="outline" size="icon" className="mt-0.5 shrink-0">
            <Link to={backTo} aria-label={t('common.back')}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {t('circuits.detail')}
              </h1>
              <Badge variant={rootCircuit.kind === 'builtin' ? 'secondary' : 'outline'}>
                {rootCircuit.kind === 'builtin'
                  ? t('circuits.builtin')
                  : t('circuits.custom')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {displayName(rootCircuit)}
              {rootCircuit.kind === 'builtin' ? ` · ${t('circuits.builtinReadonly')}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {rootCircuit.kind === 'builtin' && !inDrill ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void onCopyAsCustom()}>
              <Copy /> {t('circuits.copyAsCustom')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!history.canUndo || readOnly}
            onClick={history.undo}
          >
            <Undo2 /> {t('common.undo')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!history.canRedo || readOnly}
            onClick={history.redo}
          >
            <Redo2 /> {t('common.redo')}
          </Button>
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => void onSave()}>
              <Save /> {t('common.save')}
            </Button>
          )}
        </div>
      </div>

      {savedFlash ? (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          {t('circuits.saved')}
        </div>
      ) : null}

      {!evalState.ok ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('circuits.simError', { message: evalState.message })}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center gap-1 border-b bg-card px-3 py-2 text-xs">
          {inDrill ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mr-1 h-7 gap-1 px-2"
              onClick={popDrillOne}
            >
              <ArrowLeft className="size-3.5" />
              {t('circuits.drillBack')}
            </Button>
          ) : null}
          <button
            type="button"
            className={cn(
              'rounded px-1.5 py-0.5 hover:bg-muted',
              !inDrill && 'font-medium text-foreground',
              inDrill && 'text-muted-foreground',
            )}
            onClick={() => popDrillTo(-1)}
          >
            {t('circuits.design')}
          </button>
          {drillStack.map((frame, i) => (
            <span key={`${frame.key}-${i}`} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 hover:bg-muted',
                  i === drillStack.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
                onClick={() => popDrillTo(i)}
              >
                {frame.label}
              </button>
            </span>
          ))}
          <span className="ml-auto text-muted-foreground">
            {inDrill ? t('circuits.drillHint') : t('circuits.canvasHint')}
          </span>
        </div>

        <div className="flex h-[min(640px,75vh)] min-h-[400px]">
          <div className={cn('shrink-0', sideCollapsed ? 'w-10' : 'w-[240px]')}>
            <CircuitSidePanel
              circuit={rootCircuit}
              gates={gates}
              circuits={allCircuits}
              groupOptions={groupOptions}
              readOnly={readOnly}
              collapsed={sideCollapsed}
              onCollapsedChange={onSideCollapsedChange}
              onChange={commit}
              onInputCountChange={onInputCountChange}
              onOutputCountChange={onOutputCountChange}
              onRenamePin={onRenamePin}
              className="h-full"
            />
          </div>

          <div className="min-w-0 flex-1">
            <CircuitCanvas
              circuit={viewing}
              gates={gates}
              circuits={[...circuitMap.values()]}
              readOnly={readOnly}
              onChange={commit}
              endpointBits={evalState.ok ? evalState.endpointBits : undefined}
              nodeOutBits={evalState.ok ? evalState.nodeOutBits : undefined}
              onDrillModule={onDrillModule}
              onDrillCircuit={onDrillCircuit}
              onToggleInput={onToggleInput}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
