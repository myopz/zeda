import type { LogicGate } from '@/features/logic-gates/types'
import type { ComboCircuit } from '@/features/combo-circuits/types'
import {
  createSimState,
  evaluateSimCircuit,
  SeqSimError,
  type ComboResolver,
  type FfSimState,
  type GateResolver,
  type SeqEvalResult,
  type SimCircuit,
  type SimNode,
} from '@/features/flip-flops/lib/seq-sim'
import type {
  Bit,
  CircuitWire,
  SeqNode,
  SequentialCircuit,
  WireEndpoint,
} from '../types'
import { resolveSeqOrFfModule } from './seq-modules'

export { SeqSimError }
export type { FfSimState, SeqEvalResult }

export type CircuitResolver = (
  id: string,
) => SequentialCircuit | undefined

function mapEndpoint(
  ep: WireEndpoint,
  nodeIdMap: Map<string, string>,
  pinRemap: Map<string, WireEndpoint>,
): WireEndpoint {
  if (ep.nodeId === 'io') {
    const mapped = pinRemap.get(ep.pinId)
    if (!mapped) {
      throw new SeqSimError(`Missing nested IO remap for pin ${ep.pinId}`)
    }
    return mapped
  }
  const nextNode = nodeIdMap.get(ep.nodeId)
  if (!nextNode) {
    throw new SeqSimError(`Missing nested node remap for ${ep.nodeId}`)
  }
  return { nodeId: nextNode, pinId: ep.pinId }
}

/**
 * Inline nested `circuit` nodes one level at a time (with cycle detection).
 * Child IO pins are rewired to the parent's connections to that instance.
 */
export function flattenNestedCircuits(
  circuit: SequentialCircuit,
  resolveCircuit: CircuitResolver,
  stack: string[] = [],
): SequentialCircuit {
  if (stack.includes(circuit.id)) {
    throw new SeqSimError(
      `Circular sequential circuit reference involving "${circuit.id}"`,
    )
  }
  const nextStack = [...stack, circuit.id]

  const hasNested = circuit.nodes.some((n) => n.kind === 'circuit')
  if (!hasNested) return circuit

  const nodes: SeqNode[] = []
  const wires: CircuitWire[] = []
  let seq = 0

  // Keep non-circuit nodes as-is.
  for (const n of circuit.nodes) {
    if (n.kind !== 'circuit') nodes.push(n)
  }

  // Keep wires that do not touch circuit-node pins for now; rebuild below.
  const circuitNodeIds = new Set(
    circuit.nodes.filter((n) => n.kind === 'circuit').map((n) => n.id),
  )

  for (const w of circuit.wires) {
    if (
      circuitNodeIds.has(w.from.nodeId) ||
      circuitNodeIds.has(w.to.nodeId)
    ) {
      continue
    }
    wires.push(w)
  }

  for (const n of circuit.nodes) {
    if (n.kind !== 'circuit') continue
    const child = resolveCircuit(n.circuitId)
    if (!child) {
      throw new SeqSimError(`Unresolved nested circuit "${n.circuitId}"`)
    }
    const flatChild = flattenNestedCircuits(child, resolveCircuit, nextStack)
    const prefix = `${n.id}__`
    const nodeIdMap = new Map<string, string>()
    for (const cn of flatChild.nodes) {
      const newId = `${prefix}${cn.id}`
      nodeIdMap.set(cn.id, newId)
      nodes.push({ ...cn, id: newId })
    }

    // Map child IO pin id -> parent wire endpoint connected to this instance.
    const childInRemap = new Map<string, WireEndpoint>()
    const childOutRemap = new Map<string, WireEndpoint>()

    for (const pin of flatChild.inputs) {
      const parentWire = circuit.wires.find(
        (w) =>
          w.to.nodeId === n.id &&
          (w.to.pinId === pin.id || w.to.pinId.endsWith(`:${pin.name}`)),
      )
      // Also match by pin name against module-style ids
      const byName = circuit.wires.find((w) => {
        if (w.to.nodeId !== n.id) return false
        return (
          w.to.pinId === pin.id ||
          w.to.pinId.endsWith(`:in:${pin.name}`) ||
          w.to.pinId === pin.name
        )
      })
      const hit = parentWire ?? byName
      if (hit) childInRemap.set(pin.id, hit.from)
    }
    for (const pin of flatChild.outputs) {
      const parentWire = circuit.wires.find(
        (w) =>
          w.from.nodeId === n.id &&
          (w.from.pinId === pin.id ||
            w.from.pinId.endsWith(`:out:${pin.name}`) ||
            w.from.pinId === pin.name),
      )
      if (parentWire) childOutRemap.set(pin.id, parentWire.to)
    }

    for (const w of flatChild.wires) {
      const fromIsIo = w.from.nodeId === 'io'
      const toIsIo = w.to.nodeId === 'io'
      if (fromIsIo && toIsIo) continue

      if (fromIsIo) {
        const src = childInRemap.get(w.from.pinId)
        if (!src) continue
        wires.push({
          id: `${prefix}w${seq++}`,
          from: src,
          to: mapEndpoint(w.to, nodeIdMap, new Map()),
        })
        continue
      }
      if (toIsIo) {
        const dst = childOutRemap.get(w.to.pinId)
        if (!dst) continue
        wires.push({
          id: `${prefix}w${seq++}`,
          from: mapEndpoint(w.from, nodeIdMap, new Map()),
          to: dst,
        })
        continue
      }
      wires.push({
        id: `${prefix}w${seq++}`,
        from: mapEndpoint(w.from, nodeIdMap, new Map()),
        to: mapEndpoint(w.to, nodeIdMap, new Map()),
      })
    }
  }

  return {
    ...circuit,
    nodes,
    wires,
  }
}

function toSimNodes(nodes: SeqNode[]): SimNode[] {
  const out: SimNode[] = []
  for (const n of nodes) {
    if (n.kind === 'gate') {
      out.push({ id: n.id, kind: 'gate', ref: n.ref })
    } else if (n.kind === 'ff' || n.kind === 'seq') {
      out.push({ id: n.id, kind: n.kind, moduleKey: n.moduleKey })
    } else if (n.kind === 'combo') {
      out.push({ id: n.id, kind: 'combo', circuitId: n.circuitId })
    } else if (n.kind === 'comboModule') {
      out.push({ id: n.id, kind: 'comboModule', moduleKey: n.moduleKey })
    }
  }
  return out
}

export function toSimCircuit(circuit: SequentialCircuit): SimCircuit {
  return {
    inputs: circuit.inputs,
    outputs: circuit.outputs,
    nodes: toSimNodes(circuit.nodes),
    wires: circuit.wires,
    behaviorKey: circuit.behaviorKey,
    builtinKey: circuit.builtinKey,
  }
}

export function evaluateSequentialCircuit(
  circuit: SequentialCircuit,
  inputBits: Record<string, Bit>,
  sim: FfSimState,
  resolveGate: GateResolver,
  resolveCircuit: CircuitResolver,
  resolveCombo: ComboResolver = () => undefined,
): SeqEvalResult {
  const flat = flattenNestedCircuits(circuit, resolveCircuit)
  return evaluateSimCircuit(
    toSimCircuit(flat),
    inputBits,
    sim,
    resolveGate,
    resolveSeqOrFfModule,
    resolveCombo,
  )
}

export function createInitialSeqSimState(
  circuit: SequentialCircuit,
  resolveCircuit: CircuitResolver = () => undefined,
): FfSimState {
  const flat = flattenNestedCircuits(circuit, resolveCircuit)
  return createSimState(toSimCircuit(flat), resolveSeqOrFfModule)
}

export function runSeqWaveform(
  circuit: SequentialCircuit,
  slots: Record<string, Bit>[],
  resolveGate: GateResolver,
  resolveCircuit: CircuitResolver,
  resolveCombo: ComboResolver = () => undefined,
  initial?: FfSimState,
): { samples: SeqEvalResult[]; warnings: string[] } {
  let sim = initial ?? createInitialSeqSimState(circuit, resolveCircuit)
  const samples: SeqEvalResult[] = []
  const warnings: string[] = []
  for (const slot of slots) {
    const result = evaluateSequentialCircuit(
      circuit,
      slot,
      sim,
      resolveGate,
      resolveCircuit,
      resolveCombo,
    )
    samples.push(result)
    warnings.push(...result.warnings)
    sim = { ffState: result.ffState, prevClk: result.prevClk }
  }
  return { samples, warnings }
}

export type { ComboCircuit }

export function makeGateResolver(
  gateMap: Map<string, LogicGate>,
): GateResolver {
  return (node) => {
    if (node.ref.builtinKey) {
      for (const g of gateMap.values()) {
        if (g.builtinKey === node.ref.builtinKey) return g
      }
    }
    if (node.ref.gateId) return gateMap.get(node.ref.gateId)
    return undefined
  }
}
