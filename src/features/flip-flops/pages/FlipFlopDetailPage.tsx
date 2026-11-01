import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listCircuits as listComboCircuits } from '@/features/combo-circuits/db/repository'
import { buildModuleInternals } from '@/features/combo-circuits/lib/internals'
import type { ComboCircuit } from '@/features/combo-circuits/types'
import { listGates } from '@/features/logic-gates/db/repository'
import type { LogicGate } from '@/features/logic-gates/types'
import { useHistoryState } from '@/features/logic-gates/lib/history'
import { defaultPinName } from '@/features/logic-gates/lib/bool-engine'
import { createId, cn } from '@/lib/utils'
import { FfCircuitCanvas } from '../components/FfCircuitCanvas'
import { FfSidePanel } from '../components/FfSidePanel'
import { FuncTablePanel } from '../components/FuncTablePanel'
import { StateDiagramView } from '../components/StateDiagramView'
import { TimingDiagram } from '../components/TimingDiagram'
import {
  duplicateFlipFlop,
  getFlipFlop,
  listFlipFlops,
  updateFlipFlop,
} from '../db/repository'
import { catalogKeyFromFfId } from '../db/seed'
import { buildFfInternals } from '../lib/internals'
import {
  applyFixedInputDrives,
  defaultBitForPin,
  defaultNameForDrive,
  isFixedDrive,
  resolvePinDrive,
} from '../lib/pin-drive'
import {
  createInitialSimState,
  evaluateSequential,
  SeqSimError,
  type FfSimState,
  type GateResolver,
} from '../lib/seq-sim'
import type { Bit, CircuitPin, FlipFlopCircuit, PinDrive } from '../types'

type Draft = FlipFlopCircuit

type DrillFrame = {
  key: string
  label: string
  circuit: FlipFlopCircuit
}

function comboViewAsFf(view: ComboCircuit): FlipFlopCircuit {
  return {
    id: view.id,
    name: view.name,
    description: view.description,
    kind: 'custom',
    builtinKey: view.builtinKey,
    group: view.group,
    inputs: view.inputs,
    outputs: view.outputs,
    nodes: view.nodes.map((n) => {
      if (n.kind === 'gate') return { ...n }
      if (n.kind === 'module') {
        return {
          id: n.id,
          kind: 'comboModule' as const,
          moduleKey: n.moduleKey,
          position: n.position,
        }
      }
      return {
        id: n.id,
        kind: 'combo' as const,
        circuitId: n.circuitId,
        position: n.position,
      }
    }),
    wires: view.wires,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  }
}

const SIDE_COLLAPSE_KEY = 'zeda.flipflops.sideCollapsed'

function defaultInputs(circuit: FlipFlopCircuit): Record<string, Bit> {
  const next: Record<string, Bit> = {}
  for (const p of circuit.inputs) {
    next[p.id] = defaultBitForPin(p)
  }
  return next
}

function movePinInList(
  pins: CircuitPin[],
  pinId: string,
  dir: -1 | 1,
): CircuitPin[] {
  const i = pins.findIndex((p) => p.id === pinId)
  if (i < 0) return pins
  const j = i + dir
  if (j < 0 || j >= pins.length) return pins
  const next = [...pins]
  const tmp = next[i]!
  next[i] = next[j]!
  next[j] = tmp
  return next
}

function dropIoWires(wires: FlipFlopCircuit['wires'], pinId: string) {
  return wires.filter(
    (w) =>
      !(w.from.nodeId === 'io' && w.from.pinId === pinId) &&
      !(w.to.nodeId === 'io' && w.to.pinId === pinId),
  )
}

function readCollapsed(key: string, fallbackNarrow: boolean): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(key)
  if (stored != null) return stored === '1'
  return fallbackNarrow ? window.matchMedia('(max-width: 1023px)').matches : false
}

function primaryModuleKey(circuit: FlipFlopCircuit): string | undefined {
  if (circuit.builtinKey) return circuit.builtinKey
  const fromId = catalogKeyFromFfId(circuit.id)
  if (fromId) return fromId
  const ffNodes = circuit.nodes.filter((n) => n.kind === 'ff')
  if (ffNodes.length === 1) return ffNodes[0]!.moduleKey
  return undefined
}

export function FlipFlopDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const backTo =
    (location.state as { fromList?: string } | null)?.fromList || '/ff'

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [gates, setGates] = useState<LogicGate[]>([])
  const [allCircuits, setAllCircuits] = useState<FlipFlopCircuit[]>([])
  const [comboCircuits, setComboCircuits] = useState<ComboCircuit[]>([])
  const history = useHistoryState<Draft | null>(null)

  const [drillStack, setDrillStack] = useState<DrillFrame[]>([])
  const [, setSimInputs] = useState<Record<string, Bit>>({})
  const [, setSimState] = useState<FfSimState>({ ffState: {}, prevClk: {} })
  const [sideCollapsed, setSideCollapsed] = useState(() =>
    readCollapsed(SIDE_COLLAPSE_KEY, true),
  )
  const [analysisTab, setAnalysisTab] = useState('table')
  // Always start expanded when entering; collapse is not persisted.
  const [analysisCollapsed, setAnalysisCollapsed] = useState(false)

  useEffect(() => {
    setAnalysisCollapsed(false)
  }, [id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!id) return
      setLoading(true)
      const [circuit, gateList, circuitList, comboList] = await Promise.all([
        getFlipFlop(id),
        listGates(),
        listFlipFlops(),
        listComboCircuits(),
      ])
      if (cancelled) return
      setGates(gateList)
      setAllCircuits(circuitList)
      setComboCircuits(comboList)
      if (!circuit) {
        setNotFound(true)
        setLoading(false)
        return
      }
      history.reset(structuredClone(circuit))
      setDrillStack([])
      setSimInputs(defaultInputs(circuit))
      setSimState(createInitialSimState(circuit))
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
  const moduleKey = rootCircuit ? primaryModuleKey(rootCircuit) : undefined

  const gateMap = useMemo(() => {
    const map = new Map<string, LogicGate>()
    for (const g of gates) map.set(g.id, g)
    return map
  }, [gates])

  const groupOptions = useMemo(() => {
    const set = new Set<string>()
    for (const c of allCircuits) {
      if (c.group) set.add(c.group)
    }
    if (rootCircuit?.group) set.add(rootCircuit.group)
    return [...set]
  }, [allCircuits, rootCircuit])

  const [evalSnapshot, setEvalSnapshot] = useState<{
    ok: boolean
    skip?: boolean
    message?: string
    outputs?: Record<string, Bit>
    endpointBits?: Record<string, Bit>
    nodeOutBits?: Record<string, Record<string, Bit>>
    warnings?: string[]
  }>({ ok: false, skip: true })

  const resolveGate = useCallback<GateResolver>(
    (node) => {
      if (node.ref.builtinKey) {
        for (const g of gateMap.values()) {
          if (g.builtinKey === node.ref.builtinKey) return g
        }
      }
      if (node.ref.gateId) return gateMap.get(node.ref.gateId)
      return undefined
    },
    [gateMap],
  )

  const runSim = useCallback(
    (inputs: Record<string, Bit>, state: FfSimState) => {
      if (!viewing || inDrill) {
        setEvalSnapshot({
          ok: false,
          skip: true,
          message: t('flipflops.drillSimSkipped'),
        })
        return state
      }
      try {
        const forced = applyFixedInputDrives(viewing.inputs, inputs)
        const resolveCombo = (cid: string) =>
          comboCircuits.find((c) => c.id === cid)
        const result = evaluateSequential(
          viewing,
          forced,
          state,
          resolveGate,
          resolveCombo,
        )
        setEvalSnapshot({
          ok: true,
          skip: false,
          outputs: result.outputs,
          endpointBits: result.endpointBits,
          nodeOutBits: result.nodeOutBits,
          warnings: result.warnings,
        })
        return { ffState: result.ffState, prevClk: result.prevClk }
      } catch (err) {
        setEvalSnapshot({
          ok: false,
          skip: false,
          message:
            err instanceof SeqSimError || err instanceof Error
              ? err.message
              : String(err),
        })
        return state
      }
    },
    [viewing, inDrill, resolveGate, comboCircuits, t],
  )

  useEffect(() => {
    if (!viewing) return
    const initial = createInitialSimState(viewing)
    setSimState(initial)
    setSimInputs(defaultInputs(viewing))
    // Defer sim until inputs state commits — run with defaults immediately.
    runSim(defaultInputs(viewing), initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.id, inDrill])

  const commit = (next: Draft) => {
    if (inDrill) return
    history.set(next)
  }

  const displayName = (c: FlipFlopCircuit) => {
    const key =
      c.builtinKey ??
      catalogKeyFromFfId(c.id) ??
      (c.nodes.length === 1 && c.nodes[0]?.kind === 'ff'
        ? c.nodes[0].moduleKey
        : undefined)
    if (key) {
      const i18nKey = `flipflops.modules.${key}`
      const localized = t(i18nKey)
      if (localized !== i18nKey) return localized
    }
    return c.name
  }

  const moduleLabel = (key: string) => {
    const i18nKey = `flipflops.modules.${key}`
    const label = t(i18nKey)
    return label === i18nKey ? key : label
  }

  const onDrillModule = useCallback(
    (key: string) => {
      const internals = buildFfInternals(key, gates)
      if (!internals) {
        console.warn(`[ff] no internals for module "${key}"`)
        return
      }
      setDrillStack((prev) => [
        ...prev,
        {
          key: `module:${key}:${prev.length}`,
          label: moduleLabel(key),
          circuit: {
            ...internals,
            // Unique id per drill frame so canvas fitView re-runs on sibling drills.
            id: `${internals.id}#${prev.length}`,
          },
        },
      ])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gates, t],
  )

  const comboDisplayName = (c: ComboCircuit) => {
    if (c.builtinKey) {
      const key = `circuits.modules.${c.builtinKey}`
      const localized = t(key)
      if (localized !== key) return localized
    }
    return c.name
  }

  const onDrillCombo = useCallback(
    (circuitId: string) => {
      const child = comboCircuits.find((c) => c.id === circuitId)
      if (!child) return
      const asFf = comboViewAsFf(child)
      setDrillStack((prev) => [
        ...prev,
        {
          key: `combo:${circuitId}:${prev.length}`,
          label: comboDisplayName(child),
          circuit: {
            ...asFf,
            id: `${asFf.id}#${prev.length}`,
          },
        },
      ])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comboCircuits, t],
  )

  const onDrillComboModule = useCallback(
    (moduleKey: string) => {
      const internals = buildModuleInternals(moduleKey, gates)
      if (!internals) {
        console.warn(`[ff] no combo internals for module "${moduleKey}"`)
        return
      }
      const asFf = comboViewAsFf(internals)
      const labelKey = `circuits.modules.${moduleKey}`
      const label = t(labelKey)
      setDrillStack((prev) => [
        ...prev,
        {
          key: `comboModule:${moduleKey}:${prev.length}`,
          label: label === labelKey ? moduleKey : label,
          circuit: {
            ...asFf,
            id: `${asFf.id}#${prev.length}`,
          },
        },
      ])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gates, t],
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

  const onToggleInput = useCallback(
    (pinId: string) => {
      const pin = viewing?.inputs.find((p) => p.id === pinId)
      if (pin && isFixedDrive(resolvePinDrive(pin))) return
      setSimInputs((prev) => {
        const flipped: Record<string, Bit> = {
          ...prev,
          [pinId]: prev[pinId] === 1 ? 0 : 1,
        }
        const next = viewing
          ? applyFixedInputDrives(viewing.inputs, flipped)
          : flipped
        setSimState((state) => runSim(next, state))
        return next
      })
    },
    [runSim, viewing],
  )

  const onAddPin = (kind: 'in' | 'out') => {
    if (!rootCircuit || readOnly) return
    if (kind === 'in') {
      const name = defaultNameForDrive('signal', rootCircuit.inputs.length)
      const pin: CircuitPin = {
        id: createId('pin'),
        name,
        drive: 'signal',
      }
      commit({
        ...rootCircuit,
        inputs: [...rootCircuit.inputs, pin],
        updatedAt: Date.now(),
      })
    } else {
      const pin: CircuitPin = {
        id: createId('pin'),
        name: defaultPinName(rootCircuit.outputs.length, 'out'),
      }
      commit({
        ...rootCircuit,
        outputs: [...rootCircuit.outputs, pin],
        updatedAt: Date.now(),
      })
    }
  }

  const onRemovePin = (kind: 'in' | 'out', pinId: string) => {
    if (!rootCircuit || readOnly) return
    if (kind === 'in') {
      commit({
        ...rootCircuit,
        inputs: rootCircuit.inputs.filter((p) => p.id !== pinId),
        wires: dropIoWires(rootCircuit.wires, pinId),
        updatedAt: Date.now(),
      })
    } else {
      commit({
        ...rootCircuit,
        outputs: rootCircuit.outputs.filter((p) => p.id !== pinId),
        wires: dropIoWires(rootCircuit.wires, pinId),
        updatedAt: Date.now(),
      })
    }
  }

  const onMovePin = (kind: 'in' | 'out', pinId: string, dir: -1 | 1) => {
    if (!rootCircuit || readOnly) return
    if (kind === 'in') {
      commit({
        ...rootCircuit,
        inputs: movePinInList(rootCircuit.inputs, pinId, dir),
        updatedAt: Date.now(),
      })
    } else {
      commit({
        ...rootCircuit,
        outputs: movePinInList(rootCircuit.outputs, pinId, dir),
        updatedAt: Date.now(),
      })
    }
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

  const onSetPinDrive = (pinId: string, drive: PinDrive) => {
    if (!rootCircuit || readOnly) return
    const inputs = rootCircuit.inputs.map((p) =>
      p.id === pinId ? { ...p, drive } : p,
    )
    commit({ ...rootCircuit, inputs, updatedAt: Date.now() })
  }

  const onSave = async () => {
    if (!rootCircuit || rootCircuit.kind === 'builtin' || inDrill) return
    await updateFlipFlop(rootCircuit)
    history.reset(structuredClone(rootCircuit))
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2000)
  }

  const onCopyAsCustom = async () => {
    if (!rootCircuit) return
    const copy = await duplicateFlipFlop(rootCircuit.id, t('flipflops.copySuffix'))
    navigate(`/ff/${copy.id}`, { state: location.state })
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
                {t('flipflops.detail')}
              </h1>
              <Badge variant={rootCircuit.kind === 'builtin' ? 'secondary' : 'outline'}>
                {rootCircuit.kind === 'builtin'
                  ? t('flipflops.builtin')
                  : t('flipflops.custom')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {displayName(rootCircuit)}
              {rootCircuit.kind === 'builtin' ? ` · ${t('flipflops.builtinReadonly')}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {rootCircuit.kind === 'builtin' && !inDrill ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void onCopyAsCustom()}>
              <Copy /> {t('flipflops.copyAsCustom')}
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
          {t('flipflops.saved')}
        </div>
      ) : null}

      {!evalSnapshot.ok && !evalSnapshot.skip ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('flipflops.simError', { message: evalSnapshot.message ?? '' })}
        </div>
      ) : null}

      {evalSnapshot.ok && (evalSnapshot.warnings?.length ?? 0) > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {[...new Set(evalSnapshot.warnings)].join(' · ')}
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
              {t('flipflops.drillBack')}
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
            {t('flipflops.design')}
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
            {inDrill ? t('flipflops.drillHint') : t('flipflops.canvasHint')}
          </span>
        </div>

        <div className="flex h-[min(720px,82vh)] min-h-[360px]">
          <div className={cn('shrink-0', sideCollapsed ? 'w-10' : 'w-[240px]')}>
            <FfSidePanel
              circuit={rootCircuit}
              gates={gates}
              circuits={allCircuits}
              comboCircuits={comboCircuits}
              groupOptions={groupOptions}
              readOnly={readOnly}
              collapsed={sideCollapsed}
              onCollapsedChange={onSideCollapsedChange}
              onChange={commit}
              onAddPin={onAddPin}
              onRemovePin={onRemovePin}
              onMovePin={onMovePin}
              onRenamePin={onRenamePin}
              onSetPinDrive={onSetPinDrive}
              className="h-full"
            />
          </div>

          <div className="min-w-0 flex-1">
            <FfCircuitCanvas
              circuit={viewing}
              gates={gates}
              comboCircuits={comboCircuits}
              readOnly={readOnly}
              onChange={commit}
              endpointBits={evalSnapshot.ok ? evalSnapshot.endpointBits : undefined}
              nodeOutBits={evalSnapshot.ok ? evalSnapshot.nodeOutBits : undefined}
              onDrillModule={onDrillModule}
              onDrillCombo={onDrillCombo}
              onDrillComboModule={onDrillComboModule}
              onToggleInput={inDrill ? undefined : onToggleInput}
            />
          </div>
        </div>
      </div>

      {!inDrill && rootCircuit ? (
        <div className="rounded-lg border bg-card">
          <Tabs value={analysisTab} onValueChange={setAnalysisTab}>
            <div
              className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2"
              role="button"
              tabIndex={0}
              aria-expanded={!analysisCollapsed}
              aria-label={
                analysisCollapsed
                  ? t('flipflops.analysisExpand')
                  : t('flipflops.analysisCollapse')
              }
              onClick={() => setAnalysisCollapsed((c) => !c)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setAnalysisCollapsed((c) => !c)
                }
              }}
            >
              <span className="inline-flex h-7 items-center gap-1 px-2 text-xs font-medium">
                {analysisCollapsed ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronUp className="size-3.5" />
                )}
                {t('flipflops.analysis')}
              </span>
              {!analysisCollapsed ? (
                <TabsList
                  className="h-8"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <TabsTrigger value="table" className="text-xs">
                    {t('flipflops.funcTable')}
                  </TabsTrigger>
                  <TabsTrigger value="state" className="text-xs">
                    {t('flipflops.stateDiagram')}
                  </TabsTrigger>
                  <TabsTrigger value="timing" className="text-xs">
                    {t('flipflops.timing')}
                  </TabsTrigger>
                </TabsList>
              ) : null}
            </div>
            {!analysisCollapsed ? (
              <div className="border-t px-3 py-3">
                <TabsContent value="table" className="mt-0">
                  <FuncTablePanel moduleKey={moduleKey} />
                </TabsContent>
                <TabsContent value="state" className="mt-0">
                  <StateDiagramView moduleKey={moduleKey} />
                </TabsContent>
                <TabsContent value="timing" className="mt-0">
                  <TimingDiagram
                    circuit={rootCircuit}
                    gates={gates}
                    comboCircuits={comboCircuits}
                  />
                </TabsContent>
              </div>
            ) : null}
          </Tabs>
        </div>
      ) : null}
    </div>
  )
}
