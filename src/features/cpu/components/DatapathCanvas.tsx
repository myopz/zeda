import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { buildModuleInternals, hasModuleInternals } from '@/features/combo-circuits/lib/internals'
import type { ComboCircuit } from '@/features/combo-circuits/types'
import { listGates } from '@/features/logic-gates/db/repository'
import type { LogicGate } from '@/features/logic-gates/types'
import { SeqCircuitCanvas } from '@/features/sequential-circuits/components/SeqCircuitCanvas'
import { buildSeqInternals, hasSeqInternals } from '@/features/sequential-circuits/lib/internals'
import { getSeqModule } from '@/features/sequential-circuits/lib/seq-modules'
import type { SequentialCircuit } from '@/features/sequential-circuits/types'
import { cn } from '@/lib/utils'
import {
  DATAPATH_EDGES,
  DATAPATH_NODES,
  busLinesForNode,
} from '../lib/datapath-graph'
import type { DatapathState } from '../lib/datapath-sim'

/** Selection indigo — distinct from sim amber. */
const SEL_STROKE = '#6366f1'
const SEL_STROKE_WIDTH = 3
const SIM_HIGH_STROKE = '#f59e0b'
const SIM_IDLE_STROKE = '#94a3b8'
const DIM_STROKE = '#cbd5e1'

type NodeHighlight = 'focus' | 'neighbor'

type BlockData = {
  label: string
  lines: string[]
  drillable: boolean
  onDrill?: () => void
  active: boolean
  highlight?: NodeHighlight
}

type Neighborhood = {
  focus: Set<string>
  neighbors: Set<string>
  edges: Set<string>
}

function selectionNeighborhood(
  selectedNodeIds: string[],
  selectedEdgeIds: string[],
): Neighborhood {
  const focus = new Set(selectedNodeIds)
  const neighbors = new Set<string>()
  const edges = new Set<string>()

  for (const e of DATAPATH_EDGES) {
    if (e.source === e.target) continue
    const edgeSelected = selectedEdgeIds.includes(e.id)
    const nodeHit = focus.has(e.source) || focus.has(e.target)
    if (!edgeSelected && !nodeHit) continue
    edges.add(e.id)
    if (edgeSelected) {
      // Edge click: endpoints are focus, their other neighbors stay secondary.
      focus.add(e.source)
      focus.add(e.target)
    }
  }

  for (const e of DATAPATH_EDGES) {
    if (e.source === e.target) continue
    if (!focus.has(e.source) && !focus.has(e.target)) continue
    edges.add(e.id)
    if (focus.has(e.source)) neighbors.add(e.target)
    if (focus.has(e.target)) neighbors.add(e.source)
  }

  for (const id of focus) neighbors.delete(id)
  return { focus, neighbors, edges }
}

const handleCls = '!h-2 !w-2 !border-0 !bg-transparent'

/** Handles sit on the border so wires attach outside the card body. */
function DatapathBlockNode({ data }: NodeProps) {
  const d = data as BlockData
  return (
    <div
      className={cn(
        'relative z-10 cursor-pointer rounded-md border bg-card px-2 py-1.5 text-xs shadow-sm',
        d.highlight === 'focus' &&
          'border-indigo-500 ring-2 ring-indigo-500/80 bg-indigo-500/10',
        d.highlight === 'neighbor' &&
          'border-indigo-400/80 ring-2 ring-indigo-400/50 bg-indigo-500/5',
        !d.highlight && d.active && 'border-amber-500 ring-2 ring-amber-500/40',
        d.drillable && !d.highlight && 'hover:border-primary/50',
      )}
      style={{ minWidth: 110, width: '100%', height: '100%' }}
    >
      {/* Left targets */}
      <Handle type="target" position={Position.Left} id="in-l1" className={handleCls} style={{ top: '25%' }} />
      <Handle type="target" position={Position.Left} id="in-l2" className={handleCls} style={{ top: '50%' }} />
      <Handle type="target" position={Position.Left} id="in-l3" className={handleCls} style={{ top: '75%' }} />
      <Handle type="target" position={Position.Left} id="in" className={handleCls} style={{ top: '50%' }} />
      {/* Right sources / target for feedback */}
      <Handle type="source" position={Position.Right} id="out-r1" className={handleCls} style={{ top: '25%' }} />
      <Handle type="source" position={Position.Right} id="out-r2" className={handleCls} style={{ top: '50%' }} />
      <Handle type="source" position={Position.Right} id="out-r3" className={handleCls} style={{ top: '75%' }} />
      <Handle type="source" position={Position.Right} id="out" className={handleCls} style={{ top: '50%' }} />
      <Handle type="target" position={Position.Right} id="in-r" className={handleCls} style={{ top: '40%' }} />
      {/* Top / bottom */}
      <Handle type="target" position={Position.Top} id="in-t" className={handleCls} style={{ left: '50%' }} />
      <Handle type="source" position={Position.Top} id="out-t" className={handleCls} style={{ left: '35%' }} />
      <Handle type="source" position={Position.Bottom} id="out-b" className={handleCls} style={{ left: '50%' }} />
      <Handle type="target" position={Position.Bottom} id="in-b" className={handleCls} style={{ left: '50%' }} />

      <div className="flex items-center justify-between gap-1">
        <div className="truncate font-medium">{d.label}</div>
        {d.drillable ? (
          <button
            type="button"
            className="nodrag nopan flex h-6 w-6 items-center justify-center rounded border border-transparent text-[10px] text-muted-foreground hover:border-border hover:bg-muted hover:text-primary"
            title="Inspect internals"
            aria-label="Inspect internals"
            onClick={(e) => {
              e.stopPropagation()
              d.onDrill?.()
            }}
          >
            ⇅
          </button>
        ) : null}
      </div>
      <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-tight text-muted-foreground">
        {d.lines.map((line, i) => (
          <div key={i} className="truncate">
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

const nodeTypes = { datapathBlock: DatapathBlockNode }

function comboViewAsSequential(view: ComboCircuit): SequentialCircuit {
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

type DrillFrame = {
  key: string
  label: string
  circuit: SequentialCircuit
}

type Props = {
  state: DatapathState
  className?: string
}

function DatapathCanvasInner({ state, className }: Props) {
  const { t } = useTranslation()
  const [gates, setGates] = useState<LogicGate[]>([])
  const [drillStack, setDrillStack] = useState<DrillFrame[]>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([])

  useEffect(() => {
    void listGates().then(setGates)
  }, [])

  const active = useMemo(
    () => new Set(state.signals.activeEdges),
    [state.signals.activeEdges],
  )

  const activeNodes = useMemo(() => {
    const ids = new Set<string>()
    for (const e of DATAPATH_EDGES) {
      if (active.has(e.id)) {
        ids.add(e.source)
        ids.add(e.target)
      }
    }
    return ids
  }, [active])

  const neighborhood = useMemo(
    () => selectionNeighborhood(selectedNodeIds, selectedEdgeIds),
    [selectedNodeIds, selectedEdgeIds],
  )

  const clearSelection = useCallback(() => {
    setSelectedNodeIds([])
    setSelectedEdgeIds([])
  }, [])

  /**
   * Fully controlled nodes/edges without onNodesChange/onEdgesChange do not
   * receive RF select updates — drive selection from click handlers instead.
   */
  const onNodeClick = useCallback((_: MouseEvent, node: Node) => {
    setSelectedEdgeIds([])
    setSelectedNodeIds([node.id])
  }, [])

  const onEdgeClick = useCallback((_: MouseEvent, edge: Edge) => {
    setSelectedNodeIds([])
    setSelectedEdgeIds([edge.id])
  }, [])

  const onDrill = useCallback(
    (moduleKey: string, label: string) => {
      if (getSeqModule(moduleKey) && hasSeqInternals(moduleKey)) {
        const internals = buildSeqInternals(moduleKey, gates)
        if (!internals) return
        setDrillStack((prev) => [
          ...prev,
          {
            key: `seq:${moduleKey}:${prev.length}`,
            label,
            circuit: { ...internals, id: `${internals.id}#${prev.length}` },
          },
        ])
        return
      }
      if (hasModuleInternals(moduleKey)) {
        const internals = buildModuleInternals(moduleKey, gates)
        if (!internals) return
        const asSeq = comboViewAsSequential(internals)
        setDrillStack((prev) => [
          ...prev,
          {
            key: `combo:${moduleKey}:${prev.length}`,
            label,
            circuit: { ...asSeq, id: `${asSeq.id}#${prev.length}` },
          },
        ])
      }
    },
    [gates],
  )

  const hasSelection =
    neighborhood.focus.size > 0 || neighborhood.edges.size > 0

  const nodes: Node[] = useMemo(
    () =>
      DATAPATH_NODES.map((n) => {
        const labelKey = n.labelKey
        const localized = t(labelKey)
        const label = localized === labelKey ? n.label : localized
        const drillable = !!(
          n.moduleKey &&
          (hasSeqInternals(n.moduleKey) || hasModuleInternals(n.moduleKey))
        )
        const highlight: NodeHighlight | undefined = neighborhood.focus.has(n.id)
          ? 'focus'
          : neighborhood.neighbors.has(n.id)
            ? 'neighbor'
            : undefined
        return {
          id: n.id,
          type: 'datapathBlock',
          position: { x: n.x, y: n.y },
          style: { width: n.w, height: n.h },
          zIndex: 10,
          selected: selectedNodeIds.includes(n.id),
          data: {
            label,
            lines: busLinesForNode(
              n.id,
              state.signals.buses,
              state.regs,
              state.mem,
              state.pc,
              state.ir,
              state.imm,
              state.z,
              state.c,
              state.phase,
            ),
            drillable,
            active: activeNodes.has(n.id),
            highlight,
            onDrill: drillable && n.moduleKey
              ? () => onDrill(n.moduleKey!, label)
              : undefined,
          } satisfies BlockData,
          draggable: false,
          selectable: true,
        }
      }),
    [t, state, activeNodes, neighborhood, onDrill, selectedNodeIds],
  )

  const edges: Edge[] = useMemo(
    () =>
      DATAPATH_EDGES.filter((e) => e.source !== e.target).map((e) => {
        const simLit = active.has(e.id)
        const selLit = neighborhood.edges.has(e.id)
        const edgeFocused = selectedEdgeIds.includes(e.id)

        const stroke = selLit
          ? SEL_STROKE
          : simLit && !hasSelection
            ? SIM_HIGH_STROKE
            : hasSelection && !selLit
              ? DIM_STROKE
              : SIM_IDLE_STROKE
        const strokeWidth = edgeFocused
          ? SEL_STROKE_WIDTH + 1
          : selLit
            ? SEL_STROKE_WIDTH
            : simLit && !hasSelection
              ? 2.5
              : 1.25

        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? 'out',
          targetHandle: e.targetHandle ?? 'in',
          type: 'smoothstep',
          label: e.label,
          animated: simLit && !hasSelection,
          selected: edgeFocused,
          selectable: true,
          focusable: true,
          interactionWidth: 28,
          pathOptions: {
            offset: e.offset ?? 0,
            borderRadius: 12,
          },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { stroke, strokeWidth },
          labelStyle: {
            fontSize: 9,
            fill: selLit ? '#4338ca' : simLit && !hasSelection ? '#b45309' : '#64748b',
          },
          labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 },
          labelBgPadding: [2, 4] as [number, number],
          zIndex: edgeFocused ? 6 : selLit ? 5 : 1,
        }
      }),
    [active, neighborhood, hasSelection, selectedEdgeIds],
  )

  const viewing = drillStack.length > 0 ? drillStack[drillStack.length - 1]! : null

  if (viewing) {
    return (
      <div className={cn('flex h-full min-h-[360px] flex-col gap-2', className)}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDrillStack((s) => s.slice(0, -1))}
          >
            {t('cpu.drillBack')}
          </Button>
          <span className="text-muted-foreground">
            {t('cpu.drillPath')}:{' '}
            {drillStack.map((f) => f.label).join(' / ')}
          </span>
        </div>
        <SeqCircuitCanvas
          className="min-h-0 flex-1 rounded border"
          circuit={viewing.circuit}
          gates={gates}
          readOnly
          onChange={() => {}}
          onDrillModule={(key) => {
            if (!hasSeqInternals(key)) return
            const internals = buildSeqInternals(key, gates)
            if (!internals) return
            const labelKey = `circuits.modules.${key}`
            const localized = t(labelKey)
            setDrillStack((prev) => [
              ...prev,
              {
                key: `seq:${key}:${prev.length}`,
                label: localized === labelKey ? key : localized,
                circuit: { ...internals, id: `${internals.id}#${prev.length}` },
              },
            ])
          }}
          onDrillComboModule={(key) => {
            if (!hasModuleInternals(key)) return
            const internals = buildModuleInternals(key, gates)
            if (!internals) return
            const asSeq = comboViewAsSequential(internals)
            const labelKey = `circuits.modules.${key}`
            const localized = t(labelKey)
            setDrillStack((prev) => [
              ...prev,
              {
                key: `combo:${key}:${prev.length}`,
                label: localized === labelKey ? key : localized,
                circuit: { ...asSeq, id: `${asSeq.id}#${prev.length}` },
              },
            ])
          }}
        />
      </div>
    )
  }

  return (
    <div className={cn('h-full min-h-[280px] rounded border sm:min-h-[360px]', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        edgesFocusable
        selectNodesOnDrag={false}
        elevateNodesOnSelect
        elevateEdgesOnSelect
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={clearSelection}
        defaultEdgeOptions={{
          type: 'smoothstep',
          selectable: true,
          focusable: true,
          interactionWidth: 36,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

export function DatapathCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <DatapathCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
