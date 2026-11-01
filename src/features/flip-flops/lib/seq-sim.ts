import {
  evalFormula,
  FormulaError,
} from '@/features/logic-gates/lib/bool-engine'
import type { LogicGate } from '@/features/logic-gates/types'
import type { Bit, FfNode, FlipFlopCircuit, WireEndpoint } from '../types'
import {
  getFfModule,
  initialFfState,
  type FfModuleDef,
} from './ff-modules'

export class SeqSimError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeqSimError'
  }
}

export type GateResolver = (
  node: Extract<FfNode, { kind: 'gate' }>,
) => LogicGate | undefined

export type FfSimState = {
  /** nodeId -> state bit map */
  ffState: Record<string, Record<string, Bit>>
  /** nodeId -> previous clock sample */
  prevClk: Record<string, Bit>
}

export type SeqEvalResult = {
  outputs: Record<string, Bit>
  endpointBits: Record<string, Bit>
  nodeOutBits: Record<string, Record<string, Bit>>
  ffState: Record<string, Record<string, Bit>>
  prevClk: Record<string, Bit>
  warnings: string[]
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

function nodeInputPinIds(node: FfNode, resolveGate: GateResolver): string[] {
  if (node.kind === 'ff') {
    const mod = getFfModule(node.moduleKey)
    if (!mod) throw new SeqSimError(`Unknown flip-flop module "${node.moduleKey}"`)
    return mod.inputs.map((p) => p.id)
  }
  const gate = resolveGate(node)
  if (!gate) {
    const ref = node.ref.builtinKey ?? node.ref.gateId ?? '?'
    throw new SeqSimError(`Unresolved gate reference "${ref}" on node ${node.id}`)
  }
  return gate.inputs.map((p) => p.id)
}

function nodeOutputPinIds(node: FfNode, resolveGate: GateResolver): string[] {
  if (node.kind === 'ff') {
    const mod = getFfModule(node.moduleKey)
    if (!mod) throw new SeqSimError(`Unknown flip-flop module "${node.moduleKey}"`)
    return mod.outputs.map((p) => p.id)
  }
  const gate = resolveGate(node)
  if (!gate) {
    const ref = node.ref.builtinKey ?? node.ref.gateId ?? '?'
    throw new SeqSimError(`Unresolved gate reference "${ref}" on node ${node.id}`)
  }
  return gate.outputs.map((p) => p.id)
}

function isNodeOutput(
  nodeId: string,
  pinId: string,
  nodesById: Map<string, FfNode>,
  resolveGate: GateResolver,
): boolean {
  if (nodeId === 'io') return false
  const node = nodesById.get(nodeId)
  if (!node) return false
  return nodeOutputPinIds(node, resolveGate).includes(pinId)
}

/** Synthetic node id for circuit-level behaviorKey simulation. */
export const BEHAVIOR_NODE_ID = '__behavior__'

function resolveBehaviorKey(circuit: FlipFlopCircuit): string | undefined {
  const key = circuit.behaviorKey ?? circuit.builtinKey
  if (!key) return undefined
  return getFfModule(key) ? key : undefined
}

export function createInitialSimState(circuit: FlipFlopCircuit): FfSimState {
  const ffState: Record<string, Record<string, Bit>> = {}
  const prevClk: Record<string, Bit> = {}
  const behaviorKey = resolveBehaviorKey(circuit)
  const hasFfNodes = circuit.nodes.some((n) => n.kind === 'ff')
  if (behaviorKey && !hasFfNodes) {
    const mod = getFfModule(behaviorKey)!
    ffState[BEHAVIOR_NODE_ID] = initialFfState(mod)
    prevClk[BEHAVIOR_NODE_ID] = 0
    return { ffState, prevClk }
  }
  for (const node of circuit.nodes) {
    if (node.kind !== 'ff') continue
    const mod = getFfModule(node.moduleKey)
    if (!mod) continue
    ffState[node.id] = initialFfState(mod)
    prevClk[node.id] = 0
  }
  return { ffState, prevClk }
}

/**
 * Whole-circuit behavioral eval for gate-level textbook seeds (cross-coupled loops).
 * Maps IO by pin name to the FF module.
 */
function evaluateBehaviorCircuit(
  circuit: FlipFlopCircuit,
  moduleKey: string,
  inputBits: Record<string, Bit>,
  sim: FfSimState,
): SeqEvalResult {
  const mod = getFfModule(moduleKey)
  if (!mod) throw new SeqSimError(`Unknown behavior module "${moduleKey}"`)

  const inputsByName: Record<string, Bit> = {}
  for (const p of circuit.inputs) {
    inputsByName[p.name] = inputBits[p.id] ?? 0
  }
  for (const p of mod.inputs) {
    if (inputsByName[p.name] === undefined) {
      inputsByName[p.name] =
        p.name.includes('nPRE') || p.name.includes('nCLR') ? 1 : 0
    }
  }

  const prevState = sim.ffState[BEHAVIOR_NODE_ID] ?? initialFfState(mod)
  const prevClk = sim.prevClk[BEHAVIOR_NODE_ID] ?? 0
  const stepped = mod.step({ prevState, inputs: inputsByName, prevClk })

  const endpointBits: Record<string, Bit> = {}
  for (const p of circuit.inputs) {
    endpointBits[endpointKey({ nodeId: 'io', pinId: p.id })] =
      inputBits[p.id] ?? 0
  }
  const outputs: Record<string, Bit> = {}
  for (const p of circuit.outputs) {
    const bit = stepped.outputs[p.name] ?? 0
    outputs[p.id] = bit
    endpointBits[endpointKey({ nodeId: 'io', pinId: p.id })] = bit
  }

  const clkName = mod.clockPin
  return {
    outputs,
    endpointBits,
    nodeOutBits: {
      [BEHAVIOR_NODE_ID]: Object.fromEntries(
        mod.outputs.map((p) => [p.id, stepped.outputs[p.name] ?? 0]),
      ),
    },
    ffState: { [BEHAVIOR_NODE_ID]: stepped.nextState },
    prevClk: {
      [BEHAVIOR_NODE_ID]: clkName ? (inputsByName[clkName] ?? 0) : 0,
    },
    warnings: stepped.warnings ?? [],
  }
}

/**
 * Evaluate combinational clouds with FF outputs as fixed drivers, then update
 * FF state (level / edge / async) from settled inputs.
 */
export function evaluateSequential(
  circuit: FlipFlopCircuit,
  inputBits: Record<string, Bit>,
  sim: FfSimState,
  resolveGate: GateResolver,
): SeqEvalResult {
  const behaviorKey = resolveBehaviorKey(circuit)
  const hasFfNodes = circuit.nodes.some((n) => n.kind === 'ff')
  if (behaviorKey && !hasFfNodes) {
    return evaluateBehaviorCircuit(circuit, behaviorKey, inputBits, sim)
  }

  const nodesById = new Map(circuit.nodes.map((n) => [n.id, n]))
  const uf = new UnionFind()

  for (const pin of circuit.inputs) {
    uf.add(endpointKey({ nodeId: 'io', pinId: pin.id }))
  }
  for (const pin of circuit.outputs) {
    uf.add(endpointKey({ nodeId: 'io', pinId: pin.id }))
  }
  for (const node of circuit.nodes) {
    for (const pinId of nodeInputPinIds(node, resolveGate)) {
      uf.add(endpointKey({ nodeId: node.id, pinId }))
    }
    for (const pinId of nodeOutputPinIds(node, resolveGate)) {
      uf.add(endpointKey({ nodeId: node.id, pinId }))
    }
  }
  for (const w of circuit.wires) {
    const a = endpointKey(w.from)
    const b = endpointKey(w.to)
    uf.add(a)
    uf.add(b)
    uf.union(a, b)
  }

  const groups = uf.groups()
  const netDriver = new Map<string, string>()
  for (const [root, members] of groups) {
    const drivers = members.filter((key) => {
      const ep = parseEndpointKey(key)
      if (ep.nodeId === 'io') {
        return circuit.inputs.some((p) => p.id === ep.pinId)
      }
      return isNodeOutput(ep.nodeId, ep.pinId, nodesById, resolveGate)
    })
    if (drivers.length > 1) {
      throw new SeqSimError(`Multiple drivers on net: ${drivers.join(', ')}`)
    }
    if (drivers.length === 1) netDriver.set(root, drivers[0]!)
  }

  // Build dependency graph among combo (gate) nodes only; FF outputs are sources.
  const gateNodes = circuit.nodes.filter((n) => n.kind === 'gate')
  const deps = new Map<string, Set<string>>()
  for (const node of gateNodes) {
    deps.set(node.id, new Set())
  }

  for (const node of gateNodes) {
    for (const pinId of nodeInputPinIds(node, resolveGate)) {
      const root = uf.find(endpointKey({ nodeId: node.id, pinId }))
      const driverKey = netDriver.get(root)
      if (!driverKey) continue
      const driver = parseEndpointKey(driverKey)
      if (driver.nodeId === 'io' || driver.nodeId === node.id) continue
      const driverNode = nodesById.get(driver.nodeId)
      if (driverNode?.kind === 'gate') {
        deps.get(node.id)!.add(driver.nodeId)
      }
      // FF drivers are ok (state sources); no combo dep edge.
    }
  }

  // Topo sort gates; cycle => error (combinational loop without FF break).
  const order: string[] = []
  const temp = new Set<string>()
  const perm = new Set<string>()
  const visit = (id: string) => {
    if (perm.has(id)) return
    if (temp.has(id)) throw new SeqSimError('Combinational loop detected')
    temp.add(id)
    for (const d of deps.get(id) ?? []) visit(d)
    temp.delete(id)
    perm.add(id)
    order.push(id)
  }
  for (const id of deps.keys()) visit(id)

  const endpointBits: Record<string, Bit> = {}
  const setNetBit = (key: string, value: Bit) => {
    const root = uf.find(key)
    for (const member of groups.get(root) ?? [key]) {
      endpointBits[member] = value
    }
  }

  for (const pin of circuit.inputs) {
    const v = inputBits[pin.id] ?? 0
    setNetBit(endpointKey({ nodeId: 'io', pinId: pin.id }), v)
  }

  // Seed FF output pins from current state (pre-update).
  const nodeOutBits: Record<string, Record<string, Bit>> = {}
  const warnings: string[] = []
  const nextFfState: Record<string, Record<string, Bit>> = { ...sim.ffState }
  const nextPrevClk: Record<string, Bit> = { ...sim.prevClk }

  const applyFfOutputs = (nodeId: string, mod: FfModuleDef, state: Record<string, Bit>) => {
    // Derive outputs via a no-op step with clock held (async still applies).
    const clkName = mod.clockPin
    const clkVal = clkName
      ? (endpointBits[
          endpointKey({
            nodeId,
            pinId: mod.inputs.find((p) => p.name === clkName)?.id ?? '',
          })
        ] ?? sim.prevClk[nodeId] ?? 0)
      : 0
    // Build input map from current endpoint bits if available; else 0.
    const inputsByName: Record<string, Bit> = {}
    for (const p of mod.inputs) {
      const key = endpointKey({ nodeId, pinId: p.id })
      inputsByName[p.name] = endpointBits[key] ?? 0
    }
    // For seeding before combo eval, use state directly for Q outputs.
    const outs: Record<string, Bit> = {}
    for (const p of mod.outputs) {
      if (state[p.name] !== undefined) {
        outs[p.name] = state[p.name]!
      } else if (p.name.endsWith('n') || p.name.endsWith('N') || p.name === 'Qn') {
        const base = p.name === 'Qn' ? 'Q' : p.name.slice(0, -1)
        const q = state[base]
        if (q !== undefined) outs[p.name] = q === 1 ? 0 : 1
      }
    }
    // Fallback: run step with prevClk === currClk so edge FF hold (async still works).
    if (Object.keys(outs).length < mod.outputs.length) {
      const stepped = mod.step({
        prevState: state,
        inputs: inputsByName,
        prevClk: clkVal,
      })
      Object.assign(outs, stepped.outputs)
    }
    nodeOutBits[nodeId] = outs
    for (const p of mod.outputs) {
      const v = outs[p.name] ?? 0
      setNetBit(endpointKey({ nodeId, pinId: p.id }), v)
    }
  }

  for (const node of circuit.nodes) {
    if (node.kind !== 'ff') continue
    const mod = getFfModule(node.moduleKey)
    if (!mod) throw new SeqSimError(`Unknown flip-flop module "${node.moduleKey}"`)
    const state = sim.ffState[node.id] ?? initialFfState(mod)
    applyFfOutputs(node.id, mod, state)
  }

  // Evaluate gates in order.
  for (const nodeId of order) {
    const node = nodesById.get(nodeId)
    if (!node || node.kind !== 'gate') continue
    const gate = resolveGate(node)
    if (!gate) {
      const ref = node.ref.builtinKey ?? node.ref.gateId ?? '?'
      throw new SeqSimError(`Unresolved gate reference "${ref}" on node ${node.id}`)
    }
    const env: Record<string, Bit> = {}
    for (const p of gate.inputs) {
      const key = endpointKey({ nodeId: node.id, pinId: p.id })
      const root = uf.find(key)
      const driver = netDriver.get(root)
      if (!driver) {
        throw new SeqSimError(`Floating input ${p.name} on gate node ${node.id}`)
      }
      env[p.name] = endpointBits[driver] ?? endpointBits[key] ?? 0
    }
    const outs: Record<string, Bit> = {}
    for (const p of gate.outputs) {
      const formula = gate.formulas[p.id]
      if (!formula) throw new SeqSimError(`Missing formula for ${p.name} on ${node.id}`)
      try {
        outs[p.id] = evalFormula(formula, env)
      } catch (err) {
        const msg = err instanceof FormulaError || err instanceof Error ? err.message : String(err)
        throw new SeqSimError(`Gate ${node.id}: ${msg}`)
      }
      setNetBit(endpointKey({ nodeId: node.id, pinId: p.id }), outs[p.id]!)
    }
    nodeOutBits[nodeId] = Object.fromEntries(
      gate.outputs.map((p) => [p.id, outs[p.id] ?? 0]),
    )
  }

  // Update FF state from settled input pins.
  for (const node of circuit.nodes) {
    if (node.kind !== 'ff') continue
    const mod = getFfModule(node.moduleKey)
    if (!mod) continue
    const inputsByName: Record<string, Bit> = {}
    for (const p of mod.inputs) {
      const key = endpointKey({ nodeId: node.id, pinId: p.id })
      const root = uf.find(key)
      const driver = netDriver.get(root)
      if (!driver && mod.clockMode !== 'none') {
        // Allow undriven async pins default high (inactive) for active-low.
        if (p.name.includes('nPRE') || p.name.includes('nCLR')) {
          inputsByName[p.name] = 1
          continue
        }
        throw new SeqSimError(`Floating input ${p.name} on FF node ${node.id}`)
      }
      inputsByName[p.name] = driver
        ? (endpointBits[driver] ?? 0)
        : (endpointBits[key] ?? 0)
    }
    const prevState = sim.ffState[node.id] ?? initialFfState(mod)
    const prevClk = sim.prevClk[node.id] ?? 0
    const stepped = mod.step({
      prevState,
      inputs: inputsByName,
      prevClk,
    })
    if (stepped.warnings?.length) warnings.push(...stepped.warnings)
    nextFfState[node.id] = stepped.nextState
    const clkName = mod.clockPin
    if (clkName) {
      nextPrevClk[node.id] = inputsByName[clkName] ?? 0
    }
    nodeOutBits[node.id] = Object.fromEntries(
      mod.outputs.map((p) => [p.id, stepped.outputs[p.name] ?? 0]),
    )
    for (const p of mod.outputs) {
      setNetBit(
        endpointKey({ nodeId: node.id, pinId: p.id }),
        stepped.outputs[p.name] ?? 0,
      )
    }
  }

  const outputs: Record<string, Bit> = {}
  for (const pin of circuit.outputs) {
    const key = endpointKey({ nodeId: 'io', pinId: pin.id })
    const root = uf.find(key)
    const driver = netDriver.get(root)
    outputs[pin.id] = driver
      ? (endpointBits[driver] ?? 0)
      : (endpointBits[key] ?? 0)
    setNetBit(key, outputs[pin.id]!)
  }

  return {
    outputs,
    endpointBits,
    nodeOutBits,
    ffState: nextFfState,
    prevClk: nextPrevClk,
    warnings,
  }
}

/** Run a multi-step waveform: each slot is a full input vector. */
export function runWaveform(
  circuit: FlipFlopCircuit,
  slots: Record<string, Bit>[],
  resolveGate: GateResolver,
  initial?: FfSimState,
): {
  samples: SeqEvalResult[]
  warnings: string[]
} {
  let sim = initial ?? createInitialSimState(circuit)
  const samples: SeqEvalResult[] = []
  const warnings: string[] = []
  for (const slot of slots) {
    const result = evaluateSequential(circuit, slot, sim, resolveGate)
    samples.push(result)
    warnings.push(...result.warnings)
    sim = { ffState: result.ffState, prevClk: result.prevClk }
  }
  return { samples, warnings }
}
