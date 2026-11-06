import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
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
import {
  PALETTE_MIME,
  clearPaletteDrag,
  notePaletteDragMove,
  peekPaletteDrag,
  type PalettePayload,
} from './ModulePalette'

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
  /** All circuits for nested refs / labels (may include current). */
  circuits?: ComboCircuit[]
  readOnly?: boolean
  onChange: (next: ComboCircuit) => void
  /** Simulation endpoint bits (`nodeId::pinId` -> bit) for wire/pin highlight */
  endpointBits?: Record<string, Bit>
  nodeOutBits?: Record<string, Record<string, Bit>>
  onDrillModule?: (moduleKey: string) => void
  onDrillCircuit?: (circuitId: string) => void
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
    const w = n.kind === 'gate' ? DEVICE_W_GATE : DEVICE_W_MODULE
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
  circuitsById: Map<string, ComboCircuit>,
  endpointBits?: Record<string, Bit>,
  nodeOutBits?: Record<string, Record<string, Bit>>,
  moduleLabel?: (key: string) => string,
  circuitLabel?: (c: ComboCircuit) => string,
  onToggleInput?: (pinId: string) => void,
  onDrillModule?: (moduleKey: string) => void,
  onDrillCircuit?: (circuitId: string) => void,
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
      deletable: false,
      data: {
        role: 'in',
        label: pin.name,
        pinId: pin.id,
        bit,
        onToggle: onToggleInput ? () => onToggleInput(pin.id) : undefined,
      } satisfies IoNodeData,
      draggable: false,
    })
  })

  circuit.outputs.forEach((pin, i) => {
    const bit = endpointBits?.[endpointKey({ nodeId: 'io', pinId: pin.id })]
    nodes.push({
      id: ioFlowId(pin.id),
      type: 'circuitIo',
      position: { x: outX, y: IO_TOP + i * IO_ROW },
      zIndex: IO_Z,
      deletable: false,
      draggable: false,
      data: {
        role: 'out',
        label: pin.name,
        pinId: pin.id,
        bit,
      } satisfies IoNodeData,
    })
  })

  for (const node of circuit.nodes) {
    let inputs: { id: string; name: string }[] = []
    let outputs: { id: string; name: string }[] = []
    let label = node.id
    let gate: LogicGate | undefined
    let moduleKey: string | undefined
    let circuitId: string | undefined
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
    } else if (node.kind === 'circuit') {
      circuitId = node.circuitId
      const ref = circuitsById.get(node.circuitId)
      if (ref) {
        inputs = ref.inputs
        outputs = ref.outputs
        label = circuitLabel?.(ref) ?? ref.name
        drillable = true
      } else {
        label = `Missing circuit`
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
    const onDrill =
      drillable && moduleKey && onDrillModule
        ? () => onDrillModule(moduleKey)
        : drillable && circuitId && onDrillCircuit
          ? () => onDrillCircuit(circuitId)
          : undefined

    nodes.push({
      id: node.id,
      type: 'device',
      position: node.position,
      data: {
        label,
        inputs,
        outputs,
        moduleKey,
        circuitId,
        drillable,
        onDrill,
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
  circuits = [],
  readOnly,
  onChange,
  endpointBits,
  nodeOutBits,
  onDrillModule,
  onDrillCircuit,
  onToggleInput,
  className,
}: Props) {
  const { t } = useTranslation()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const [selected, setSelected] = useState<{ nodes: string[]; edges: string[] }>({
    nodes: [],
    edges: [],
  })
  const circuitRef = useRef(circuit)
  circuitRef.current = circuit

  const circuitsById = useMemo(
    () => new Map(circuits.map((c) => [c.id, c])),
    [circuits],
  )

  const moduleLabel = useCallback(
    (key: string) => {
      const i18nKey = `circuits.modules.${key}`
      const label = t(i18nKey)
      return label === i18nKey ? key : label
    },
    [t],
  )

  const circuitLabel = useCallback(
    (c: ComboCircuit) => {
      if (c.builtinKey) {
        const key = `circuits.modules.${c.builtinKey}`
        const localized = t(key)
        if (localized !== key) return localized
      }
      return c.name
    },
    [t],
  )

  const graph = useMemo(
    () =>
      buildFlowGraph(
        circuit,
        gates,
        circuitsById,
        endpointBits,
        nodeOutBits,
        moduleLabel,
        circuitLabel,
        onToggleInput,
        onDrillModule,
        onDrillCircuit,
      ),
    [
      circuit,
      gates,
      circuitsById,
      endpointBits,
      nodeOutBits,
      moduleLabel,
      circuitLabel,
      onToggleInput,
      onDrillModule,
      onDrillCircuit,
    ],
  )

  // Re-fit when drilling in/out — otherwise the new netlist stays off-camera.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fitView({ padding: 0.18, duration: 200 })
    })
    return () => cancelAnimationFrame(frame)
  }, [circuit.id, fitView])

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
      const c = circuitRef.current
      const deviceNodes: CircuitNode[] = []

      for (const n of nextNodes) {
        if (n.id.startsWith('io:')) continue
        const existing = c.nodes.find((cn) => cn.id === n.id)
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

      const next: ComboCircuit = {
        ...c,
        nodes: deviceNodes,
        wires,
        updatedAt: Date.now(),
      }
      circuitRef.current = next
      onChange(next)
    },
    [onChange],
  )

  const removeFromCircuit = useCallback(
    (removeNodeIds: Set<string>, removeEdgeIds: Set<string>) => {
      if (removeNodeIds.size === 0 && removeEdgeIds.size === 0) return
      const c = circuitRef.current
      const next: ComboCircuit = {
        ...c,
        nodes: c.nodes.filter((n) => !removeNodeIds.has(n.id)),
        wires: c.wires.filter(
          (w) =>
            !removeEdgeIds.has(w.id) &&
            !removeNodeIds.has(w.from.nodeId) &&
            !removeNodeIds.has(w.to.nodeId),
        ),
        updatedAt: Date.now(),
      }
      // Keep ref in sync when RF emits node+edge removes in the same tick.
      circuitRef.current = next
      onChange(next)
      setSelected({ nodes: [], edges: [] })
    },
    [onChange],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || !connection.source || !connection.target) return
      if (!connection.sourceHandle || !connection.targetHandle) return

      const c = circuitRef.current
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
      const next: ComboCircuit = {
        ...c,
        wires: [...c.wires, wire],
        updatedAt: Date.now(),
      }
      circuitRef.current = next
      onChange(next)
    },
    [onChange, readOnly],
  )

  const onNodeDragStop = useCallback(() => {
    if (readOnly) return
    commitFromGraph(nodesRef.current, edgesRef.current)
  }, [commitFromGraph, readOnly])

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
      if (data.circuitId && onDrillCircuit) {
        onDrillCircuit(data.circuitId)
        return
      }
      if (data.drillable && data.moduleKey && onDrillModule) {
        onDrillModule(data.moduleKey)
      }
    },
    [onDrillCircuit, onDrillModule],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removes = changes.filter((ch) => ch.type === 'remove')
      const safeChanges =
        readOnly
          ? changes.filter((ch) => ch.type === 'select' || ch.type === 'dimensions')
          : changes.filter((ch) => {
              if (ch.type !== 'remove') return true
              return !ch.id.startsWith('io:')
            })

      setNodes((prev) => applyNodeChanges(safeChanges, prev))

      if (readOnly || removes.length === 0) return
      const removeNodeIds = new Set(
        removes.map((ch) => ch.id).filter((id) => !id.startsWith('io:')),
      )
      if (removeNodeIds.size === 0) return
      removeFromCircuit(removeNodeIds, new Set())
    },
    [readOnly, removeFromCircuit],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removes = changes.filter((ch) => ch.type === 'remove')
      const safeChanges = readOnly
        ? changes.filter((ch) => ch.type === 'select')
        : changes

      setEdges((prev) => applyEdgeChanges(safeChanges, prev))

      if (readOnly || removes.length === 0) return
      removeFromCircuit(
        new Set(),
        new Set(removes.map((ch) => ch.id)),
      )
    },
    [readOnly, removeFromCircuit],
  )

  const placePayload = useCallback(
    (payload: PalettePayload, clientX: number, clientY: number) => {
      if (readOnly) return
      const position = screenToFlowPosition({ x: clientX, y: clientY })
      const id = createId('node')
      const c = circuitRef.current
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
      } else if (payload.kind === 'circuit') {
        node = {
          id,
          kind: 'circuit',
          circuitId: payload.circuitId,
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
      const next: ComboCircuit = {
        ...c,
        nodes: [...c.nodes, node],
        updatedAt: Date.now(),
      }
      circuitRef.current = next
      onChange(next)
    },
    [onChange, readOnly, screenToFlowPosition],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (readOnly) return
      const raw = e.dataTransfer.getData(PALETTE_MIME)
      if (!raw) return
      let payload: PalettePayload
      try {
        payload = JSON.parse(raw) as PalettePayload
      } catch {
        return
      }
      placePayload(payload, e.clientX, e.clientY)
    },
    [placePayload, readOnly],
  )

  // Touch / pointer drop from ModulePalette (HTML5 DnD is unreliable on mobile).
  useEffect(() => {
    if (readOnly) return
    const onMove = (e: PointerEvent) => {
      notePaletteDragMove(e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      // Desktop mouse uses HTML5 DnD (`onDrop`); this path is for touch / pen.
      if (e.pointerType === 'mouse') return
      const drag = peekPaletteDrag()
      if (!drag?.moved) {
        clearPaletteDrag()
        return
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el?.closest('[data-circuit-canvas-drop]')) {
        clearPaletteDrag()
        return
      }
      clearPaletteDrag()
      placePayload(drag.payload, e.clientX, e.clientY)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [placePayload, readOnly])

  return (
    <div
      className={cn(
        'flex h-full min-h-[360px] flex-col overflow-hidden bg-muted/20',
        className,
      )}
    >
      <div
        className="min-h-0 flex-1"
        data-circuit-canvas-drop
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={circuitNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          onSelectionChange={onSelectionChange}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
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
