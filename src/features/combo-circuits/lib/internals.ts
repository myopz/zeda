import type { LogicGate, BuiltinKey } from '@/features/logic-gates/types'
import type {
  ComboCircuit,
  CircuitNode,
  CircuitPin,
  CircuitWire,
  WireEndpoint,
} from '../types'
import { MODULES, MODULE_KEYS, type ModuleKey } from './modules'

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

function ioPins(moduleKey: ModuleKey) {
  const mod = MODULES[moduleKey]
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

/** Modules that expose hierarchical / gate-level internals. */
export function hasModuleInternals(moduleKey: string): boolean {
  return (MODULE_KEYS as readonly string[]).includes(moduleKey)
}

/**
 * Build gate-level (or hierarchical) internals for a catalog module.
 * Gate pin ids come from the live gate library (by builtinKey).
 */
export function buildModuleInternals(
  moduleKey: string,
  gates: LogicGate[],
): ComboCircuit | null {
  if (!(MODULE_KEYS as readonly string[]).includes(moduleKey)) return null
  try {
    switch (moduleKey as ModuleKey) {
      case 'half_adder':
        return buildHalfAdder(gates)
      case 'full_adder':
        return buildFullAdder(gates)
      case 'encoder_4_2':
        return buildEncoder42(gates)
      case 'priority_encoder_8_3':
        return buildPriorityEncoder83(gates)
      case 'decoder_2_4':
        return buildDecoder24(gates)
      case 'decoder_3_8':
        return buildDecoder38(gates)
      case 'seven_seg_decoder':
        return buildSevenSeg(gates)
      case '74ls138':
        return build74ls138(gates)
      case '74ls148':
        return build74ls148(gates)
      case '74ls283':
        return build74ls283(gates)
      default:
        return null
    }
  } catch {
    return null
  }
}

type Builder = {
  nodes: CircuitNode[]
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
  b.nodes.push({
    id,
    kind: 'gate',
    ref: { builtinKey: key, gateId: gate.id },
    position: { x, y },
  })
  return { id, gate }
}

function addModule(
  b: Builder,
  moduleKey: string,
  x: number,
  y: number,
  idSuffix?: string,
): string {
  const id = `${b.prefix}_${idSuffix ?? moduleKey}_${b.seq++}`
  b.nodes.push({
    id,
    kind: 'module',
    moduleKey,
    position: { x, y },
  })
  return id
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

function mIn(nodeId: string, moduleKey: ModuleKey, name: string): WireEndpoint {
  const pin = MODULES[moduleKey].inputs.find((p) => p.name === name)
  if (!pin) throw new Error(`${moduleKey} missing in ${name}`)
  return { nodeId, pinId: pin.id }
}

function mOut(nodeId: string, moduleKey: ModuleKey, name: string): WireEndpoint {
  const pin = MODULES[moduleKey].outputs.find((p) => p.name === name)
  if (!pin) throw new Error(`${moduleKey} missing out ${name}`)
  return { nodeId, pinId: pin.id }
}

/** Fan-out: connect one source to many sinks. */
function fanout(b: Builder, from: WireEndpoint, tos: WireEndpoint[]) {
  for (const to of tos) connect(b, from, to)
}

/** Device card footprint used by layout (matches compact DeviceNode). */
const GATE_W = 160
const GATE_H = 72
const MODULE_W = 180
const MODULE_H = 100
/** Horizontal / vertical clear gap between card AABBs. */
const GAP_X = 64
const GAP_Y = 56
/** Column / row pitch for initial placement (must be ≥ size + gap). */
const COL = GATE_W + GAP_X
const ROW = GATE_H + GAP_Y

function nodeSize(n: CircuitNode): { w: number; h: number } {
  return n.kind === 'module' ? { w: MODULE_W, h: MODULE_H } : { w: GATE_W, h: GATE_H }
}

/**
 * Snap nodes onto a column grid, then pack each column top→bottom so
 * cards never overlap (iterative pair-push was too weak on dense trees).
 */
function spaceNodes(nodes: CircuitNode[]): CircuitNode[] {
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

  // Cross-column residual: modules are wider than GATE_W; push down if still overlapping.
  for (let pass = 0; pass < 24; pass += 1) {
    let changed = false
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i]!
        const b = placed[j]!
        const sa = nodeSize(a)
        const sb = nodeSize(b)
        const overlapX =
          a.position.x < b.position.x + sb.w + GAP_X &&
          b.position.x < a.position.x + sa.w + GAP_X
        const overlapY =
          a.position.y < b.position.y + sb.h + GAP_Y &&
          b.position.y < a.position.y + sa.h + GAP_Y
        if (!overlapX || !overlapY) continue
        if (a.position.y <= b.position.y) {
          const ny = a.position.y + sa.h + GAP_Y
          if (b.position.y < ny) {
            b.position.y = ny
            changed = true
          }
        } else {
          const ny = b.position.y + sb.h + GAP_Y
          if (a.position.y < ny) {
            a.position.y = ny
            changed = true
          }
        }
      }
    }
    if (!changed) break
  }

  return placed
}

/** OR-reduce a list of sources into one output endpoint (binary tree). */
function orReduce(
  b: Builder,
  sources: WireEndpoint[],
  x: number,
  y: number,
): WireEndpoint {
  if (sources.length === 0) throw new Error('orReduce empty')
  if (sources.length === 1) return sources[0]!
  let layer = [...sources]
  let depth = 0
  while (layer.length > 1) {
    const next: WireEndpoint[] = []
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 >= layer.length) {
        next.push(layer[i]!)
        continue
      }
      const { id, gate } = addGate(
        b,
        'or',
        x + depth * COL,
        y + (i / 2) * ROW,
        `or${depth}`,
      )
      connect(b, layer[i]!, gIn(id, gate, 'A'))
      connect(b, layer[i + 1]!, gIn(id, gate, 'B'))
      next.push(gOut(id, gate, 'Y'))
    }
    layer = next
    depth += 1
  }
  return layer[0]!
}

/** AND-reduce */
function andReduce(
  b: Builder,
  sources: WireEndpoint[],
  x: number,
  y: number,
): WireEndpoint {
  if (sources.length === 0) throw new Error('andReduce empty')
  if (sources.length === 1) return sources[0]!
  let layer = [...sources]
  let depth = 0
  while (layer.length > 1) {
    const next: WireEndpoint[] = []
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 >= layer.length) {
        next.push(layer[i]!)
        continue
      }
      const { id, gate } = addGate(
        b,
        'and',
        x + depth * COL,
        y + (i / 2) * ROW,
        `and${depth}`,
      )
      connect(b, layer[i]!, gIn(id, gate, 'A'))
      connect(b, layer[i + 1]!, gIn(id, gate, 'B'))
      next.push(gOut(id, gate, 'Y'))
    }
    layer = next
    depth += 1
  }
  return layer[0]!
}

function finish(
  moduleKey: ModuleKey,
  inputs: CircuitPin[],
  outputs: CircuitPin[],
  b: Builder,
  description: string,
): ComboCircuit {
  const now = Date.now()
  return {
    id: `view:${moduleKey}`,
    name: moduleKey,
    description,
    kind: 'builtin',
    builtinKey: moduleKey,
    group: MODULES[moduleKey].category,
    inputs,
    outputs,
    nodes: spaceNodes(b.nodes),
    wires: b.wires,
    createdAt: now,
    updatedAt: now,
  }
}

// —— half adder: XOR + AND ——
function buildHalfAdder(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('half_adder')
  const b = createBuilder(gates, 'ha')
  const xor = addGate(b, 'xor', 240, 40)
  const and = addGate(b, 'and', 240, 40 + ROW)
  fanout(b, io(findPin(inputs, 'A')), [gIn(xor.id, xor.gate, 'A'), gIn(and.id, and.gate, 'A')])
  fanout(b, io(findPin(inputs, 'B')), [gIn(xor.id, xor.gate, 'B'), gIn(and.id, and.gate, 'B')])
  connect(b, gOut(xor.id, xor.gate, 'Y'), io(findPin(outputs, 'Sum')))
  connect(b, gOut(and.id, and.gate, 'Y'), io(findPin(outputs, 'Cout')))
  return finish('half_adder', inputs, outputs, b, 'XOR + AND')
}

// —— full adder: 2× half_adder + OR ——
function buildFullAdder(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('full_adder')
  const b = createBuilder(gates, 'fa')
  const haKey: ModuleKey = 'half_adder'

  const ha1 = addModule(b, haKey, COL, ROW, 'ha1')
  connect(b, io(findPin(inputs, 'A')), mIn(ha1, haKey, 'A'))
  connect(b, io(findPin(inputs, 'B')), mIn(ha1, haKey, 'B'))

  const ha2 = addModule(b, haKey, COL * 2, ROW, 'ha2')
  connect(b, mOut(ha1, haKey, 'Sum'), mIn(ha2, haKey, 'A'))
  connect(b, io(findPin(inputs, 'Cin')), mIn(ha2, haKey, 'B'))

  const coutOr = addGate(b, 'or', COL * 3, ROW + ROW, 'cout')
  connect(b, mOut(ha1, haKey, 'Cout'), gIn(coutOr.id, coutOr.gate, 'A'))
  connect(b, mOut(ha2, haKey, 'Cout'), gIn(coutOr.id, coutOr.gate, 'B'))

  connect(b, mOut(ha2, haKey, 'Sum'), io(findPin(outputs, 'Sum')))
  connect(b, gOut(coutOr.id, coutOr.gate, 'Y'), io(findPin(outputs, 'Cout')))
  return finish('full_adder', inputs, outputs, b, '2× half adder + OR')
}

// —— 4→2 encoder ——
function buildEncoder42(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('encoder_4_2')
  const b = createBuilder(gates, 'enc42')
  const y1 = addGate(b, 'or', 280, 40, 'y1')
  const y0 = addGate(b, 'or', 280, 40 + ROW, 'y0')
  const v01 = addGate(b, 'or', 200, 40 + ROW * 2, 'v01')
  const v23 = addGate(b, 'or', 200, 40 + ROW * 3, 'v23')
  const v = addGate(b, 'or', 200 + COL, 40 + ROW * 2.5, 'v')

  connect(b, io(findPin(inputs, 'I2')), gIn(y1.id, y1.gate, 'A'))
  connect(b, io(findPin(inputs, 'I3')), gIn(y1.id, y1.gate, 'B'))
  connect(b, io(findPin(inputs, 'I1')), gIn(y0.id, y0.gate, 'A'))
  connect(b, io(findPin(inputs, 'I3')), gIn(y0.id, y0.gate, 'B'))
  connect(b, io(findPin(inputs, 'I0')), gIn(v01.id, v01.gate, 'A'))
  connect(b, io(findPin(inputs, 'I1')), gIn(v01.id, v01.gate, 'B'))
  connect(b, io(findPin(inputs, 'I2')), gIn(v23.id, v23.gate, 'A'))
  connect(b, io(findPin(inputs, 'I3')), gIn(v23.id, v23.gate, 'B'))
  connect(b, gOut(v01.id, v01.gate, 'Y'), gIn(v.id, v.gate, 'A'))
  connect(b, gOut(v23.id, v23.gate, 'Y'), gIn(v.id, v.gate, 'B'))
  connect(b, gOut(y1.id, y1.gate, 'Y'), io(findPin(outputs, 'Y1')))
  connect(b, gOut(y0.id, y0.gate, 'Y'), io(findPin(outputs, 'Y0')))
  connect(b, gOut(v.id, v.gate, 'Y'), io(findPin(outputs, 'V')))
  return finish('encoder_4_2', inputs, outputs, b, 'OR tree encoder')
}

// —— 8→3 priority encoder ——
function buildPriorityEncoder83(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('priority_encoder_8_3')
  const b = createBuilder(gates, 'penc')

  // ~Ii only for i=2..7: P7..P1 need higher masks; ~I0/~I1 only served unused P0.
  const nY: WireEndpoint[] = new Array(8)
  for (let i = 2; i < 8; i += 1) {
    const g = addGate(b, 'not', 160, 40 + i * ROW, `n${i}`)
    connect(b, io(findPin(inputs, `I${i}`)), gIn(g.id, g.gate, 'A'))
    nY[i] = gOut(g.id, g.gate, 'Y')
  }

  // Priority one-hots P7..P1 (P0 unused: Y=000 when only I0 / none higher).
  const P: WireEndpoint[] = new Array(8)
  P[7] = io(findPin(inputs, 'I7'))
  for (let i = 6; i >= 1; i -= 1) {
    const higherNots: WireEndpoint[] = []
    for (let h = i + 1; h < 8; h += 1) {
      higherNots.push(nY[h]!)
    }
    P[i] = andReduce(
      b,
      [io(findPin(inputs, `I${i}`)), ...higherNots],
      160 + COL,
      40 + (6 - i) * ROW,
    )
  }

  const y2 = orReduce(b, [P[4]!, P[5]!, P[6]!, P[7]!], 160 + COL * 3, 40)
  const y1 = orReduce(b, [P[2]!, P[3]!, P[6]!, P[7]!], 160 + COL * 3, 40 + ROW * 2)
  const y0 = orReduce(b, [P[1]!, P[3]!, P[5]!, P[7]!], 160 + COL * 3, 40 + ROW * 4)
  const v = orReduce(
    b,
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => io(findPin(inputs, `I${i}`))),
    160 + COL * 3,
    40 + ROW * 6,
  )

  connect(b, y2, io(findPin(outputs, 'Y2')))
  connect(b, y1, io(findPin(outputs, 'Y1')))
  connect(b, y0, io(findPin(outputs, 'Y0')))
  connect(b, v, io(findPin(outputs, 'V')))
  return finish('priority_encoder_8_3', inputs, outputs, b, 'Priority one-hot + OR')
}

// —— 2→4 decoder ——
function buildDecoder24(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('decoder_2_4')
  const b = createBuilder(gates, 'dec24')
  const n1 = addGate(b, 'not', 160, 40, 'n1')
  const n0 = addGate(b, 'not', 160, 40 + ROW, 'n0')
  connect(b, io(findPin(inputs, 'A1')), gIn(n1.id, n1.gate, 'A'))
  connect(b, io(findPin(inputs, 'A0')), gIn(n0.id, n0.gate, 'A'))

  const terms: [string, WireEndpoint, WireEndpoint][] = [
    ['Y0', gOut(n1.id, n1.gate, 'Y'), gOut(n0.id, n0.gate, 'Y')],
    ['Y1', gOut(n1.id, n1.gate, 'Y'), io(findPin(inputs, 'A0'))],
    ['Y2', io(findPin(inputs, 'A1')), gOut(n0.id, n0.gate, 'Y')],
    ['Y3', io(findPin(inputs, 'A1')), io(findPin(inputs, 'A0'))],
  ]
  terms.forEach(([name, a, c], i) => {
    const g = addGate(b, 'and', 160 + COL, 40 + i * ROW, name)
    connect(b, a, gIn(g.id, g.gate, 'A'))
    connect(b, c, gIn(g.id, g.gate, 'B'))
    connect(b, gOut(g.id, g.gate, 'Y'), io(findPin(outputs, name)))
  })
  return finish('decoder_2_4', inputs, outputs, b, 'NOT + AND')
}

// —— 3→8 decoder ——
function buildDecoder38(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('decoder_3_8')
  const b = createBuilder(gates, 'dec38')
  const n2 = addGate(b, 'not', 140, 40, 'n2')
  const n1 = addGate(b, 'not', 140, 40 + ROW, 'n1')
  const n0 = addGate(b, 'not', 140, 40 + ROW * 2, 'n0')
  connect(b, io(findPin(inputs, 'A2')), gIn(n2.id, n2.gate, 'A'))
  connect(b, io(findPin(inputs, 'A1')), gIn(n1.id, n1.gate, 'A'))
  connect(b, io(findPin(inputs, 'A0')), gIn(n0.id, n0.gate, 'A'))

  const lit = (bit: 0 | 1, name: 'A2' | 'A1' | 'A0', ng: { id: string; gate: LogicGate }) =>
    bit === 0 ? gOut(ng.id, ng.gate, 'Y') : io(findPin(inputs, name))

  for (let i = 0; i < 8; i += 1) {
    const a2 = ((i >> 2) & 1) as 0 | 1
    const a1 = ((i >> 1) & 1) as 0 | 1
    const a0 = (i & 1) as 0 | 1
    const srcs = [
      lit(a2, 'A2', n2),
      lit(a1, 'A1', n1),
      lit(a0, 'A0', n0),
    ]
    const y = andReduce(b, srcs, 140 + COL, 40 + i * ROW)
    connect(b, y, io(findPin(outputs, `Y${i}`)))
  }
  return finish('decoder_3_8', inputs, outputs, b, '3–8 AND decode')
}

/** Hex → 7-seg (common cathode): SOP of minterms per segment. */
function buildSevenSeg(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('seven_seg_decoder')
  const b = createBuilder(gates, 'seg')

  const SEVEN_SEG: Record<number, string> = {
    0: '1111110',
    1: '0110000',
    2: '1101101',
    3: '1111001',
    4: '0110011',
    5: '1011011',
    6: '1011111',
    7: '1110000',
    8: '1111111',
    9: '1111011',
    10: '1110111',
    11: '0011111',
    12: '1001110',
    13: '0111101',
    14: '1001111',
    15: '1000111',
  }
  const segNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const

  const n3 = addGate(b, 'not', 120, 40, 'n3')
  const n2 = addGate(b, 'not', 120, 40 + ROW, 'n2')
  const n1 = addGate(b, 'not', 120, 40 + ROW * 2, 'n1')
  const n0 = addGate(b, 'not', 120, 40 + ROW * 3, 'n0')
  connect(b, io(findPin(inputs, 'D3')), gIn(n3.id, n3.gate, 'A'))
  connect(b, io(findPin(inputs, 'D2')), gIn(n2.id, n2.gate, 'A'))
  connect(b, io(findPin(inputs, 'D1')), gIn(n1.id, n1.gate, 'A'))
  connect(b, io(findPin(inputs, 'D0')), gIn(n0.id, n0.gate, 'A'))

  const lit = (bit: 0 | 1, name: 'D3' | 'D2' | 'D1' | 'D0', ng: { id: string; gate: LogicGate }) =>
    bit === 0 ? gOut(ng.id, ng.gate, 'Y') : io(findPin(inputs, name))

  const mintermOut: WireEndpoint[] = []
  for (let m = 0; m < 16; m += 1) {
    const bits = [
      lit(((m >> 3) & 1) as 0 | 1, 'D3', n3),
      lit(((m >> 2) & 1) as 0 | 1, 'D2', n2),
      lit(((m >> 1) & 1) as 0 | 1, 'D1', n1),
      lit((m & 1) as 0 | 1, 'D0', n0),
    ]
    mintermOut[m] = andReduce(b, bits, 120 + COL, 40 + m * ROW)
  }

  segNames.forEach((seg, si) => {
    const ms: WireEndpoint[] = []
    for (let m = 0; m < 16; m += 1) {
      if (SEVEN_SEG[m]![si] === '1') ms.push(mintermOut[m]!)
    }
    const y = orReduce(b, ms, 120 + COL * 4, 40 + si * ROW)
    connect(b, y, io(findPin(outputs, seg)))
  })

  return finish('seven_seg_decoder', inputs, outputs, b, 'Hex SOP → a–g')
}

// —— 74LS138: enable + decoder_3_8 + active-low Y ——
function build74ls138(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('74ls138')
  const b = createBuilder(gates, 'ls138')
  const decKey: ModuleKey = 'decoder_3_8'

  const nG2A = addGate(b, 'not', COL, ROW * 3, 'ng2a')
  const nG2B = addGate(b, 'not', COL, ROW * 4, 'ng2b')
  connect(b, io(findPin(inputs, 'G2A')), gIn(nG2A.id, nG2A.gate, 'A'))
  connect(b, io(findPin(inputs, 'G2B')), gIn(nG2B.id, nG2B.gate, 'A'))
  const en = andReduce(
    b,
    [
      io(findPin(inputs, 'G1')),
      gOut(nG2A.id, nG2A.gate, 'Y'),
      gOut(nG2B.id, nG2B.gate, 'Y'),
    ],
    COL * 2,
    ROW * 3,
  )

  // C/B/A → decoder A2/A1/A0
  const dec = addModule(b, decKey, COL * 2, ROW, 'dec')
  connect(b, io(findPin(inputs, 'C')), mIn(dec, decKey, 'A2'))
  connect(b, io(findPin(inputs, 'B')), mIn(dec, decKey, 'A1'))
  connect(b, io(findPin(inputs, 'A')), mIn(dec, decKey, 'A0'))

  for (let i = 0; i < 8; i += 1) {
    const gated = addGate(b, 'and', COL * 4, ROW + i * ROW, `en${i}`)
    connect(b, mOut(dec, decKey, `Y${i}`), gIn(gated.id, gated.gate, 'A'))
    connect(b, en, gIn(gated.id, gated.gate, 'B'))
    const inv = addGate(b, 'not', COL * 5, ROW + i * ROW, `y${i}`)
    connect(b, gOut(gated.id, gated.gate, 'Y'), gIn(inv.id, inv.gate, 'A'))
    connect(b, gOut(inv.id, inv.gate, 'Y'), io(findPin(outputs, `Y${i}`)))
  }
  return finish(
    '74ls138',
    inputs,
    outputs,
    b,
    'Enable + decoder_3_8 + active-low Y',
  )
}

// —— 74LS148: invert → priority_encoder_8_3 → invert + GS/EO ——
function build74ls148(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('74ls148')
  const b = createBuilder(gates, 'ls148')
  const peKey: ModuleKey = 'priority_encoder_8_3'

  // Active-low in → active-high internal
  const invI: { id: string; gate: LogicGate }[] = []
  for (let i = 0; i < 8; i += 1) {
    const g = addGate(b, 'not', COL, ROW + i * ROW, `ii${i}`)
    connect(b, io(findPin(inputs, `I${i}`)), gIn(g.id, g.gate, 'A'))
    invI.push(g)
  }
  const nEI = addGate(b, 'not', COL, ROW + ROW * 8, 'nei')
  connect(b, io(findPin(inputs, 'EI')), gIn(nEI.id, nEI.gate, 'A'))
  const enabled = gOut(nEI.id, nEI.gate, 'Y')

  // Mask inputs with enable, then feed textbook priority encoder.
  const I: WireEndpoint[] = []
  for (let i = 0; i < 8; i += 1) {
    const g = addGate(b, 'and', COL * 2, ROW + i * ROW, `ei${i}`)
    connect(b, gOut(invI[i]!.id, invI[i]!.gate, 'Y'), gIn(g.id, g.gate, 'A'))
    connect(b, enabled, gIn(g.id, g.gate, 'B'))
    I.push(gOut(g.id, g.gate, 'Y'))
  }

  const pe = addModule(b, peKey, COL * 4, ROW * 2, 'pe')
  for (let i = 0; i < 8; i += 1) {
    connect(b, I[i]!, mIn(pe, peKey, `I${i}`))
  }

  // Active-low address outputs
  for (const [outName, peOut, yi] of [
    ['A2', 'Y2', 0],
    ['A1', 'Y1', 1],
    ['A0', 'Y0', 2],
  ] as const) {
    const inv = addGate(b, 'not', COL * 6, ROW + yi * ROW, outName)
    connect(b, mOut(pe, peKey, peOut), gIn(inv.id, inv.gate, 'A'))
    connect(b, gOut(inv.id, inv.gate, 'Y'), io(findPin(outputs, outName)))
  }

  const any = mOut(pe, peKey, 'V')

  // GS = NOT(enabled AND any)
  const gsAnd = addGate(b, 'and', COL * 5, ROW + ROW * 7, 'gsand')
  connect(b, enabled, gIn(gsAnd.id, gsAnd.gate, 'A'))
  connect(b, any, gIn(gsAnd.id, gsAnd.gate, 'B'))
  const gs = addGate(b, 'not', COL * 6, ROW + ROW * 7, 'gs')
  connect(b, gOut(gsAnd.id, gsAnd.gate, 'Y'), gIn(gs.id, gs.gate, 'A'))
  connect(b, gOut(gs.id, gs.gate, 'Y'), io(findPin(outputs, 'GS')))

  // EO = EI OR any
  const eo = addGate(b, 'or', COL * 6, ROW + ROW * 8, 'eo')
  connect(b, io(findPin(inputs, 'EI')), gIn(eo.id, eo.gate, 'A'))
  connect(b, any, gIn(eo.id, eo.gate, 'B'))
  connect(b, gOut(eo.id, eo.gate, 'Y'), io(findPin(outputs, 'EO')))

  return finish(
    '74ls148',
    inputs,
    outputs,
    b,
    'Active-low wrap around priority_encoder_8_3',
  )
}

// —— 74LS283: 4× full_adder ——
function build74ls283(gates: LogicGate[]): ComboCircuit {
  const { inputs, outputs } = ioPins('74ls283')
  const b = createBuilder(gates, 'ls283')
  const faKey: ModuleKey = 'full_adder'

  let carry: WireEndpoint = io(findPin(inputs, 'Cin'))
  for (let i = 0; i < 4; i += 1) {
    const id = addModule(b, faKey, 220 + i * (MODULE_W + GAP_X + 24), 120, `fa${i}`)
    connect(b, io(findPin(inputs, `A${i}`)), mIn(id, faKey, 'A'))
    connect(b, io(findPin(inputs, `B${i}`)), mIn(id, faKey, 'B'))
    connect(b, carry, mIn(id, faKey, 'Cin'))
    connect(b, mOut(id, faKey, 'Sum'), io(findPin(outputs, `S${i}`)))
    carry = mOut(id, faKey, 'Cout')
  }
  connect(b, carry, io(findPin(outputs, 'Cout')))
  return finish('74ls283', inputs, outputs, b, '4× full adder')
}
