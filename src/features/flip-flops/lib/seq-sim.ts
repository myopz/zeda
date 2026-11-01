import {
  evalFormula,
  FormulaError,
} from '@/features/logic-gates/lib/bool-engine'
import type { ComboCircuit } from '@/features/combo-circuits/types'
import type { LogicGate } from '@/features/logic-gates/types'
import type { Bit, FfNode, FlipFlopCircuit, WireEndpoint } from '../types'
import {
  comboCircuitIo,
  comboModuleIo,
  evalComboCircuitNode,
  evalComboModuleNode,
} from './combo-bridge'
import {
  getFfModule,
  type FfStepArgs,
  type FfStepResult,
} from './ff-modules'

export class SeqSimError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeqSimError'
  }
}

/** Shared step interface for FF / Seq catalog modules. */
export type StatefulModule = {
  key: string
  inputs: { id: string; name: string }[]
  outputs: { id: string; name: string }[]
  stateNames: string[]
  clockMode: 'none' | 'level' | 'posedge' | 'negedge'
  clockPin?: string
  equations?: string[]
  step: (args: FfStepArgs) => FfStepResult
}

export type ModuleResolver = (key: string) => StatefulModule | undefined

export type GateNodeRef = { builtinKey?: string; gateId?: string }

export type SimGateNode = {
  id: string
  kind: 'gate'
  ref: GateNodeRef
}

export type SimModuleNode = {
  id: string
  kind: 'ff' | 'seq'
  moduleKey: string
}

export type SimComboNode = {
  id: string
  kind: 'combo'
  circuitId: string
}

export type SimComboModuleNode = {
  id: string
  kind: 'comboModule'
  moduleKey: string
}

export type SimNode =
  | SimGateNode
  | SimModuleNode
  | SimComboNode
  | SimComboModuleNode

export type SimCircuit = {
  inputs: { id: string; name: string }[]
  outputs: { id: string; name: string }[]
  nodes: SimNode[]
  wires: { id: string; from: WireEndpoint; to: WireEndpoint }[]
  behaviorKey?: string
  builtinKey?: string
}

export type GateResolver = (
  node: SimGateNode,
) => LogicGate | undefined

/** Resolve a ComboCircuit by id (for `kind:'combo'` nodes). */
export type ComboResolver = (circuitId: string) => ComboCircuit | undefined

function isComboCloud(node: SimNode): boolean {
  return (
    node.kind === 'gate' || node.kind === 'combo' || node.kind === 'comboModule'
  )
}

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

/** Max delta iterations for ripple / cascaded clock settling within one eval. */
export const MAX_DELTA_ITERS = 8

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

function isStateful(node: SimNode): node is SimModuleNode {
  return node.kind === 'ff' || node.kind === 'seq'
}

function initialModuleState(mod: StatefulModule): Record<string, Bit> {
  const state: Record<string, Bit> = {}
  for (const name of mod.stateNames) state[name] = 0
  return state
}

function nodeInputPinIds(
  node: SimNode,
  resolveGate: GateResolver,
  resolveModule: ModuleResolver,
  resolveCombo: ComboResolver,
): string[] {
  if (isStateful(node)) {
    const mod = resolveModule(node.moduleKey)
    if (!mod) throw new SeqSimError(`Unknown module "${node.moduleKey}"`)
    return mod.inputs.map((p) => p.id)
  }
  if (node.kind === 'combo') {
    const c = resolveCombo(node.circuitId)
    if (!c) throw new SeqSimError(`Unknown combo circuit "${node.circuitId}"`)
    return comboCircuitIo(c).inputs.map((p) => p.id)
  }
  if (node.kind === 'comboModule') {
    const io = comboModuleIo(node.moduleKey)
    if (!io) throw new SeqSimError(`Unknown combo module "${node.moduleKey}"`)
    return io.inputs.map((p) => p.id)
  }
  const gate = resolveGate(node)
  if (!gate) {
    const ref = node.ref.builtinKey ?? node.ref.gateId ?? '?'
    throw new SeqSimError(`Unresolved gate reference "${ref}" on node ${node.id}`)
  }
  return gate.inputs.map((p) => p.id)
}

function nodeOutputPinIds(
  node: SimNode,
  resolveGate: GateResolver,
  resolveModule: ModuleResolver,
  resolveCombo: ComboResolver,
): string[] {
  if (isStateful(node)) {
    const mod = resolveModule(node.moduleKey)
    if (!mod) throw new SeqSimError(`Unknown module "${node.moduleKey}"`)
    return mod.outputs.map((p) => p.id)
  }
  if (node.kind === 'combo') {
    const c = resolveCombo(node.circuitId)
    if (!c) throw new SeqSimError(`Unknown combo circuit "${node.circuitId}"`)
    return comboCircuitIo(c).outputs.map((p) => p.id)
  }
  if (node.kind === 'comboModule') {
    const io = comboModuleIo(node.moduleKey)
    if (!io) throw new SeqSimError(`Unknown combo module "${node.moduleKey}"`)
    return io.outputs.map((p) => p.id)
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
  nodesById: Map<string, SimNode>,
  resolveGate: GateResolver,
  resolveModule: ModuleResolver,
  resolveCombo: ComboResolver,
): boolean {
  if (nodeId === 'io') return false
  const node = nodesById.get(nodeId)
  if (!node) return false
  return nodeOutputPinIds(
    node,
    resolveGate,
    resolveModule,
    resolveCombo,
  ).includes(pinId)
}

/** Synthetic node id for circuit-level behaviorKey simulation. */
export const BEHAVIOR_NODE_ID = '__behavior__'

function resolveBehaviorKey(
  circuit: SimCircuit,
  resolveModule: ModuleResolver,
): string | undefined {
  const key = circuit.behaviorKey ?? circuit.builtinKey
  if (!key) return undefined
  return resolveModule(key) ? key : undefined
}

function hasStatefulNodes(circuit: SimCircuit): boolean {
  return circuit.nodes.some((n) => isStateful(n))
}

export function createSimState(
  circuit: SimCircuit,
  resolveModule: ModuleResolver = (k) => getFfModule(k),
): FfSimState {
  const ffState: Record<string, Record<string, Bit>> = {}
  const prevClk: Record<string, Bit> = {}
  const behaviorKey = resolveBehaviorKey(circuit, resolveModule)
  if (behaviorKey && !hasStatefulNodes(circuit)) {
    const mod = resolveModule(behaviorKey)!
    ffState[BEHAVIOR_NODE_ID] = initialModuleState(mod)
    prevClk[BEHAVIOR_NODE_ID] = 0
    return { ffState, prevClk }
  }
  for (const node of circuit.nodes) {
    if (!isStateful(node)) continue
    const mod = resolveModule(node.moduleKey)
    if (!mod) continue
    ffState[node.id] = initialModuleState(mod)
    prevClk[node.id] = 0
  }
  return { ffState, prevClk }
}

/** Flip-flop call-site compatible initializer. */
export function createInitialSimState(circuit: FlipFlopCircuit): FfSimState {
  return createSimState(circuit as SimCircuit, (k) => getFfModule(k))
}

function evaluateBehaviorCircuit(
  circuit: SimCircuit,
  moduleKey: string,
  inputBits: Record<string, Bit>,
  sim: FfSimState,
  resolveModule: ModuleResolver,
): SeqEvalResult {
  const mod = resolveModule(moduleKey)
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

  const prevState = sim.ffState[BEHAVIOR_NODE_ID] ?? initialModuleState(mod)
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

function statesEqual(
  a: Record<string, Record<string, Bit>>,
  b: Record<string, Record<string, Bit>>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const sa = a[k] ?? {}
    const sb = b[k] ?? {}
    const sk = new Set([...Object.keys(sa), ...Object.keys(sb)])
    for (const s of sk) {
      if ((sa[s] ?? 0) !== (sb[s] ?? 0)) return false
    }
  }
  return true
}

/**
 * Evaluate combinational clouds with stateful-module outputs as fixed drivers,
 * then update module state (level / edge / async). Cascaded clocks settle via
 * limited delta iterations.
 */
export function evaluateSimCircuit(
  circuit: SimCircuit,
  inputBits: Record<string, Bit>,
  sim: FfSimState,
  resolveGate: GateResolver,
  resolveModule: ModuleResolver = (k) => getFfModule(k),
  resolveCombo: ComboResolver = () => undefined,
): SeqEvalResult {
  const behaviorKey = resolveBehaviorKey(circuit, resolveModule)
  if (behaviorKey && !hasStatefulNodes(circuit)) {
    return evaluateBehaviorCircuit(
      circuit,
      behaviorKey,
      inputBits,
      sim,
      resolveModule,
    )
  }

  const nodesById = new Map(circuit.nodes.map((n) => [n.id, n]))
  const uf = new UnionFind()
  const pinArgs = [resolveGate, resolveModule, resolveCombo] as const

  for (const pin of circuit.inputs) {
    uf.add(endpointKey({ nodeId: 'io', pinId: pin.id }))
  }
  for (const pin of circuit.outputs) {
    uf.add(endpointKey({ nodeId: 'io', pinId: pin.id }))
  }
  for (const node of circuit.nodes) {
    for (const pinId of nodeInputPinIds(node, ...pinArgs)) {
      uf.add(endpointKey({ nodeId: node.id, pinId }))
    }
    for (const pinId of nodeOutputPinIds(node, ...pinArgs)) {
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
      return isNodeOutput(
        ep.nodeId,
        ep.pinId,
        nodesById,
        ...pinArgs,
      )
    })
    if (drivers.length > 1) {
      throw new SeqSimError(`Multiple drivers on net: ${drivers.join(', ')}`)
    }
    if (drivers.length === 1) netDriver.set(root, drivers[0]!)
  }

  // Combinational cloud: gates + combo circuits/modules
  const cloudNodes = circuit.nodes.filter((n) => isComboCloud(n))
  const deps = new Map<string, Set<string>>()
  for (const node of cloudNodes) {
    deps.set(node.id, new Set())
  }

  for (const node of cloudNodes) {
    for (const pinId of nodeInputPinIds(node, ...pinArgs)) {
      const root = uf.find(endpointKey({ nodeId: node.id, pinId }))
      const driverKey = netDriver.get(root)
      if (!driverKey) continue
      const driver = parseEndpointKey(driverKey)
      if (driver.nodeId === 'io' || driver.nodeId === node.id) continue
      const driverNode = nodesById.get(driver.nodeId)
      if (driverNode && isComboCloud(driverNode)) {
        deps.get(node.id)!.add(driver.nodeId)
      }
    }
  }

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

  const nodeOutBits: Record<string, Record<string, Bit>> = {}
  const warnings: string[] = []
  let workingState: Record<string, Record<string, Bit>> = { ...sim.ffState }
  let workingPrevClk: Record<string, Bit> = { ...sim.prevClk }
  // Edge detect uses the clock sample from the start of this evaluate() call.
  const edgePrevClk: Record<string, Bit> = { ...sim.prevClk }

  const applyModuleOutputs = (
    nodeId: string,
    mod: StatefulModule,
    state: Record<string, Bit>,
  ) => {
    const clkName = mod.clockPin
    const clkVal = clkName
      ? (endpointBits[
          endpointKey({
            nodeId,
            pinId: mod.inputs.find((p) => p.name === clkName)?.id ?? '',
          })
        ] ?? workingPrevClk[nodeId] ?? 0)
      : 0
    const inputsByName: Record<string, Bit> = {}
    for (const p of mod.inputs) {
      const key = endpointKey({ nodeId, pinId: p.id })
      inputsByName[p.name] = endpointBits[key] ?? 0
    }
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

  const readDrivenBit = (nodeId: string, pinId: string, label: string): Bit => {
    const key = endpointKey({ nodeId, pinId })
    const root = uf.find(key)
    const driver = netDriver.get(root)
    if (!driver) {
      throw new SeqSimError(`Floating input ${label} on node ${nodeId}`)
    }
    return endpointBits[driver] ?? endpointBits[key] ?? 0
  }

  const evalComboCloud = () => {
    const gateMap = new Map<string, LogicGate>()
    // Best-effort: combo nested eval resolves gates via builtinKey scan from
    // already-known resolveGate samples — callers should pass a resolver that
    // closes over the full gate library.
    const comboGateResolver = (node: {
      ref: { builtinKey?: string; gateId?: string }
    }) => resolveGate(node as SimGateNode)

    for (const nodeId of order) {
      const node = nodesById.get(nodeId)
      if (!node || !isComboCloud(node)) continue

      if (node.kind === 'gate') {
        const gate = resolveGate(node)
        if (!gate) {
          const ref = node.ref.builtinKey ?? node.ref.gateId ?? '?'
          throw new SeqSimError(`Unresolved gate reference "${ref}" on node ${node.id}`)
        }
        gateMap.set(gate.id, gate)
        const env: Record<string, Bit> = {}
        for (const p of gate.inputs) {
          env[p.name] = readDrivenBit(node.id, p.id, p.name)
        }
        const outs: Record<string, Bit> = {}
        for (const p of gate.outputs) {
          const formula = gate.formulas[p.id]
          if (!formula) {
            throw new SeqSimError(`Missing formula for ${p.name} on ${node.id}`)
          }
          try {
            outs[p.id] = evalFormula(formula, env)
          } catch (err) {
            const msg =
              err instanceof FormulaError || err instanceof Error
                ? err.message
                : String(err)
            throw new SeqSimError(`Gate ${node.id}: ${msg}`)
          }
          setNetBit(endpointKey({ nodeId: node.id, pinId: p.id }), outs[p.id]!)
        }
        nodeOutBits[nodeId] = Object.fromEntries(
          gate.outputs.map((p) => [p.id, outs[p.id] ?? 0]),
        )
        continue
      }

      if (node.kind === 'comboModule') {
        const io = comboModuleIo(node.moduleKey)
        if (!io) {
          throw new SeqSimError(`Unknown combo module "${node.moduleKey}"`)
        }
        const inputBits: Record<string, Bit> = {}
        for (const p of io.inputs) {
          inputBits[p.id] = readDrivenBit(node.id, p.id, p.name)
        }
        const evaluated = evalComboModuleNode(node.moduleKey, inputBits)
        nodeOutBits[nodeId] = evaluated.nodeOutBits
        for (const p of io.outputs) {
          setNetBit(
            endpointKey({ nodeId: node.id, pinId: p.id }),
            evaluated.outputs[p.id] ?? 0,
          )
        }
        continue
      }

      if (node.kind === 'combo') {
        const child = resolveCombo(node.circuitId)
        if (!child) {
          throw new SeqSimError(`Unknown combo circuit "${node.circuitId}"`)
        }
        const inputBits: Record<string, Bit> = {}
        for (const p of child.inputs) {
          inputBits[p.id] = readDrivenBit(node.id, p.id, p.name)
        }
        const evaluated = evalComboCircuitNode(
          child,
          inputBits,
          comboGateResolver,
          resolveCombo,
        )
        nodeOutBits[nodeId] = evaluated.nodeOutBits
        for (const p of child.outputs) {
          setNetBit(
            endpointKey({ nodeId: node.id, pinId: p.id }),
            evaluated.outputs[p.id] ?? 0,
          )
        }
      }
    }
  }

  const stepModules = (useEdgePrev: boolean) => {
    const nextState: Record<string, Record<string, Bit>> = { ...workingState }
    const nextPrevClk: Record<string, Bit> = { ...workingPrevClk }
    // Collect output writes and apply after all modules sample — otherwise a
    // sync edge would let later FFs see earlier siblings' *new* Q (shift/chain
    // would collapse instead of transferring present state).
    const pendingOutWrites: { key: string; value: Bit }[] = []
    for (const node of circuit.nodes) {
      if (!isStateful(node)) continue
      const mod = resolveModule(node.moduleKey)
      if (!mod) continue
      const inputsByName: Record<string, Bit> = {}
      for (const p of mod.inputs) {
        const key = endpointKey({ nodeId: node.id, pinId: p.id })
        const root = uf.find(key)
        const driver = netDriver.get(root)
        if (!driver && mod.clockMode !== 'none') {
          if (p.name.includes('nPRE') || p.name.includes('nCLR') || p.name.includes('nLOAD')) {
            inputsByName[p.name] = 1
            continue
          }
          throw new SeqSimError(`Floating input ${p.name} on module node ${node.id}`)
        }
        inputsByName[p.name] = driver
          ? (endpointBits[driver] ?? 0)
          : (endpointBits[key] ?? 0)
      }
      const prevState = workingState[node.id] ?? initialModuleState(mod)
      const prevClk = useEdgePrev
        ? (edgePrevClk[node.id] ?? 0)
        : (workingPrevClk[node.id] ?? 0)
      const stepped = mod.step({
        prevState,
        inputs: inputsByName,
        prevClk,
      })
      if (stepped.warnings?.length) warnings.push(...stepped.warnings)
      nextState[node.id] = stepped.nextState
      const clkName = mod.clockPin
      if (clkName) {
        nextPrevClk[node.id] = inputsByName[clkName] ?? 0
      }
      nodeOutBits[node.id] = Object.fromEntries(
        mod.outputs.map((p) => [p.id, stepped.outputs[p.name] ?? 0]),
      )
      for (const p of mod.outputs) {
        pendingOutWrites.push({
          key: endpointKey({ nodeId: node.id, pinId: p.id }),
          value: stepped.outputs[p.name] ?? 0,
        })
      }
    }
    for (const w of pendingOutWrites) setNetBit(w.key, w.value)
    workingState = nextState
    workingPrevClk = nextPrevClk
  }

  // Seed module outputs from prior state, then settle combo + stateful deltas.
  for (const node of circuit.nodes) {
    if (!isStateful(node)) continue
    const mod = resolveModule(node.moduleKey)
    if (!mod) throw new SeqSimError(`Unknown module "${node.moduleKey}"`)
    const state = workingState[node.id] ?? initialModuleState(mod)
    applyModuleOutputs(node.id, mod, state)
  }
  evalComboCloud()

  let delta = 0
  let prevSnapshot = structuredClone(workingState)
  while (delta < MAX_DELTA_ITERS) {
    stepModules(delta === 0)
    evalComboCloud()
    delta += 1
    if (statesEqual(prevSnapshot, workingState)) break
    prevSnapshot = structuredClone(workingState)
    // After first edge-sensitive step, further deltas hold edges (async/ripple only).
    for (const node of circuit.nodes) {
      if (!isStateful(node)) continue
      edgePrevClk[node.id] = workingPrevClk[node.id] ?? 0
    }
  }
  if (delta >= MAX_DELTA_ITERS && !statesEqual(prevSnapshot, workingState)) {
    warnings.push('Ripple delta iteration limit reached')
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
    ffState: workingState,
    prevClk: workingPrevClk,
    warnings,
  }
}

export function toSimCircuitFromFf(circuit: FlipFlopCircuit): SimCircuit {
  return {
    inputs: circuit.inputs,
    outputs: circuit.outputs,
    wires: circuit.wires,
    behaviorKey: circuit.behaviorKey,
    builtinKey: circuit.builtinKey,
    nodes: circuit.nodes.flatMap((n): SimNode[] => {
      if (n.kind === 'gate') return [{ id: n.id, kind: 'gate', ref: n.ref }]
      if (n.kind === 'ff') {
        return [{ id: n.id, kind: 'ff', moduleKey: n.moduleKey }]
      }
      if (n.kind === 'combo') {
        return [{ id: n.id, kind: 'combo', circuitId: n.circuitId }]
      }
      if (n.kind === 'comboModule') {
        return [{ id: n.id, kind: 'comboModule', moduleKey: n.moduleKey }]
      }
      return []
    }),
  }
}

/** Flip-flop feature wrapper — resolves FF catalog modules. */
export function evaluateSequential(
  circuit: FlipFlopCircuit,
  inputBits: Record<string, Bit>,
  sim: FfSimState,
  resolveGate: (node: Extract<FfNode, { kind: 'gate' }>) => LogicGate | undefined,
  resolveCombo: ComboResolver = () => undefined,
): SeqEvalResult {
  return evaluateSimCircuit(
    toSimCircuitFromFf(circuit),
    inputBits,
    sim,
    resolveGate as GateResolver,
    (k) => getFfModule(k),
    resolveCombo,
  )
}

/** Run a multi-step waveform: each slot is a full input vector. */
export function runWaveform(
  circuit: FlipFlopCircuit,
  slots: Record<string, Bit>[],
  resolveGate: (node: Extract<FfNode, { kind: 'gate' }>) => LogicGate | undefined,
  initial?: FfSimState,
  resolveCombo: ComboResolver = () => undefined,
): {
  samples: SeqEvalResult[]
  warnings: string[]
} {
  let sim = initial ?? createInitialSimState(circuit)
  const samples: SeqEvalResult[] = []
  const warnings: string[] = []
  for (const slot of slots) {
    const result = evaluateSequential(
      circuit,
      slot,
      sim,
      resolveGate,
      resolveCombo,
    )
    samples.push(result)
    warnings.push(...result.warnings)
    sim = { ffState: result.ffState, prevClk: result.prevClk }
  }
  return { samples, warnings }
}

export function runSimWaveform(
  circuit: SimCircuit,
  slots: Record<string, Bit>[],
  resolveGate: GateResolver,
  resolveModule: ModuleResolver,
  resolveCombo: ComboResolver = () => undefined,
  initial?: FfSimState,
): {
  samples: SeqEvalResult[]
  warnings: string[]
} {
  let sim = initial ?? createSimState(circuit, resolveModule)
  const samples: SeqEvalResult[] = []
  const warnings: string[] = []
  for (const slot of slots) {
    const result = evaluateSimCircuit(
      circuit,
      slot,
      sim,
      resolveGate,
      resolveModule,
      resolveCombo,
    )
    samples.push(result)
    warnings.push(...result.warnings)
    sim = { ffState: result.ffState, prevClk: result.prevClk }
  }
  return { samples, warnings }
}
