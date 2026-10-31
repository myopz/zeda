import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LogicGate } from '@/features/logic-gates/types'
import { createId, cn } from '@/lib/utils'
import { hasModuleInternals } from '../lib/internals'
import { getModule } from '../lib/modules'
import { endpointKey } from '../lib/netlist'
import type {
  Bit,
  ComboCircuit,
  CircuitNode,
  CircuitWire,
  WireEndpoint,
} from '../types'
import {
  circuitNodeTypes,
  type DeviceNodeData,
  type IoNodeData,
  type NodeHighlight,
} from './canvasNodes'
import { PALETTE_MIME, type PalettePayload } from './ModulePalette'

/** Selection neighborhood stroke — distinct from sim amber (#f59e0b) / idle slate. */
const SEL_STROKE = '#6366f1'
const SEL_STROKE_WIDTH = 3
const SIM_HIGH_STROKE = '#f59e0b'
const SIM_IDLE_STROKE = '#94a3b8'

type SelectionNeighborhood = {
  focusNodeIds: Set<string>
  neighborNodeIds: Set<string>
  edgeIds: Set<string>
}

function selectionNeighborhood(
  selectedNodeIds: string[],
  selectedEdgeIds: string[],
  edges: Edge[],
): SelectionNeighborhood {
  const focusNodeIds = new Set(selectedNodeIds)
  const selectedEdges = new Set(selectedEdgeIds)
  const neighborNodeIds = new Set<string>()
  const edgeIds = new Set<string>()

  for (const e of edges) {
    const fromFocus = focusNodeIds.has(e.source)
    const toFocus = focusNodeIds.has(e.target)
    const edgeSelected = selectedEdges.has(e.id)
    if (!fromFocus && !toFocus && !edgeSelected) continue
    edgeIds.add(e.id)
    if (fromFocus || edgeSelected) neighborNodeIds.add(e.target)
    if (toFocus || edgeSelected) neighborNodeIds.add(e.source)
  }

  for (const id of focusNodeIds) neighborNodeIds.delete(id)

  return { focusNodeIds, neighborNodeIds, edgeIds }
}

function nodeHighlightRole(
  id: string,
  nh: SelectionNeighborhood,
): NodeHighlight | undefined {
  if (nh.focusNodeIds.has(id)) return 'focus'
  if (nh.neighborNodeIds.has(id)) return 'neighbor'
  return undefined
}

function sameIdList(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

type EdgeSimData = {
  baseStroke: string
  baseStrokeWidth: number
  baseAnimated: boolean
}

/** Preserve RF measurement fields — dropping them leaves nodes visibility:hidden. */
function adoptMeasured(base: Node, prev: Node | undefined): Node {
  if (!prev) return base
  return {
    ...base,
    position: prev.dragging ? prev.position : base.position,
    dragging: prev.dragging,
    width: prev.width,
    height: prev.height,
    measured: prev.measured,
  }
}

function paintSelection(
  nodes: Node[],
  edges: Edge[],
  selectedNodeIds: string[],
  selectedEdgeIds: string[],
): { nodes: Node[]; edges: Edge[] } {
  const nh = selectionNeighborhood(selectedNodeIds, selectedEdgeIds, edges)
  const nextNodes = nodes.map((n) => {
    const highlight = nodeHighlightRole(n.id, nh)
    const selected = nh.focusNodeIds.has(n.id)
    const prevHighlight = (n.data as { highlight?: NodeHighlight }).highlight
    if (prevHighlight === highlight && n.selected === selected) return n
    return {
      ...n,
      selected,
      data: { ...n.data, highlight },
    }
  })
  const nextEdges = edges.map((e) => {
    const linked = nh.edgeIds.has(e.id)
    const edgeSelected = selectedEdgeIds.includes(e.id)
    const sim = e.data as EdgeSimData | undefined
    const baseStroke = sim?.baseStroke ?? SIM_IDLE_STROKE
    const baseStrokeWidth = sim?.baseStrokeWidth ?? 1.5
    const baseAnimated = sim?.baseAnimated ?? false
    const stroke = linked ? SEL_STROKE : baseStroke
    const strokeWidth = linked ? SEL_STROKE_WIDTH : baseStrokeWidth
    const animated = linked ? false : baseAnimated
    const zIndex = linked ? 1002 : undefined
    if (
      e.selected === edgeSelected &&
      e.animated === animated &&
      e.zIndex === zIndex &&
      e.style?.stroke === stroke &&
      e.style?.strokeWidth === strokeWidth
    ) {
      return e
    }
    return {
      ...e,
      selected: edgeSelected,
      animated,
      zIndex,
      style: { ...e.style, stroke, strokeWidth },
    }
  })
  return { nodes: nextNodes, edges: nextEdges }
}

type Props = {
  circuit: ComboCircuit
  gates: LogicGate[]
  readOnly?: boolean
  onChange: (next: ComboCircuit) => void
  /** Simulation endpoint bits (`nodeId::pinId` -> bit) for wire/pin highlight */
  endpointBits?: Record<string, Bit>
  nodeOutBits?: Record<string, Record<string, Bit>>
  onDrillModule?: (moduleKey: string) => void
  /** Toggle a circuit input pin level (simulation) */
  onToggleInput?: (pinId: string) => void
  className?: string
}

function ioFlowId(pinId: string) {
  return `io:${pinId}`
}

function parseFlowNodeId(id: string): WireEndpoint {
  if (id.startsWith('io:')) {
    return { nodeId: 'io', pinId: id.slice(3) }
  }
  return { nodeId: id, pinId: '' }
}

/** Match DeviceNode / internals footprints so IO columns clear device AABBs. */
const DEVICE_W_GATE = 160
const DEVICE_W_MODULE = 180
const IO_CARD_W = 72
const IO_CLEAR_GAP = 96
const IO_ROW = 96
const IO_TOP = 40
const IO_Z = 1000

/** Place input/output port columns outside the device bounding box. */
function ioColumnXs(nodes: CircuitNode[]): { inX: number; outX: number } {
  if (nodes.length === 0) {
    return { inX: 24, outX: 480 }
  }
  let minX = Number.POSITIVE_INFINITY
  let maxRight = Number.NEGATIVE_INFINITY
  for (const n of nodes) {
    const w = n.kind === 'module' ? DEVICE_W_MODULE : DEVICE_W_GATE
    minX = Math.min(minX, n.position.x)
    maxRight = Math.max(maxRight, n.position.x + w)
  }
  return {
    inX: minX - IO_CARD_W - IO_CLEAR_GAP,
    outX: maxRight + IO_CLEAR_GAP,
  }
}

function buildFlowGraph(
  circuit: ComboCircuit,
  gates: LogicGate[],
  endpointBits?: Record<string, Bit>,
  nodeOutBits?: Record<string, Record<string, Bit>>,
  moduleLabel?: (key: string) => string,
  onToggleInput?: (pinId: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const gateById = new Map(gates.map((g) => [g.id, g]))
  const gateByKey = new Map<string, LogicGate>()
  for (const g of gates) {
    if (g.builtinKey) gateByKey.set(g.builtinKey, g)
  }

  const { inX, outX } = ioColumnXs(circuit.nodes)
  const nodes: Node[] = []

  circuit.inputs.forEach((pin, i) => {
    const bit = endpointBits?.[endpointKey({ nodeId: 'io', pinId: pin.id })]
    nodes.push({
      id: ioFlowId(pin.id),
      type: 'circuitIo',
      position: { x: inX, y: IO_TOP + i * IO_ROW },
      zIndex: IO_Z,
      data: {
        role: 'in',
        label: pin.name,
        pinId: pin.id,
        bit,
        onToggle: onToggleInput ? () => onToggleInput(pin.id) : undefined,
      } satisfies IoNodeData,
      draggable: true,
    })
  })

  circuit.outputs.forEach((pin, i) => {
    const bit = endpointBits?.[endpointKey({ nodeId: 'io', pinId: pin.id })]
    nodes.push({
      id: ioFlowId(pin.id),
      type: 'circuitIo',
      position: { x: outX, y: IO_TOP + i * IO_ROW },
      zIndex: IO_Z,
      data: {
        role: 'out',
        label: pin.name,
        pinId: pin.id,
        bit,
      } satisfies IoNodeData,
      draggable: true,
    })
  })

  for (const node of circuit.nodes) {
    let inputs: { id: string; name: string }[] = []
    let outputs: { id: string; name: string }[] = []
    let label = node.id
    let gate: LogicGate | undefined
    let moduleKey: string | undefined
    let drillable = false

    if (node.kind === 'gate') {
      gate =
        (node.ref.builtinKey ? gateByKey.get(node.ref.builtinKey) : undefined) ??
        (node.ref.gateId ? gateById.get(node.ref.gateId) : undefined)
      if (gate) {
        inputs = gate.inputs
        outputs = gate.outputs
        label = gate.name
      } else {
        label = `Missing gate`
      }
    } else {
      moduleKey = node.moduleKey
      const mod = getModule(node.moduleKey)
      if (mod) {
        inputs = mod.inputs
        outputs = mod.outputs
        label = moduleLabel?.(node.moduleKey) ?? node.moduleKey
        drillable = hasModuleInternals(node.moduleKey)
      } else {
        label = `Missing ${node.moduleKey}`
      }
    }

    const inputBits: Record<string, Bit> = {}
    for (const pin of inputs) {
      const b = endpointBits?.[endpointKey({ nodeId: node.id, pinId: pin.id })]
      if (b !== undefined) inputBits[pin.id] = b
    }
    const outputBits = nodeOutBits?.[node.id] ?? {}

    nodes.push({
      id: node.id,
      type: 'device',
      position: node.position,
      data: {
        label,
        inputs,
        outputs,
        moduleKey,
        drillable,
        inputBits,
        outputBits,
        gate: gate
          ? {
              builtinKey: gate.builtinKey,
              inputs: gate.inputs,
              outputs: gate.outputs,
              name: gate.name,
            }
          : undefined,
      } satisfies DeviceNodeData,
    })
  }

  const edges: Edge[] = circuit.wires.map((w) => {
    const source =
      w.from.nodeId === 'io' ? ioFlowId(w.from.pinId) : w.from.nodeId
    const target = w.to.nodeId === 'io' ? ioFlowId(w.to.pinId) : w.to.nodeId
    const bit =
      endpointBits?.[endpointKey(w.from)] ??
      endpointBits?.[endpointKey(w.to)]
    const high = bit === 1
    const baseStroke = high ? SIM_HIGH_STROKE : SIM_IDLE_STROKE
    const baseStrokeWidth = high ? 2.5 : 1.5
    return {
      id: w.id,
      source,
      target,
      sourceHandle: w.from.pinId,
      targetHandle: w.to.pinId,
      style: {
        stroke: baseStroke,
        strokeWidth: baseStrokeWidth,
      },
      animated: high,
      data: {
        baseStroke,
        baseStrokeWidth,
        baseAnimated: high,
      } satisfies EdgeSimData,
    }
  })

  return { nodes, edges }
}

function CanvasInner({
  circuit,
  gates,
  readOnly,
  onChange,
  endpointBits,
  nodeOutBits,
  onDrillModule,
  onToggleInput,
  className,
}: Props) {
  const { t } = useTranslation()
  const { screenToFlowPosition } = useReactFlow()
  const [selected, setSelected] = useState<{ nodes: string[]; edges: string[] }>({
    nodes: [],
    edges: [],
  })

  const moduleLabel = useCallback(
    (key: string) => {
      const i18nKey = `circuits.modules.${key}`
      const label = t(i18nKey)
      return label === i18nKey ? key : label
    },
    [t],
  )

  const graph = useMemo(
    () =>
      buildFlowGraph(
        circuit,
        gates,
        endpointBits,
        nodeOutBits,
        moduleLabel,
        onToggleInput,
      ),
    [circuit, gates, endpointBits, nodeOutBits, moduleLabel, onToggleInput],
  )

  const [nodes, setNodes] = useState<Node[]>(() =>
    paintSelection(graph.nodes, graph.edges, [], []).nodes,
  )
  const [edges, setEdges] = useState<Edge[]>(() =>
    paintSelection(graph.nodes, graph.edges, [], []).edges,
  )
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const selectedRef = useRef(selected)
  nodesRef.current = nodes
  edgesRef.current = edges
  selectedRef.current = selected

  // Rebuild from netlist graph; keep RF measurements so nodes stay visible.
  useEffect(() => {
    const sel = selectedRef.current
    const prevById = new Map(nodesRef.current.map((n) => [n.id, n]))
    const adopted = graph.nodes.map((n) => adoptMeasured(n, prevById.get(n.id)))
    const painted = paintSelection(adopted, graph.edges, sel.nodes, sel.edges)
    setNodes(painted.nodes)
    setEdges(painted.edges)
  }, [graph])

  // Selection neighborhood highlight (indigo) without dropping measured sizes.
  useEffect(() => {
    const painted = paintSelection(
      nodesRef.current,
      edgesRef.current,
      selected.nodes,
      selected.edges,
    )
    setNodes(painted.nodes)
    setEdges(painted.edges)
  }, [selected])

  const commitFromGraph = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      const deviceNodes: CircuitNode[] = []

      for (const n of nextNodes) {
        if (n.id.startsWith('io:')) continue
        const existing = circuit.nodes.find((cn) => cn.id === n.id)
        if (!existing) continue
        deviceNodes.push({ ...existing, position: n.position })
      }

      const wires: CircuitWire[] = nextEdges.map((e) => {
        const fromBase = parseFlowNodeId(e.source)
        const toBase = parseFlowNodeId(e.target)
        return {
          id: e.id,
          from: {
            nodeId: fromBase.nodeId,
            pinId: e.sourceHandle ?? fromBase.pinId,
          },
          to: {
            nodeId: toBase.nodeId,
            pinId: e.targetHandle ?? toBase.pinId,
          },
        }
      })

      onChange({
        ...circuit,
        nodes: deviceNodes,
        wires,
        updatedAt: Date.now(),
      })
    },
    [circuit, onChange],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || !connection.source || !connection.target) return
      if (!connection.sourceHandle || !connection.targetHandle) return

      const wire: CircuitWire = {
        id: createId('wire'),
        from: {
          nodeId: parseFlowNodeId(connection.source).nodeId,
          pinId: connection.sourceHandle,
        },
        to: {
          nodeId: parseFlowNodeId(connection.target).nodeId,
          pinId: connection.targetHandle,
        },
      }
      onChange({
        ...circuit,
        wires: [...circuit.wires, wire],
        updatedAt: Date.now(),
      })
    },
    [circuit, onChange, readOnly],
  )

  const onNodeDragStop = useCallback(() => {
    if (readOnly) return
    commitFromGraph(nodes, edges)
  }, [commitFromGraph, edges, nodes, readOnly])

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    const nodeIds = params.nodes.map((n) => n.id)
    const edgeIds = params.edges.map((e) => e.id)
    setSelected((prev) =>
      sameIdList(prev.nodes, nodeIds) && sameIdList(prev.edges, edgeIds)
        ? prev
        : { nodes: nodeIds, edges: edgeIds },
    )
  }, [])

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const data = node.data as DeviceNodeData
      if (data.drillable && data.moduleKey && onDrillModule) {
        onDrillModule(data.moduleKey)
      }
    },
    [onDrillModule],
  )

  useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const removeNodeIds = new Set(
        selected.nodes.filter((id) => !id.startsWith('io:')),
      )
      const removeEdgeIds = new Set(selected.edges)

      if (removeNodeIds.size === 0 && removeEdgeIds.size === 0) return
      e.preventDefault()

      onChange({
        ...circuit,
        nodes: circuit.nodes.filter((n) => !removeNodeIds.has(n.id)),
        wires: circuit.wires.filter(
          (w) =>
            !removeEdgeIds.has(w.id) &&
            !removeNodeIds.has(w.from.nodeId) &&
            !removeNodeIds.has(w.to.nodeId),
        ),
        updatedAt: Date.now(),
      })
      setSelected({ nodes: [], edges: [] })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [circuit, onChange, readOnly, selected])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (readOnly) return
      e.preventDefault()
      const raw = e.dataTransfer.getData(PALETTE_MIME)
      if (!raw) return
      let payload: PalettePayload
      try {
        payload = JSON.parse(raw) as PalettePayload
      } catch {
        return
      }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const id = createId('node')
      let node: CircuitNode
      if (payload.kind === 'gate') {
        node = {
          id,
          kind: 'gate',
          ref: {
            gateId: payload.gateId,
            builtinKey: payload.builtinKey,
          },
          position,
        }
      } else {
        node = {
          id,
          kind: 'module',
          moduleKey: payload.moduleKey,
          position,
        }
      }
      onChange({
        ...circuit,
        nodes: [...circuit.nodes, node],
        updatedAt: Date.now(),
      })
    },
    [circuit, onChange, readOnly, screenToFlowPosition],
  )

  return (
    <div
      className={cn(
        'flex h-full min-h-[360px] flex-col overflow-hidden bg-muted/20',
        className,
      )}
    >
      <div className="min-h-0 flex-1" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={circuitNodeTypes}
          onNodesChange={(changes) => {
            setNodes((prev) => {
              let next = [...prev]
              for (const ch of changes) {
                if (ch.type === 'position' && ch.position) {
                  next = next.map((n) =>
                    n.id === ch.id
                      ? { ...n, position: ch.position!, dragging: ch.dragging }
                      : n,
                  )
                } else if (ch.type === 'select') {
                  next = next.map((n) =>
                    n.id === ch.id ? { ...n, selected: ch.selected } : n,
                  )
                }
              }
              return next
            })
          }}
          onEdgesChange={(changes) => {
            setEdges((prev) => {
              let next = [...prev]
              for (const ch of changes) {
                if (ch.type === 'select') {
                  next = next.map((e) =>
                    e.id === ch.id ? { ...e, selected: ch.selected } : e,
                  )
                }
              }
              return next
            })
          }}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          onSelectionChange={onSelectionChange}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}

export function CircuitCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
