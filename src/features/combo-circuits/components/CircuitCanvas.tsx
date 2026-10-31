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
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { circuitNodeTypes, type DeviceNodeData, type IoNodeData } from './canvasNodes'
import { PALETTE_MIME, type PalettePayload } from './ModulePalette'

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

  const nodes: Node[] = []

  circuit.inputs.forEach((pin, i) => {
    const bit = endpointBits?.[endpointKey({ nodeId: 'io', pinId: pin.id })]
    nodes.push({
      id: ioFlowId(pin.id),
      type: 'circuitIo',
      position: { x: 24, y: 40 + i * 96 },
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
      position: { x: 1120, y: 40 + i * 96 },
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
    return {
      id: w.id,
      source,
      target,
      sourceHandle: w.from.pinId,
      targetHandle: w.to.pinId,
      style: {
        stroke: high ? '#f59e0b' : '#94a3b8',
        strokeWidth: high ? 2.5 : 1.5,
      },
      animated: high,
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

  const [nodes, setNodes] = useState<Node[]>(graph.nodes)
  const [edges, setEdges] = useState<Edge[]>(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph])

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
    setSelected({
      nodes: params.nodes.map((n) => n.id),
      edges: params.edges.map((e) => e.id),
    })
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
