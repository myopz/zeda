import type { BuiltinKey, LogicGate } from '@/features/logic-gates/types'
import { getFfModule } from '@/features/flip-flops/lib/ff-modules'
import {
  getSeqModule,
  type SeqModuleKey,
  SEQ_MODULE_KEYS,
} from './seq-modules'
import type {
  CircuitPin,
  CircuitWire,
  SeqGateNode,
  SeqFfNode,
  SeqNode,
  SequentialCircuit,
  WireEndpoint,
} from '../types'

export const GATE_LEVEL_SEQ_KEYS = [...SEQ_MODULE_KEYS] as const

export type GateLevelSeqKey = (typeof GATE_LEVEL_SEQ_KEYS)[number]

function gateByKey(gates: LogicGate[], key: string): LogicGate | undefined {
  return gates.find((g) => g.builtinKey === key)
}

function requireGate(gates: LogicGate[], key: BuiltinKey): LogicGate {
  const g = gateByKey(gates, key)
  if (!g) throw new Error(`Missing builtin gate "${key}"`)
  return g
}

function gatePin(gate: LogicGate, name: string, role: 'in' | 'out'): string {
  const list = role === 'in' ? gate.inputs : gate.outputs
  const pin = list.find((p) => p.name === name)
  if (!pin) throw new Error(`Gate ${gate.name} missing ${role} pin ${name}`)
  return pin.id
}

function ioPins(moduleKey: SeqModuleKey) {
  const mod = getSeqModule(moduleKey)
  if (!mod) throw new Error(`Missing seq module ${moduleKey}`)
  return {
    inputs: mod.inputs.map((p) => ({
      id: `view:${moduleKey}:in:${p.name}`,
      name: p.name,
    })),
    outputs: mod.outputs.map((p) => ({
      id: `view:${moduleKey}:out:${p.name}`,
      name: p.name,
    })),
  }
}

function io(pin: CircuitPin): WireEndpoint {
  return { nodeId: 'io', pinId: pin.id }
}

function findPin(pins: CircuitPin[], name: string): CircuitPin {
  const p = pins.find((x) => x.name === name)
  if (!p) throw new Error(`Missing IO pin ${name}`)
  return p
}

export function hasSeqInternals(moduleKey: string): boolean {
  return (GATE_LEVEL_SEQ_KEYS as readonly string[]).includes(moduleKey)
}

type Builder = {
  nodes: SeqNode[]
  wires: CircuitWire[]
  seq: number
  gates: LogicGate[]
  prefix: string
}

function createBuilder(gates: LogicGate[], prefix: string): Builder {
  return { nodes: [], wires: [], seq: 0, gates, prefix }
}

function addGate(
  b: Builder,
  key: BuiltinKey,
  x: number,
  y: number,
  idSuffix?: string,
): { id: string; gate: LogicGate } {
  const gate = requireGate(b.gates, key)
  const id = `${b.prefix}_${idSuffix ?? key}_${b.seq++}`
  const node: SeqGateNode = {
    id,
    kind: 'gate',
    ref: { builtinKey: key, gateId: gate.id },
    position: { x, y },
  }
  b.nodes.push(node)
  return { id, gate }
}

function connect(b: Builder, from: WireEndpoint, to: WireEndpoint) {
  b.wires.push({
    id: `${b.prefix}_w${b.seq++}`,
    from,
    to,
  })
}

function gIn(nodeId: string, gate: LogicGate, name: string): WireEndpoint {
  return { nodeId, pinId: gatePin(gate, name, 'in') }
}

function gOut(nodeId: string, gate: LogicGate, name: string): WireEndpoint {
  return { nodeId, pinId: gatePin(gate, name, 'out') }
}

const MODULE_W = 180
const MODULE_H = 100
const GATE_W = 160
const GATE_H = 88
const GAP_X = 72
const GAP_Y = 64
const COL = GATE_W + GAP_X
const ROW = GATE_H + GAP_Y

function nodeSize(n: SeqNode): { w: number; h: number } {
  return n.kind === 'gate' ? { w: GATE_W, h: GATE_H } : { w: MODULE_W, h: MODULE_H }
}

function spaceNodes(nodes: SeqNode[]): SeqNode[] {
  const placed = nodes.map((n) => ({
    ...n,
    position: { x: n.position.x, y: n.position.y },
  }))
  const cols = new Map<number, typeof placed>()
  for (const n of placed) {
    const colIdx = Math.round(n.position.x / COL)
    n.position.x = colIdx * COL
    const list = cols.get(colIdx) ?? []
    list.push(n)
    cols.set(colIdx, list)
  }
  for (const list of cols.values()) {
    list.sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id))
    let nextY = Number.NEGATIVE_INFINITY
    for (const n of list) {
      const { h } = nodeSize(n)
      const y = Number.isFinite(nextY)
        ? Math.max(n.position.y, nextY)
        : n.position.y
      n.position.y = y
      nextY = y + h + GAP_Y
    }
  }
  return placed
}

function finish(
  key: SeqModuleKey,
  inputs: CircuitPin[],
  outputs: CircuitPin[],
  b: Builder,
  description: string,
): SequentialCircuit {
  const mod = getSeqModule(key)!
  const now = Date.now()
  const hasStateful = b.nodes.some((n) => n.kind === 'ff' || n.kind === 'seq')
  return {
    id: `view:${key}`,
    name: key,
    description,
    kind: 'custom',
    group: mod.category,
    // Nested FF/seq modules step themselves; no whole-circuit behaviorKey.
    behaviorKey: hasStateful ? undefined : key,
    inputs,
    outputs,
    nodes: spaceNodes(b.nodes),
    wires: b.wires,
    createdAt: now,
    updatedAt: now,
  }
}

function addFf(
  b: Builder,
  moduleKey: string,
  x: number,
  y: number,
  tag: string,
): { id: string; pin: (name: string, role: 'in' | 'out') => WireEndpoint } {
  const mod = getFfModule(moduleKey)
  if (!mod) throw new Error(`Missing FF module ${moduleKey}`)
  const id = `${b.prefix}_${tag}_${moduleKey}_${b.seq++}`
  const node: SeqFfNode = {
    id,
    kind: 'ff',
    moduleKey,
    position: { x, y },
  }
  b.nodes.push(node)
  return {
    id,
    pin(name, role) {
      const list = role === 'in' ? mod.inputs : mod.outputs
      const p = list.find((x) => x.name === name)
      if (!p) throw new Error(`${moduleKey} missing ${role} pin ${name}`)
      return { nodeId: id, pinId: p.id }
    },
  }
}

/**
 * 4-bit parallel register: per bit, D_ff = nLOAD'·Di + nLOAD·Qi
 * (nLOAD active-low load; nLOAD=1 holds).
 */
function buildReg4(gates: LogicGate[]): SequentialCircuit {
  const key = 'reg_4'
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const nLoad = io(findPin(inputs, 'nLOAD'))
  const clk = io(findPin(inputs, 'CLK'))
  const nClr = io(findPin(inputs, 'nCLR'))

  // Shared NOT(nLOAD) for all bit muxes
  const nLoadInv = addGate(b, 'not', 0, -ROW, 'nload_inv')
  connect(b, nLoad, gIn(nLoadInv.id, nLoadInv.gate, 'A'))

  const ffs = [0, 1, 2, 3].map((i) =>
    addFf(b, 'd_edge', 3 * COL, i * ROW, `q${i}`),
  )

  for (let i = 0; i < 4; i += 1) {
    const y = i * ROW
    // loadPath = NOT(nLOAD) AND Di
    const andLoad = addGate(b, 'and', COL, y, `load${i}`)
    connect(b, gOut(nLoadInv.id, nLoadInv.gate, 'Y'), gIn(andLoad.id, andLoad.gate, 'A'))
    connect(b, io(findPin(inputs, `D${i}`)), gIn(andLoad.id, andLoad.gate, 'B'))
    // holdPath = nLOAD AND Qi  (wired after FF exists; use feedback)
    const andHold = addGate(b, 'and', COL, y + ROW * 0.35, `hold${i}`)
    connect(b, nLoad, gIn(andHold.id, andHold.gate, 'A'))
    connect(b, ffs[i]!.pin('Q', 'out'), gIn(andHold.id, andHold.gate, 'B'))
    // D_ff = loadPath OR holdPath
    const orMux = addGate(b, 'or', 2 * COL, y, `mux${i}`)
    connect(b, gOut(andLoad.id, andLoad.gate, 'Y'), gIn(orMux.id, orMux.gate, 'A'))
    connect(b, gOut(andHold.id, andHold.gate, 'Y'), gIn(orMux.id, orMux.gate, 'B'))
    connect(b, gOut(orMux.id, orMux.gate, 'Y'), ffs[i]!.pin('D', 'in'))

    connect(b, clk, ffs[i]!.pin('CLK', 'in'))
    connect(b, nClr, ffs[i]!.pin('nCLR', 'in'))
    // nPRE left undriven → sim defaults inactive (1)
    connect(b, ffs[i]!.pin('Q', 'out'), io(findPin(outputs, `Q${i}`)))
  }
  return finish(
    key,
    inputs,
    outputs,
    b,
    '4× edge D + nLOAD mux (nLOAD′·D + nLOAD·Q); common CLK / nCLR',
  )
}

function buildShift(
  key: 'shift_reg_4_left' | 'shift_reg_4_right',
  gates: LogicGate[],
): SequentialCircuit {
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const ffs = [0, 1, 2, 3].map((i) =>
    addFf(b, 'd_edge', i * COL, ROW, `q${i}`),
  )
  connect(b, io(findPin(inputs, 'CLK')), ffs[0]!.pin('CLK', 'in'))
  for (let i = 1; i < 4; i += 1) {
    connect(b, io(findPin(inputs, 'CLK')), ffs[i]!.pin('CLK', 'in'))
  }
  if (key === 'shift_reg_4_left') {
    connect(b, io(findPin(inputs, 'SI')), ffs[0]!.pin('D', 'in'))
    for (let i = 1; i < 4; i += 1) {
      connect(b, ffs[i - 1]!.pin('Q', 'out'), ffs[i]!.pin('D', 'in'))
    }
  } else {
    connect(b, io(findPin(inputs, 'SI')), ffs[3]!.pin('D', 'in'))
    for (let i = 0; i < 3; i += 1) {
      connect(b, ffs[i + 1]!.pin('Q', 'out'), ffs[i]!.pin('D', 'in'))
    }
  }
  for (let i = 0; i < 4; i += 1) {
    connect(b, ffs[i]!.pin('Q', 'out'), io(findPin(outputs, `Q${i}`)))
  }
  return finish(key, inputs, outputs, b, '4× edge D shift chain')
}

function buildSyncBin(gates: LogicGate[]): SequentialCircuit {
  const key = 'counter_bin_sync_4'
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const ffs = [0, 1, 2, 3].map((i) =>
    addFf(b, 't_edge', i * COL, ROW, `q${i}`),
  )
  // T0 = EN; T1 = Q0∧EN; T2 = Q0∧Q1∧EN; T3 = Q0∧Q1∧Q2∧EN
  connect(b, io(findPin(inputs, 'EN')), ffs[0]!.pin('T', 'in'))
  connect(b, io(findPin(inputs, 'CLK')), ffs[0]!.pin('CLK', 'in'))

  const and1 = addGate(b, 'and', COL * 0.5, 0, 't1')
  connect(b, io(findPin(inputs, 'EN')), gIn(and1.id, and1.gate, 'A'))
  connect(b, ffs[0]!.pin('Q', 'out'), gIn(and1.id, and1.gate, 'B'))
  connect(b, gOut(and1.id, and1.gate, 'Y'), ffs[1]!.pin('T', 'in'))
  connect(b, io(findPin(inputs, 'CLK')), ffs[1]!.pin('CLK', 'in'))

  const and2a = addGate(b, 'and', COL * 1.5, 0, 't2a')
  connect(b, ffs[0]!.pin('Q', 'out'), gIn(and2a.id, and2a.gate, 'A'))
  connect(b, ffs[1]!.pin('Q', 'out'), gIn(and2a.id, and2a.gate, 'B'))
  const and2b = addGate(b, 'and', COL * 1.5, -ROW, 't2b')
  connect(b, gOut(and2a.id, and2a.gate, 'Y'), gIn(and2b.id, and2b.gate, 'A'))
  connect(b, io(findPin(inputs, 'EN')), gIn(and2b.id, and2b.gate, 'B'))
  connect(b, gOut(and2b.id, and2b.gate, 'Y'), ffs[2]!.pin('T', 'in'))
  connect(b, io(findPin(inputs, 'CLK')), ffs[2]!.pin('CLK', 'in'))

  const and3a = addGate(b, 'and', COL * 2.5, 0, 't3a')
  connect(b, ffs[1]!.pin('Q', 'out'), gIn(and3a.id, and3a.gate, 'A'))
  connect(b, ffs[2]!.pin('Q', 'out'), gIn(and3a.id, and3a.gate, 'B'))
  const and3b = addGate(b, 'and', COL * 2.5, -ROW, 't3b')
  connect(b, ffs[0]!.pin('Q', 'out'), gIn(and3b.id, and3b.gate, 'A'))
  connect(b, io(findPin(inputs, 'EN')), gIn(and3b.id, and3b.gate, 'B'))
  const and3c = addGate(b, 'and', COL * 2.5, -2 * ROW, 't3c')
  connect(b, gOut(and3a.id, and3a.gate, 'Y'), gIn(and3c.id, and3c.gate, 'A'))
  connect(b, gOut(and3b.id, and3b.gate, 'Y'), gIn(and3c.id, and3c.gate, 'B'))
  connect(b, gOut(and3c.id, and3c.gate, 'Y'), ffs[3]!.pin('T', 'in'))
  connect(b, io(findPin(inputs, 'CLK')), ffs[3]!.pin('CLK', 'in'))

  for (let i = 0; i < 4; i += 1) {
    connect(b, ffs[i]!.pin('Q', 'out'), io(findPin(outputs, `Q${i}`)))
  }
  return finish(key, inputs, outputs, b, 'Sync binary: 4× T with AND enable tree')
}

function buildAsyncBin(gates: LogicGate[]): SequentialCircuit {
  const key = 'counter_bin_async_4'
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const ffs = [0, 1, 2, 3].map((i) =>
    addFf(b, 't_edge', i * COL, ROW, `q${i}`),
  )
  // T tied high via OR of CLK with itself? Use NOT+NOT buffer from a constant —
  // Drive T from OR(CLK, NOT CLK) = 1
  for (let i = 0; i < 4; i += 1) {
    const n1 = addGate(b, 'not', i * COL, 0, `tinv${i}`)
    const n2 = addGate(b, 'not', i * COL, -ROW * 0.5, `tbuf${i}`)
    connect(b, io(findPin(inputs, 'CLK')), gIn(n1.id, n1.gate, 'A'))
    connect(b, gOut(n1.id, n1.gate, 'Y'), gIn(n2.id, n2.gate, 'A'))
    // T=1: OR(CLK, NOT CLK)
    const or1 = addGate(b, 'or', i * COL, -ROW, `tor${i}`)
    connect(b, io(findPin(inputs, 'CLK')), gIn(or1.id, or1.gate, 'A'))
    connect(b, gOut(n1.id, n1.gate, 'Y'), gIn(or1.id, or1.gate, 'B'))
    connect(b, gOut(or1.id, or1.gate, 'Y'), ffs[i]!.pin('T', 'in'))
    void n2
  }
  connect(b, io(findPin(inputs, 'CLK')), ffs[0]!.pin('CLK', 'in'))
  for (let i = 1; i < 4; i += 1) {
    connect(b, ffs[i - 1]!.pin('Q', 'out'), ffs[i]!.pin('CLK', 'in'))
  }
  for (let i = 0; i < 4; i += 1) {
    connect(b, ffs[i]!.pin('Q', 'out'), io(findPin(outputs, `Q${i}`)))
  }
  return finish(key, inputs, outputs, b, 'Async ripple: Q→next CLK, T=1')
}

function buildSimpleCounterChain(
  key: SeqModuleKey,
  gates: LogicGate[],
  description: string,
): SequentialCircuit {
  // Structural stand-in: sync T chain (behavior module owns exact mod/updown/TTL semantics).
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const ffs = [0, 1, 2, 3].map((i) =>
    addFf(b, 't_edge', i * COL, ROW, `q${i}`),
  )
  const clkPin = inputs.find((p) => p.name === 'CLK') ?? inputs[0]!
  for (let i = 0; i < 4; i += 1) {
    const or1 = addGate(b, 'or', i * COL, 0, `t1_${i}`)
    const not1 = addGate(b, 'not', i * COL, -ROW, `tn_${i}`)
    connect(b, io(clkPin), gIn(not1.id, not1.gate, 'A'))
    connect(b, io(clkPin), gIn(or1.id, or1.gate, 'A'))
    connect(b, gOut(not1.id, not1.gate, 'Y'), gIn(or1.id, or1.gate, 'B'))
    connect(b, gOut(or1.id, or1.gate, 'Y'), ffs[i]!.pin('T', 'in'))
    connect(b, io(clkPin), ffs[i]!.pin('CLK', 'in'))
    const qOut = outputs.find((p) => p.name === `Q${i}` || p.name === `Q${['A','B','C','D'][i]}`)
    if (qOut) connect(b, ffs[i]!.pin('Q', 'out'), io(qOut))
  }
  return finish(key, inputs, outputs, b, description)
}

function buildShift194(gates: LogicGate[]): SequentialCircuit {
  const key = '74ls194'
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const ffs = [0, 1, 2, 3].map((i) =>
    addFf(b, 'd_edge', i * COL, ROW, `q${i}`),
  )
  for (let i = 0; i < 4; i += 1) {
    connect(b, io(findPin(inputs, 'CLK')), ffs[i]!.pin('CLK', 'in'))
    connect(b, io(findPin(inputs, 'nCLR')), ffs[i]!.pin('nCLR', 'in'))
    connect(b, ffs[i]!.pin('Q', 'out'), io(findPin(outputs, `Q${['A','B','C','D'][i]}`)))
  }
  // D inputs left for mode mux in behavior; show parallel load wires as teaching cue
  connect(b, io(findPin(inputs, 'A')), ffs[0]!.pin('D', 'in'))
  connect(b, io(findPin(inputs, 'B')), ffs[1]!.pin('D', 'in'))
  connect(b, io(findPin(inputs, 'C')), ffs[2]!.pin('D', 'in'))
  connect(b, io(findPin(inputs, 'D')), ffs[3]!.pin('D', 'in'))
  return finish(key, inputs, outputs, b, '4× D (mode mux in behavior model)')
}

export function buildSeqInternals(
  moduleKey: string,
  gates: LogicGate[],
): SequentialCircuit | null {
  if (!hasSeqInternals(moduleKey)) return null
  const key = moduleKey as SeqModuleKey
  switch (key) {
    case 'reg_4':
      return buildReg4(gates)
    case 'shift_reg_4_left':
    case 'shift_reg_4_right':
      return buildShift(key, gates)
    case 'counter_bin_sync_4':
      return buildSyncBin(gates)
    case 'counter_bin_async_4':
      return buildAsyncBin(gates)
    case 'counter_bin_sync_updown_4':
      return buildSimpleCounterChain(key, gates, 'Up/down: structural T chain (behavior authoritative)')
    case 'counter_dec_sync':
    case 'counter_dec_async':
    case 'counter_mod6_sync':
      return buildSimpleCounterChain(key, gates, 'Modulo counter structural T chain')
    case '74ls161':
    case '74ls90':
      return buildSimpleCounterChain(key, gates, 'TTL counter structural stand-in')
    case '74ls194':
      return buildShift194(gates)
    default:
      return null
  }
}
