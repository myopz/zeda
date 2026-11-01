import type { BuiltinKey, LogicGate } from '@/features/logic-gates/types'
import type {
  CircuitPin,
  CircuitWire,
  FfGateNode,
  FfModuleNode,
  FfNode,
  FlipFlopCircuit,
  WireEndpoint,
} from '../types'
import { getFfModule, type FfModuleKey } from './ff-modules'

/** Catalog FFs that expose hierarchical internals (textbook + 74LS composites). */
export const GATE_LEVEL_FF_KEYS = [
  'rs_basic_nor',
  'rs_gated',
  'jk_gated',
  'jk_edge',
  'd_edge',
  't_edge',
  't_bar_edge',
  '74ls74',
  '74ls112',
  '74ls175',
] as const satisfies readonly FfModuleKey[]

export type GateLevelFfKey = (typeof GATE_LEVEL_FF_KEYS)[number]

/** Shared leaf latch reused by other textbook FF topologies. */
export const BASIC_RS_KEY = 'rs_basic_nor' as const

/** Synchronous (gated) RS reused by gated D / edge D / T stages. */
export const GATED_RS_KEY = 'rs_gated' as const

/** Level-sensitive JK reused by master–slave edge JK. */
export const GATED_JK_KEY = 'jk_gated' as const

/** Edge D reused by T / T′ / 74LS74 / 74LS175. */
export const EDGE_D_KEY = 'd_edge' as const

/** Edge JK reused by 74LS112 (via inverted CLK for falling-edge). */
export const EDGE_JK_KEY = 'jk_edge' as const

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

function ioPins(moduleKey: FfModuleKey) {
  const mod = getFfModule(moduleKey)
  if (!mod) throw new Error(`Missing FF module ${moduleKey}`)
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

export function hasFfInternals(moduleKey: string): boolean {
  return (GATE_LEVEL_FF_KEYS as readonly string[]).includes(moduleKey)
}

type Builder = {
  nodes: FfNode[]
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
  const node: FfGateNode = {
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

/** Device card footprint (matches DeviceNode / FF module cards). */
const GATE_W = 160
const GATE_H = 88
const MODULE_W = 180
const MODULE_H = 100
const GAP_X = 72
const GAP_Y = 64
const COL = GATE_W + GAP_X
const ROW = GATE_H + GAP_Y

function nodeSize(n: FfNode): { w: number; h: number } {
  return n.kind === 'ff' ? { w: MODULE_W, h: MODULE_H } : { w: GATE_W, h: GATE_H }
}

/**
 * Snap nodes onto a column grid, then pack each column top→bottom so
 * cards never overlap.
 */
function spaceNodes(nodes: FfNode[]): FfNode[] {
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
    list.sort(
      (a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id),
    )
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
  key: FfModuleKey,
  inputs: CircuitPin[],
  outputs: CircuitPin[],
  b: Builder,
  description: string,
): FlipFlopCircuit {
  const mod = getFfModule(key)!
  const now = Date.now()
  return {
    id: `view:${key}`,
    name: key,
    description,
    kind: 'custom',
    group: mod.category,
    // Catalog step() is authoritative; hierarchical nodes are the teaching view.
    behaviorKey: key,
    inputs,
    outputs,
    nodes: spaceNodes(b.nodes),
    wires: b.wires,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Cross-coupled NOR latch (leaf implementation of basic RS).
 * Only used by {@link buildRsBasicNor}; other FFs should call {@link addBasicRs}.
 */
function addNorLatchGates(
  b: Builder,
  s: WireEndpoint,
  r: WireEndpoint,
  x: number,
  y: number,
  tag: string,
): { q: WireEndpoint; qn: WireEndpoint } {
  const norS = addGate(b, 'nor', x, y, `${tag}_norS`)
  const norR = addGate(b, 'nor', x, y + ROW, `${tag}_norR`)
  connect(b, s, gIn(norS.id, norS.gate, 'A'))
  connect(b, r, gIn(norR.id, norR.gate, 'A'))
  connect(b, gOut(norS.id, norS.gate, 'Y'), gIn(norR.id, norR.gate, 'B'))
  connect(b, gOut(norR.id, norR.gate, 'Y'), gIn(norS.id, norS.gate, 'B'))
  return {
    q: gOut(norR.id, norR.gate, 'Y'),
    qn: gOut(norS.id, norS.gate, 'Y'),
  }
}

function addFfModule(
  b: Builder,
  moduleKey: FfModuleKey,
  x: number,
  y: number,
  tag: string,
): { id: string; pin: (name: string, role: 'in' | 'out') => WireEndpoint } {
  const mod = getFfModule(moduleKey)
  if (!mod) throw new Error(`Missing FF module ${moduleKey}`)
  const id = `${b.prefix}_${tag}_${moduleKey}_${b.seq++}`
  const node: FfModuleNode = {
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
 * Place a reusable basic RS flip-flop module (`rs_basic_nor`).
 * Higher-level textbook FFs compose this instead of inlining NOR gates.
 */
function addBasicRs(
  b: Builder,
  x: number,
  y: number,
  tag: string,
): { s: WireEndpoint; r: WireEndpoint; q: WireEndpoint; qn: WireEndpoint } {
  const m = addFfModule(b, BASIC_RS_KEY, x, y, tag)
  return {
    s: m.pin('S', 'in'),
    r: m.pin('R', 'in'),
    q: m.pin('Q', 'out'),
    qn: m.pin('Qn', 'out'),
  }
}

/**
 * Place a reusable gated / synchronous RS latch (`rs_gated`).
 */
function addGatedRsModule(
  b: Builder,
  x: number,
  y: number,
  tag: string,
): {
  s: WireEndpoint
  r: WireEndpoint
  en: WireEndpoint
  q: WireEndpoint
  qn: WireEndpoint
} {
  const m = addFfModule(b, GATED_RS_KEY, x, y, tag)
  return {
    s: m.pin('S', 'in'),
    r: m.pin('R', 'in'),
    en: m.pin('EN', 'in'),
    q: m.pin('Q', 'out'),
    qn: m.pin('Qn', 'out'),
  }
}

/**
 * Place a reusable gated JK latch (`jk_gated`).
 * Edge JK master–slave stages compose this instead of inlining AND+RS.
 */
function addGatedJkModule(
  b: Builder,
  x: number,
  y: number,
  tag: string,
): {
  j: WireEndpoint
  k: WireEndpoint
  clk: WireEndpoint
  q: WireEndpoint
  qn: WireEndpoint
} {
  const m = addFfModule(b, GATED_JK_KEY, x, y, tag)
  return {
    j: m.pin('J', 'in'),
    k: m.pin('K', 'in'),
    clk: m.pin('CLK', 'in'),
    q: m.pin('Q', 'out'),
    qn: m.pin('Qn', 'out'),
  }
}

/**
 * Place a reusable edge D flip-flop (`d_edge`).
 * nPRE/nCLR may be left undriven — seq-sim defaults them inactive (1).
 */
function addEdgeDModule(
  b: Builder,
  x: number,
  y: number,
  tag: string,
): {
  d: WireEndpoint
  clk: WireEndpoint
  nPre: WireEndpoint
  nClr: WireEndpoint
  q: WireEndpoint
  qn: WireEndpoint
} {
  const m = addFfModule(b, EDGE_D_KEY, x, y, tag)
  return {
    d: m.pin('D', 'in'),
    clk: m.pin('CLK', 'in'),
    nPre: m.pin('nPRE', 'in'),
    nClr: m.pin('nCLR', 'in'),
    q: m.pin('Q', 'out'),
    qn: m.pin('Qn', 'out'),
  }
}

/**
 * Place a reusable edge JK flip-flop (`jk_edge`).
 * 74LS112 drives CLK through NOT to model falling-edge.
 */
function addEdgeJkModule(
  b: Builder,
  x: number,
  y: number,
  tag: string,
): {
  j: WireEndpoint
  k: WireEndpoint
  clk: WireEndpoint
  nPre: WireEndpoint
  nClr: WireEndpoint
  q: WireEndpoint
  qn: WireEndpoint
} {
  const m = addFfModule(b, EDGE_JK_KEY, x, y, tag)
  return {
    j: m.pin('J', 'in'),
    k: m.pin('K', 'in'),
    clk: m.pin('CLK', 'in'),
    nPre: m.pin('nPRE', 'in'),
    nClr: m.pin('nCLR', 'in'),
    q: m.pin('Q', 'out'),
    qn: m.pin('Qn', 'out'),
  }
}

/**
 * Gated D latch: D / ¬D drive a synchronous RS (S=D, R=¬D, EN).
 * Used when only D is available; prefer wiring Q/Qn into {@link addGatedRsModule}
 * for slave stages.
 */
function addGatedD(
  b: Builder,
  d: WireEndpoint,
  en: WireEndpoint,
  x: number,
  y: number,
  tag: string,
): { q: WireEndpoint; qn: WireEndpoint } {
  const notD = addGate(b, 'not', x, y, `${tag}_notD`)
  connect(b, d, gIn(notD.id, notD.gate, 'A'))
  const rs = addGatedRsModule(b, x + COL, y, tag)
  connect(b, d, rs.s)
  connect(b, gOut(notD.id, notD.gate, 'Y'), rs.r)
  connect(b, en, rs.en)
  return { q: rs.q, qn: rs.qn }
}

/** Slave / hold stage: S=Q, R=Qn into synchronous RS (no extra inverter). */
function addRsFromQPair(
  b: Builder,
  q: WireEndpoint,
  qn: WireEndpoint,
  en: WireEndpoint,
  x: number,
  y: number,
  tag: string,
): { q: WireEndpoint; qn: WireEndpoint } {
  const rs = addGatedRsModule(b, x, y, tag)
  connect(b, q, rs.s)
  connect(b, qn, rs.r)
  connect(b, en, rs.en)
  return { q: rs.q, qn: rs.qn }
}

/** Gated JK latch: AND tree + basic RS with Q/Qn feedback. */
function addGatedJk(
  b: Builder,
  j: WireEndpoint,
  k: WireEndpoint,
  clk: WireEndpoint,
  x: number,
  y: number,
  tag: string,
): { q: WireEndpoint; qn: WireEndpoint } {
  // S = J·CLK·Qn, R = K·CLK·Q
  const andJ1 = addGate(b, 'and', x, y, `${tag}_j1`)
  const andJ2 = addGate(b, 'and', x + COL, y, `${tag}_j2`)
  const andK1 = addGate(b, 'and', x, y + ROW, `${tag}_k1`)
  const andK2 = addGate(b, 'and', x + COL, y + ROW, `${tag}_k2`)
  connect(b, j, gIn(andJ1.id, andJ1.gate, 'A'))
  connect(b, clk, gIn(andJ1.id, andJ1.gate, 'B'))
  connect(b, gOut(andJ1.id, andJ1.gate, 'Y'), gIn(andJ2.id, andJ2.gate, 'A'))
  connect(b, k, gIn(andK1.id, andK1.gate, 'A'))
  connect(b, clk, gIn(andK1.id, andK1.gate, 'B'))
  connect(b, gOut(andK1.id, andK1.gate, 'Y'), gIn(andK2.id, andK2.gate, 'A'))

  const rs = addBasicRs(b, x + COL * 2, y, tag)
  connect(b, gOut(andJ2.id, andJ2.gate, 'Y'), rs.s)
  connect(b, gOut(andK2.id, andK2.gate, 'Y'), rs.r)
  connect(b, rs.qn, gIn(andJ2.id, andJ2.gate, 'B'))
  connect(b, rs.q, gIn(andK2.id, andK2.gate, 'B'))
  return { q: rs.q, qn: rs.qn }
}

function buildRsBasicNor(gates: LogicGate[]): FlipFlopCircuit {
  const { inputs, outputs } = ioPins(BASIC_RS_KEY)
  const b = createBuilder(gates, 'rs_basic')
  const latch = addNorLatchGates(
    b,
    io(findPin(inputs, 'S')),
    io(findPin(inputs, 'R')),
    COL,
    ROW,
    'core',
  )
  connect(b, latch.q, io(findPin(outputs, 'Q')))
  connect(b, latch.qn, io(findPin(outputs, 'Qn')))
  return finish(
    BASIC_RS_KEY,
    inputs,
    outputs,
    b,
    'Cross-coupled NOR latch (leaf RS)',
  )
}

function buildRsGated(gates: LogicGate[]): FlipFlopCircuit {
  const { inputs, outputs } = ioPins('rs_gated')
  const b = createBuilder(gates, 'rs_gated')
  const andS = addGate(b, 'and', COL, ROW, 'andS')
  const andR = addGate(b, 'and', COL, ROW * 2, 'andR')
  connect(b, io(findPin(inputs, 'S')), gIn(andS.id, andS.gate, 'A'))
  connect(b, io(findPin(inputs, 'EN')), gIn(andS.id, andS.gate, 'B'))
  connect(b, io(findPin(inputs, 'R')), gIn(andR.id, andR.gate, 'A'))
  connect(b, io(findPin(inputs, 'EN')), gIn(andR.id, andR.gate, 'B'))
  const rs = addBasicRs(b, COL * 2, ROW, 'core')
  connect(b, gOut(andS.id, andS.gate, 'Y'), rs.s)
  connect(b, gOut(andR.id, andR.gate, 'Y'), rs.r)
  connect(b, rs.q, io(findPin(outputs, 'Q')))
  connect(b, rs.qn, io(findPin(outputs, 'Qn')))
  return finish(
    'rs_gated',
    inputs,
    outputs,
    b,
    'Gated RS: EN·S / EN·R + basic RS',
  )
}

function buildJkGated(gates: LogicGate[]): FlipFlopCircuit {
  const { inputs, outputs } = ioPins('jk_gated')
  const b = createBuilder(gates, 'jk_gated')
  const latch = addGatedJk(
    b,
    io(findPin(inputs, 'J')),
    io(findPin(inputs, 'K')),
    io(findPin(inputs, 'CLK')),
    COL,
    ROW,
    'core',
  )
  connect(b, latch.q, io(findPin(outputs, 'Q')))
  connect(b, latch.qn, io(findPin(outputs, 'Qn')))
  return finish(
    'jk_gated',
    inputs,
    outputs,
    b,
    'Level-sensitive JK: AND tree + basic RS',
  )
}

function buildDEdge(gates: LogicGate[]): FlipFlopCircuit {
  const { inputs, outputs } = ioPins('d_edge')
  const b = createBuilder(gates, 'd_edge')
  const clk = io(findPin(inputs, 'CLK'))
  const d = io(findPin(inputs, 'D'))
  const notClk = addGate(b, 'not', COL, ROW * 2, 'notClk')
  connect(b, clk, gIn(notClk.id, notClk.gate, 'A'))
  const nClk = gOut(notClk.id, notClk.gate, 'Y')

  // Rising-edge MS: master samples on CLK=0 (EN=¬CLK); slave updates on CLK=1.
  // Async nPRE/nCLR are catalog-behavior only (gated RS stages have no async pins).
  const master = addGatedD(b, d, nClk, COL, ROW, 'master')
  const slave = addRsFromQPair(b, master.q, master.qn, clk, COL * 4, ROW, 'slave')

  void findPin(inputs, 'nPRE')
  void findPin(inputs, 'nCLR')

  connect(b, slave.q, io(findPin(outputs, 'Q')))
  connect(b, slave.qn, io(findPin(outputs, 'Qn')))
  return finish(
    'd_edge',
    inputs,
    outputs,
    b,
    'Master–slave D: NOT + 2× gated RS (↑CLK); async via behavior',
  )
}

function buildJkEdge(gates: LogicGate[]): FlipFlopCircuit {
  const { inputs, outputs } = ioPins('jk_edge')
  const b = createBuilder(gates, 'jk_edge')
  const clk = io(findPin(inputs, 'CLK'))
  const notClk = addGate(b, 'not', COL, ROW * 2, 'notClk')
  connect(b, clk, gIn(notClk.id, notClk.gate, 'A'))
  const nClk = gOut(notClk.id, notClk.gate, 'Y')

  // Rising-edge MS: master on ¬CLK, slave on CLK. Async via behavior model.
  const master = addGatedJkModule(b, COL * 2, ROW, 'master')
  connect(b, io(findPin(inputs, 'J')), master.j)
  connect(b, io(findPin(inputs, 'K')), master.k)
  connect(b, nClk, master.clk)

  const slave = addGatedJkModule(b, COL * 4, ROW, 'slave')
  connect(b, master.q, slave.j)
  connect(b, master.qn, slave.k)
  connect(b, clk, slave.clk)

  void findPin(inputs, 'nPRE')
  void findPin(inputs, 'nCLR')

  connect(b, slave.q, io(findPin(outputs, 'Q')))
  connect(b, slave.qn, io(findPin(outputs, 'Qn')))
  return finish(
    'jk_edge',
    inputs,
    outputs,
    b,
    'Master–slave JK: 2× gated JK (↑CLK); async via behavior',
  )
}

function buildTEdge(gates: LogicGate[], bar: boolean): FlipFlopCircuit {
  const key: FfModuleKey = bar ? 't_bar_edge' : 't_edge'
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const clk = io(findPin(inputs, 'CLK'))
  const t = io(findPin(inputs, 'T'))

  // Textbook T / T′: edge D with D = T⊕Q / T⊙Q.
  const mix = addGate(b, bar ? 'xnor' : 'xor', COL, ROW, 'mix')
  connect(b, t, gIn(mix.id, mix.gate, 'A'))

  const dff = addEdgeDModule(b, COL * 2, ROW, 'core')
  connect(b, gOut(mix.id, mix.gate, 'Y'), dff.d)
  connect(b, clk, dff.clk)
  connect(b, dff.q, gIn(mix.id, mix.gate, 'B'))
  connect(b, dff.q, io(findPin(outputs, 'Q')))
  connect(b, dff.qn, io(findPin(outputs, 'Qn')))
  return finish(
    key,
    inputs,
    outputs,
    b,
    bar
      ? 'T′: XNOR + edge D module (D = T⊙Q)'
      : 'T: XOR + edge D module (D = T⊕Q)',
  )
}

/** 74LS74: dual independent edge D flip-flops. */
function build74ls74(gates: LogicGate[]): FlipFlopCircuit {
  const { inputs, outputs } = ioPins('74ls74')
  const b = createBuilder(gates, '74ls74')

  const half1 = addEdgeDModule(b, COL * 2, ROW, 'ff1')
  connect(b, io(findPin(inputs, '1D')), half1.d)
  connect(b, io(findPin(inputs, '1CLK')), half1.clk)
  connect(b, io(findPin(inputs, '1nPRE')), half1.nPre)
  connect(b, io(findPin(inputs, '1nCLR')), half1.nClr)
  connect(b, half1.q, io(findPin(outputs, '1Q')))
  connect(b, half1.qn, io(findPin(outputs, '1Qn')))

  const half2 = addEdgeDModule(b, COL * 2, ROW * 3, 'ff2')
  connect(b, io(findPin(inputs, '2D')), half2.d)
  connect(b, io(findPin(inputs, '2CLK')), half2.clk)
  connect(b, io(findPin(inputs, '2nPRE')), half2.nPre)
  connect(b, io(findPin(inputs, '2nCLR')), half2.nClr)
  connect(b, half2.q, io(findPin(outputs, '2Q')))
  connect(b, half2.qn, io(findPin(outputs, '2Qn')))

  return finish(
    '74ls74',
    inputs,
    outputs,
    b,
    '74LS74: 2× edge D (independent clocks / async)',
  )
}

/** 74LS112: dual falling-edge JK = NOT(CLK) + edge JK per half. */
function build74ls112(gates: LogicGate[]): FlipFlopCircuit {
  const { inputs, outputs } = ioPins('74ls112')
  const b = createBuilder(gates, '74ls112')

  for (const half of [
    { tag: 'ff1', y: ROW, p: '1' as const },
    { tag: 'ff2', y: ROW * 3, p: '2' as const },
  ]) {
    const clk = io(findPin(inputs, `${half.p}CLK`))
    const notClk = addGate(b, 'not', COL, half.y, `${half.tag}_notClk`)
    connect(b, clk, gIn(notClk.id, notClk.gate, 'A'))

    const jk = addEdgeJkModule(b, COL * 2, half.y, half.tag)
    connect(b, io(findPin(inputs, `${half.p}J`)), jk.j)
    connect(b, io(findPin(inputs, `${half.p}K`)), jk.k)
    connect(b, gOut(notClk.id, notClk.gate, 'Y'), jk.clk)
    connect(b, io(findPin(inputs, `${half.p}nPRE`)), jk.nPre)
    connect(b, io(findPin(inputs, `${half.p}nCLR`)), jk.nClr)
    connect(b, jk.q, io(findPin(outputs, `${half.p}Q`)))
    connect(b, jk.qn, io(findPin(outputs, `${half.p}Qn`)))
  }

  return finish(
    '74ls112',
    inputs,
    outputs,
    b,
    '74LS112: 2× (NOT + edge JK) for falling-edge clocks',
  )
}

/** 74LS175: quad edge D with shared CLK / nCLR (nPRE inactive). */
function build74ls175(gates: LogicGate[]): FlipFlopCircuit {
  const { inputs, outputs } = ioPins('74ls175')
  const b = createBuilder(gates, '74ls175')
  const clk = io(findPin(inputs, 'CLK'))
  const nClr = io(findPin(inputs, 'nCLR'))

  for (let i = 0; i < 4; i += 1) {
    const ff = addEdgeDModule(b, COL * 2, ROW + i * ROW * 2, `ff${i}`)
    connect(b, io(findPin(inputs, `D${i}`)), ff.d)
    connect(b, clk, ff.clk)
    connect(b, nClr, ff.nClr)
    // nPRE left undriven → inactive high in seq-sim
    connect(b, ff.q, io(findPin(outputs, `Q${i}`)))
    connect(b, ff.qn, io(findPin(outputs, `Q${i}n`)))
  }

  return finish(
    '74ls175',
    inputs,
    outputs,
    b,
    '74LS175: 4× edge D, common CLK / nCLR',
  )
}

/**
 * Build hierarchical / gate-level internals for a catalog FF module.
 * Composites embed lower modules (basic RS / gated RS / JK / edge D) for drill-down.
 */
export function buildFfInternals(
  moduleKey: string,
  gates: LogicGate[],
): FlipFlopCircuit | null {
  if (!(GATE_LEVEL_FF_KEYS as readonly string[]).includes(moduleKey)) return null
  try {
    switch (moduleKey as GateLevelFfKey) {
      case 'rs_basic_nor':
        return buildRsBasicNor(gates)
      case 'rs_gated':
        return buildRsGated(gates)
      case 'jk_gated':
        return buildJkGated(gates)
      case 'jk_edge':
        return buildJkEdge(gates)
      case 'd_edge':
        return buildDEdge(gates)
      case 't_edge':
        return buildTEdge(gates, false)
      case 't_bar_edge':
        return buildTEdge(gates, true)
      case '74ls74':
        return build74ls74(gates)
      case '74ls112':
        return build74ls112(gates)
      case '74ls175':
        return build74ls175(gates)
      default:
        return null
    }
  } catch {
    return null
  }
}
