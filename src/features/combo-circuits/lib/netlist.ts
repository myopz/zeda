import {
  evalFormula,
  FormulaError,
} from '@/features/logic-gates/lib/bool-engine'
import type { LogicGate } from '@/features/logic-gates/types'
import type { Bit, ComboCircuit, CircuitNode, WireEndpoint } from '../types'
import { evaluateModule, getModule } from './modules'

export class NetlistError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetlistError'
  }
}

export type GateResolver = (
  node: Extract<CircuitNode, { kind: 'gate' }>,
) => LogicGate | undefined

export type CircuitEvalResult = {
  outputs: Record<string, Bit>
  /** endpoint key (`nodeId::pinId`) -> bit */
  endpointBits: Record<string, Bit>
  nodeOutBits: Record<string, Record<string, Bit>>
}

export function endpointKey(ep: WireEndpoint): string {
  return `${ep.nodeId}::${ep.pinId}`
}

class UnionFind {
  private parent = new Map<string, string>()

  add(x: string) {
    if (!this.parent.has(x)) this.parent.set(x, x)
  }

  find(x: string): string {
    this.add(x)
    const p = this.parent.get(x)!
    if (p !== x) {
      const root = this.find(p)
      this.parent.set(x, root)
      return root
    }
    return x
  }

  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }

  groups(): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const key of this.parent.keys()) {
      const root = this.find(key)
      const list = map.get(root) ?? []
      list.push(key)
      map.set(root, list)
    }
    return map
  }
}

function parseEndpointKey(key: string): WireEndpoint {
  const idx = key.indexOf('::')
  return { nodeId: key.slice(0, idx), pinId: key.slice(idx + 2) }
}

function nodeInputPinIds(node: CircuitNode, resolveGate: GateResolver): string[] {
  if (node.kind === 'module') {
    const mod = getModule(node.moduleKey)
    if (!mod) throw new NetlistError(`Unknown module "${node.moduleKey}"`)
    return mod.inputs.map((p) => p.id)
  }
  const gate = resolveGate(node)
  if (!gate) {
    const ref = node.ref.builtinKey ?? node.ref.gateId ?? '?'
    throw new NetlistError(`Unresolved gate reference "${ref}" on node ${node.id}`)
  }
  return gate.inputs.map((p) => p.id)
}

function nodeOutputPinIds(node: CircuitNode, resolveGate: GateResolver): string[] {
  if (node.kind === 'module') {
    const mod = getModule(node.moduleKey)
    if (!mod) throw new NetlistError(`Unknown module "${node.moduleKey}"`)
    return mod.outputs.map((p) => p.id)
  }
  const gate = resolveGate(node)
  if (!gate) {
    const ref = node.ref.builtinKey ?? node.ref.gateId ?? '?'
    throw new NetlistError(`Unresolved gate reference "${ref}" on node ${node.id}`)
  }
  return gate.outputs.map((p) => p.id)
}

function isNodeOutput(
  circuit: ComboCircuit,
  ep: WireEndpoint,
  resolveGate: GateResolver,
): boolean {
  if (ep.nodeId === 'io') return false
  const node = circuit.nodes.find((n) => n.id === ep.nodeId)
  if (!node) throw new NetlistError(`Wire references missing node ${ep.nodeId}`)
  return nodeOutputPinIds(node, resolveGate).includes(ep.pinId)
}

function isCircuitInput(circuit: ComboCircuit, ep: WireEndpoint): boolean {
  return ep.nodeId === 'io' && circuit.inputs.some((p) => p.id === ep.pinId)
}

function isDriverEndpoint(
  circuit: ComboCircuit,
  ep: WireEndpoint,
  resolveGate: GateResolver,
): boolean {
  return isCircuitInput(circuit, ep) || isNodeOutput(circuit, ep, resolveGate)
}

function topologicalSort(
  circuit: ComboCircuit,
  netOf: Map<string, string>,
  resolveGate: GateResolver,
): string[] {
  const nodeIds = circuit.nodes.map((n) => n.id)
  const deps = new Map<string, Set<string>>()
  for (const id of nodeIds) deps.set(id, new Set())

  const netDriverNode = new Map<string, string>()
  for (const node of circuit.nodes) {
    for (const pinId of nodeOutputPinIds(node, resolveGate)) {
      const key = endpointKey({ nodeId: node.id, pinId })
      const root = netOf.get(key)
      if (root) netDriverNode.set(root, node.id)
    }
  }

  for (const node of circuit.nodes) {
    for (const pinId of nodeInputPinIds(node, resolveGate)) {
      const key = endpointKey({ nodeId: node.id, pinId })
      const root = netOf.get(key)
      if (!root) continue
      const driver = netDriverNode.get(root)
      if (driver && driver !== node.id) {
        deps.get(node.id)!.add(driver)
      }
    }
  }

  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of nodeIds) {
    indeg.set(id, 0)
    adj.set(id, [])
  }
  for (const [nodeId, set] of deps) {
    for (const d of set) {
      adj.get(d)!.push(nodeId)
      indeg.set(nodeId, (indeg.get(nodeId) ?? 0) + 1)
    }
  }

  const queue = nodeIds.filter((id) => (indeg.get(id) ?? 0) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adj.get(id) ?? []) {
      const n = (indeg.get(next) ?? 1) - 1
      indeg.set(next, n)
      if (n === 0) queue.push(next)
    }
  }

  if (order.length !== nodeIds.length) {
    throw new NetlistError('Combinational loop detected in circuit netlist')
  }
  return order
}

function evaluateGateStrict(
  gate: LogicGate,
  inputBits: Record<string, Bit>,
): Record<string, Bit> {
  const env: Record<string, Bit> = {}
  for (const pin of gate.inputs) {
    env[pin.name] = inputBits[pin.id] ?? 0
  }
  const out: Record<string, Bit> = {}
  for (const o of gate.outputs) {
    const formula = gate.formulas[o.id]
    if (formula == null || formula.trim() === '') {
      throw new NetlistError(`Gate ${gate.name} missing formula for ${o.name}`)
    }
    try {
      out[o.id] = evalFormula(formula, env)
    } catch (err) {
      throw new NetlistError(
        `Gate ${gate.name} output ${o.name}: ${
          err instanceof FormulaError ? err.message : String(err)
        }`,
      )
    }
  }
  return out
}

export function evaluateCircuit(
  circuit: ComboCircuit,
  inputBits: Record<string, Bit>,
  resolveGate: GateResolver,
): CircuitEvalResult {
  const uf = new UnionFind()

  for (const p of circuit.inputs) {
    uf.add(endpointKey({ nodeId: 'io', pinId: p.id }))
  }
  for (const p of circuit.outputs) {
    uf.add(endpointKey({ nodeId: 'io', pinId: p.id }))
  }
  for (const node of circuit.nodes) {
    for (const pinId of [
      ...nodeInputPinIds(node, resolveGate),
      ...nodeOutputPinIds(node, resolveGate),
    ]) {
      uf.add(endpointKey({ nodeId: node.id, pinId }))
    }
  }

  for (const wire of circuit.wires) {
    const a = endpointKey(wire.from)
    const b = endpointKey(wire.to)
    uf.add(a)
    uf.add(b)
    uf.union(a, b)
  }

  const groups = uf.groups()
  const netOf = new Map<string, string>()
  for (const [root, members] of groups) {
    for (const m of members) netOf.set(m, root)
  }

  for (const [, members] of groups) {
    const drivers = members
      .map(parseEndpointKey)
      .filter((ep) => isDriverEndpoint(circuit, ep, resolveGate))
    if (drivers.length > 1) {
      throw new NetlistError(
        `Multiple drivers on the same net (${drivers.map((d) => endpointKey(d)).join(', ')})`,
      )
    }
  }

  for (const node of circuit.nodes) {
    for (const pinId of nodeInputPinIds(node, resolveGate)) {
      const key = endpointKey({ nodeId: node.id, pinId })
      const root = netOf.get(key)
      if (!root) throw new NetlistError(`Floating input ${node.id}/${pinId}`)
      const members = groups.get(root) ?? [key]
      const drivers = members
        .map(parseEndpointKey)
        .filter((ep) => isDriverEndpoint(circuit, ep, resolveGate))
      if (drivers.length === 0) {
        throw new NetlistError(`Floating input ${node.id}/${pinId}`)
      }
    }
  }

  for (const p of circuit.outputs) {
    const key = endpointKey({ nodeId: 'io', pinId: p.id })
    const root = netOf.get(key)
    if (!root) throw new NetlistError(`Floating circuit output ${p.name}`)
    const members = groups.get(root) ?? [key]
    const drivers = members
      .map(parseEndpointKey)
      .filter((ep) => isDriverEndpoint(circuit, ep, resolveGate))
    if (drivers.length === 0) {
      throw new NetlistError(`Floating circuit output ${p.name}`)
    }
  }

  const order = topologicalSort(circuit, netOf, resolveGate)
  const nodeById = new Map(circuit.nodes.map((n) => [n.id, n]))
  const netBits = new Map<string, Bit>()

  const setNetBit = (ep: WireEndpoint, value: Bit) => {
    const root = netOf.get(endpointKey(ep))
    if (root) netBits.set(root, value)
  }

  const getNetBit = (ep: WireEndpoint): Bit => {
    const root = netOf.get(endpointKey(ep))
    if (!root) throw new NetlistError(`No net for ${endpointKey(ep)}`)
    return netBits.get(root) ?? 0
  }

  for (const p of circuit.inputs) {
    setNetBit({ nodeId: 'io', pinId: p.id }, inputBits[p.id] ?? 0)
  }

  const nodeOutBits: Record<string, Record<string, Bit>> = {}

  for (const nodeId of order) {
    const node = nodeById.get(nodeId)!
    if (node.kind === 'gate') {
      const gate = resolveGate(node)
      if (!gate) {
        throw new NetlistError(
          `Unresolved gate reference "${node.ref.builtinKey ?? node.ref.gateId}"`,
        )
      }
      const inBits: Record<string, Bit> = {}
      for (const pin of gate.inputs) {
        inBits[pin.id] = getNetBit({ nodeId, pinId: pin.id })
      }
      const outBits = evaluateGateStrict(gate, inBits)
      nodeOutBits[nodeId] = outBits
      for (const [pinId, v] of Object.entries(outBits)) {
        setNetBit({ nodeId, pinId }, v)
      }
    } else {
      const mod = getModule(node.moduleKey)
      if (!mod) throw new NetlistError(`Unknown module "${node.moduleKey}"`)
      const inBits: Record<string, Bit> = {}
      for (const pin of mod.inputs) {
        inBits[pin.id] = getNetBit({ nodeId, pinId: pin.id })
      }
      let outBits: Record<string, Bit>
      try {
        outBits = evaluateModule(mod, inBits)
      } catch (err) {
        throw new NetlistError(err instanceof Error ? err.message : String(err))
      }
      nodeOutBits[nodeId] = outBits
      for (const [pinId, v] of Object.entries(outBits)) {
        setNetBit({ nodeId, pinId }, v)
      }
    }
  }

  const outputs: Record<string, Bit> = {}
  for (const p of circuit.outputs) {
    outputs[p.id] = getNetBit({ nodeId: 'io', pinId: p.id })
  }

  const endpointBits: Record<string, Bit> = {}
  for (const [key, root] of netOf) {
    endpointBits[key] = netBits.get(root) ?? 0
  }

  return { outputs, endpointBits, nodeOutBits }
}
