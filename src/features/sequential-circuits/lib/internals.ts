import type { BuiltinKey, LogicGate } from '@/features/logic-gates/types'
import { getModule } from '@/features/combo-circuits/lib/modules'
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
  SeqModuleNode,
  SeqComboModuleNode,
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

/** Match DeviceNode: label+pad ≈ 22px; port strip = max(32, rows×20). */
function cardHeight(inputCount: number, outputCount: number): number {
  const rows = Math.max(inputCount, outputCount, 1)
  return 22 + Math.max(32, rows * 20)
}

function nodeSize(n: SeqNode): { w: number; h: number } {
  if (n.kind === 'gate') return { w: GATE_W, h: GATE_H }
  if (n.kind === 'ff') {
    const mod = getFfModule(n.moduleKey)
    if (mod) {
      return { w: MODULE_W, h: cardHeight(mod.inputs.length, mod.outputs.length) }
    }
  } else if (n.kind === 'seq') {
    const mod = getSeqModule(n.moduleKey)
    if (mod) {
      return { w: MODULE_W, h: cardHeight(mod.inputs.length, mod.outputs.length) }
    }
  } else if (n.kind === 'comboModule') {
    const mod = getModule(n.moduleKey)
    if (mod) {
      return { w: MODULE_W, h: cardHeight(mod.inputs.length, mod.outputs.length) }
    }
  }
  return { w: MODULE_W, h: MODULE_H }
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
  // Cross-column: tall wide modules (mux/regfile) must not overlap neighbors.
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

function finish(
  key: SeqModuleKey,
  inputs: CircuitPin[],
  outputs: CircuitPin[],
  b: Builder,
  description: string,
): SequentialCircuit {
  const mod = getSeqModule(key)!
  const now = Date.now()
  return {
    id: `view:${key}`,
    name: key,
    description,
    kind: 'custom',
    group: mod.category,
    // Catalog step() is authoritative (mod-N / TTL); nodes are structural stand-ins.
    behaviorKey: key,
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

function addSeqModule(
  b: Builder,
  moduleKey: SeqModuleKey,
  x: number,
  y: number,
  tag: string,
): { id: string; pin: (name: string, role: 'in' | 'out') => WireEndpoint } {
  const mod = getSeqModule(moduleKey)
  if (!mod) throw new Error(`Missing seq module ${moduleKey}`)
  const id = `${b.prefix}_${tag}_${moduleKey}_${b.seq++}`
  const node: SeqModuleNode = {
    id,
    kind: 'seq',
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

function addComboModule(
  b: Builder,
  moduleKey: string,
  x: number,
  y: number,
  tag: string,
): { id: string; pin: (name: string, role: 'in' | 'out') => WireEndpoint } {
  const mod = getModule(moduleKey)
  if (!mod) throw new Error(`Missing combo module ${moduleKey}`)
  const id = `${b.prefix}_${tag}_${moduleKey}_${b.seq++}`
  const node: SeqComboModuleNode = {
    id,
    kind: 'comboModule',
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
 * Parallel register: per bit, D_ff = nLOAD'·Di + nLOAD·Qi
 * (nLOAD active-low load; nLOAD=1 holds).
 */
function buildRegN(key: 'reg_4' | 'reg_8', width: 4 | 8, gates: LogicGate[]): SequentialCircuit {
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const nLoad = io(findPin(inputs, 'nLOAD'))
  const clk = io(findPin(inputs, 'CLK'))
  const nClr = io(findPin(inputs, 'nCLR'))

  const nLoadInv = addGate(b, 'not', 0, -ROW, 'nload_inv')
  connect(b, nLoad, gIn(nLoadInv.id, nLoadInv.gate, 'A'))

  const ffs = Array.from({ length: width }, (_, i) =>
    addFf(b, 'd_edge', 3 * COL, i * ROW, `q${i}`),
  )

  for (let i = 0; i < width; i += 1) {
    const y = i * ROW
    const andLoad = addGate(b, 'and', COL, y, `load${i}`)
    connect(b, gOut(nLoadInv.id, nLoadInv.gate, 'Y'), gIn(andLoad.id, andLoad.gate, 'A'))
    connect(b, io(findPin(inputs, `D${i}`)), gIn(andLoad.id, andLoad.gate, 'B'))
    const andHold = addGate(b, 'and', COL, y + ROW * 0.35, `hold${i}`)
    connect(b, nLoad, gIn(andHold.id, andHold.gate, 'A'))
    connect(b, ffs[i]!.pin('Q', 'out'), gIn(andHold.id, andHold.gate, 'B'))
    const orMux = addGate(b, 'or', 2 * COL, y, `mux${i}`)
    connect(b, gOut(andLoad.id, andLoad.gate, 'Y'), gIn(orMux.id, orMux.gate, 'A'))
    connect(b, gOut(andHold.id, andHold.gate, 'Y'), gIn(orMux.id, orMux.gate, 'B'))
    connect(b, gOut(orMux.id, orMux.gate, 'Y'), ffs[i]!.pin('D', 'in'))

    connect(b, clk, ffs[i]!.pin('CLK', 'in'))
    connect(b, nClr, ffs[i]!.pin('nCLR', 'in'))
    connect(b, ffs[i]!.pin('Q', 'out'), io(findPin(outputs, `Q${i}`)))
  }
  return finish(
    key,
    inputs,
    outputs,
    b,
    `${width}× edge D + nLOAD mux (nLOAD′·D + nLOAD·Q); common CLK / nCLR`,
  )
}

function buildReg4(gates: LogicGate[]): SequentialCircuit {
  return buildRegN('reg_4', 4, gates)
}

function buildReg8(gates: LogicGate[]): SequentialCircuit {
  return buildRegN('reg_8', 8, gates)
}

/** 8× reg_8 + decoder_3_8 write select; read via mux_2_1_8 trees. */
function buildRegFile8x8(gates: LogicGate[]): SequentialCircuit {
  const key: SeqModuleKey = 'regfile_8x8'
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const clk = io(findPin(inputs, 'CLK'))
  const we = io(findPin(inputs, 'WE'))

  const dec = addComboModule(b, 'decoder_3_8', 0, 0, 'wadec')
  connect(b, io(findPin(inputs, 'WA2')), dec.pin('A2', 'in'))
  connect(b, io(findPin(inputs, 'WA1')), dec.pin('A1', 'in'))
  connect(b, io(findPin(inputs, 'WA0')), dec.pin('A0', 'in'))

  const regs = Array.from({ length: 8 }, (_, r) => {
    const reg = addSeqModule(b, 'reg_8', 3 * COL, r * (ROW * 1.2), `r${r}`)
    connect(b, clk, reg.pin('CLK', 'in'))
    for (let i = 0; i < 8; i += 1) {
      connect(b, io(findPin(inputs, `D${i}`)), reg.pin(`D${i}`, 'in'))
    }
    // nLOAD = ¬(WE ∧ Yi) = NAND(WE, Yi) via AND+NOT
    const andSel = addGate(b, 'and', 1.5 * COL, r * (ROW * 1.2), `wsel${r}`)
    connect(b, we, gIn(andSel.id, andSel.gate, 'A'))
    connect(b, dec.pin(`Y${r}`, 'out'), gIn(andSel.id, andSel.gate, 'B'))
    const nLoad = addGate(b, 'not', 2.2 * COL, r * (ROW * 1.2), `nld${r}`)
    connect(b, gOut(andSel.id, andSel.gate, 'Y'), gIn(nLoad.id, nLoad.gate, 'A'))
    connect(b, gOut(nLoad.id, nLoad.gate, 'Y'), reg.pin('nLOAD', 'in'))
    // nCLR left undriven (inactive default)
    return reg
  })

  // Build 8→1 mux tree of mux_2_1_8 for one read port
  const buildReadTree = (
    tag: string,
    a2: WireEndpoint,
    a1: WireEndpoint,
    a0: WireEndpoint,
    outPrefix: 'QA' | 'QB',
    baseY: number,
  ) => {
    const level0 = [0, 1, 2, 3].map((p) => {
      const mux = addComboModule(b, 'mux_2_1_8', 5 * COL, baseY + p * ROW * 2, `${tag}_l0_${p}`)
      const r0 = regs[p * 2]!
      const r1 = regs[p * 2 + 1]!
      for (let i = 0; i < 8; i += 1) {
        connect(b, r0.pin(`Q${i}`, 'out'), mux.pin(`A${i}`, 'in'))
        connect(b, r1.pin(`Q${i}`, 'out'), mux.pin(`B${i}`, 'in'))
      }
      connect(b, a0, mux.pin('S', 'in'))
      return mux
    })
    const level1 = [0, 1].map((p) => {
      const mux = addComboModule(b, 'mux_2_1_8', 7 * COL, baseY + p * ROW * 4, `${tag}_l1_${p}`)
      for (let i = 0; i < 8; i += 1) {
        connect(b, level0[p * 2]!.pin(`Y${i}`, 'out'), mux.pin(`A${i}`, 'in'))
        connect(b, level0[p * 2 + 1]!.pin(`Y${i}`, 'out'), mux.pin(`B${i}`, 'in'))
      }
      connect(b, a1, mux.pin('S', 'in'))
      return mux
    })
    const top = addComboModule(b, 'mux_2_1_8', 9 * COL, baseY + ROW * 2, `${tag}_top`)
    for (let i = 0; i < 8; i += 1) {
      connect(b, level1[0]!.pin(`Y${i}`, 'out'), top.pin(`A${i}`, 'in'))
      connect(b, level1[1]!.pin(`Y${i}`, 'out'), top.pin(`B${i}`, 'in'))
      connect(b, top.pin(`Y${i}`, 'out'), io(findPin(outputs, `${outPrefix}${i}`)))
    }
    connect(b, a2, top.pin('S', 'in'))
  }

  buildReadTree(
    'ra',
    io(findPin(inputs, 'RA2')),
    io(findPin(inputs, 'RA1')),
    io(findPin(inputs, 'RA0')),
    'QA',
    0,
  )
  buildReadTree(
    'rb',
    io(findPin(inputs, 'RB2')),
    io(findPin(inputs, 'RB1')),
    io(findPin(inputs, 'RB0')),
    'QB',
    10 * ROW,
  )

  return finish(
    key,
    inputs,
    outputs,
    b,
    '8× reg_8 + decoder_3_8 write; dual mux_2_1_8 read trees (step authoritative)',
  )
}

/** 16×8 RAM: two decoder_3_8 banks + 16× reg_8; nOE gates Q. */
function buildRam16x8(gates: LogicGate[]): SequentialCircuit {
  const key: SeqModuleKey = 'ram_16x8'
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)
  const clk = io(findPin(inputs, 'CLK'))
  const nWe = io(findPin(inputs, 'nWE'))
  const nOe = io(findPin(inputs, 'nOE'))
  const a3 = io(findPin(inputs, 'A3'))

  const a3Inv = addGate(b, 'not', 0, -ROW, 'a3inv')
  connect(b, a3, gIn(a3Inv.id, a3Inv.gate, 'A'))

  const decLo = addComboModule(b, 'decoder_3_8', 0, 0, 'declo')
  const decHi = addComboModule(b, 'decoder_3_8', 0, 10 * ROW, 'dechi')
  for (const dec of [decLo, decHi]) {
    connect(b, io(findPin(inputs, 'A2')), dec.pin('A2', 'in'))
    connect(b, io(findPin(inputs, 'A1')), dec.pin('A1', 'in'))
    connect(b, io(findPin(inputs, 'A0')), dec.pin('A0', 'in'))
  }

  // nWE active-low write → WE_eff = ¬nWE
  const weEff = addGate(b, 'not', COL, -ROW * 2, 'weeff')
  connect(b, nWe, gIn(weEff.id, weEff.gate, 'A'))

  const regs = Array.from({ length: 16 }, (_, addr) => {
    const bank = addr < 8 ? 0 : 1
    const idx = addr % 8
    const dec = bank === 0 ? decLo : decHi
    const enA3 = bank === 0 ? gOut(a3Inv.id, a3Inv.gate, 'Y') : a3
    const row = bank * 10 * ROW + idx * ROW
    const reg = addSeqModule(b, 'reg_8', 4 * COL, row, `m${addr}`)
    connect(b, clk, reg.pin('CLK', 'in'))
    for (let i = 0; i < 8; i += 1) {
      connect(b, io(findPin(inputs, `D${i}`)), reg.pin(`D${i}`, 'in'))
    }
    const andBank = addGate(b, 'and', 2 * COL, row, `bank${addr}`)
    connect(b, enA3, gIn(andBank.id, andBank.gate, 'A'))
    connect(b, dec.pin(`Y${idx}`, 'out'), gIn(andBank.id, andBank.gate, 'B'))
    const andWe = addGate(b, 'and', 2.7 * COL, row, `we${addr}`)
    connect(b, gOut(weEff.id, weEff.gate, 'Y'), gIn(andWe.id, andWe.gate, 'A'))
    connect(b, gOut(andBank.id, andBank.gate, 'Y'), gIn(andWe.id, andWe.gate, 'B'))
    const nLoad = addGate(b, 'not', 3.4 * COL, row, `nld${addr}`)
    connect(b, gOut(andWe.id, andWe.gate, 'Y'), gIn(nLoad.id, nLoad.gate, 'A'))
    connect(b, gOut(nLoad.id, nLoad.gate, 'Y'), reg.pin('nLOAD', 'in'))
    return { reg, sel: gOut(andBank.id, andBank.gate, 'Y') }
  })

  // Read mux: select among 16 words then AND with ¬nOE
  // Compact teaching stand-in: OR of (Qi ∧ sel_i) per bit — wired for word 0..15
  const oeInv = addGate(b, 'not', 6 * COL, -ROW, 'oeinv')
  connect(b, nOe, gIn(oeInv.id, oeInv.gate, 'A'))

  for (let bit = 0; bit < 8; bit += 1) {
    let acc: WireEndpoint | null = null
    for (let addr = 0; addr < 16; addr += 1) {
      const andCell = addGate(b, 'and', 6.5 * COL + (addr % 4) * 20, bit * ROW + Math.floor(addr / 4) * 12, `rd${addr}_${bit}`)
      connect(b, regs[addr]!.reg.pin(`Q${bit}`, 'out'), gIn(andCell.id, andCell.gate, 'A'))
      connect(b, regs[addr]!.sel, gIn(andCell.id, andCell.gate, 'B'))
      if (!acc) {
        acc = gOut(andCell.id, andCell.gate, 'Y')
      } else {
        const orA = addGate(b, 'or', 8 * COL, bit * ROW + addr, `ordo${bit}_${addr}`)
        connect(b, acc, gIn(orA.id, orA.gate, 'A'))
        connect(b, gOut(andCell.id, andCell.gate, 'Y'), gIn(orA.id, orA.gate, 'B'))
        acc = gOut(orA.id, orA.gate, 'Y')
      }
    }
    const andOe = addGate(b, 'and', 9.5 * COL, bit * ROW, `oe${bit}`)
    connect(b, acc!, gIn(andOe.id, andOe.gate, 'A'))
    connect(b, gOut(oeInv.id, oeInv.gate, 'Y'), gIn(andOe.id, andOe.gate, 'B'))
    connect(b, gOut(andOe.id, andOe.gate, 'Y'), io(findPin(outputs, `Q${bit}`)))
  }

  return finish(
    key,
    inputs,
    outputs,
    b,
    '16× reg_8 + dual decoder_3_8; step() authoritative for storage',
  )
}

/**
 * ROM[i]=(i<<4)|(~i & 0xF) → Q[7:4]=A[3:0], Q[3:0]=¬A[3:0].
 */
function buildRom16x8(gates: LogicGate[]): SequentialCircuit {
  const key: SeqModuleKey = 'rom_16x8'
  const { inputs, outputs } = ioPins(key)
  const b = createBuilder(gates, key)

  for (let i = 0; i < 4; i += 1) {
    const a = io(findPin(inputs, `A${i}`))
    const n = addGate(b, 'not', COL, i * ROW, `n${i}`)
    connect(b, a, gIn(n.id, n.gate, 'A'))
    // Low nibble: Q_i = ¬A_i
    connect(b, gOut(n.id, n.gate, 'Y'), io(findPin(outputs, `Q${i}`)))
    // High nibble: Q_{i+4} = A_i (wire through OR with 0 = A·¬A)
    const z = addGate(b, 'and', 2 * COL, i * ROW, `z${i}`)
    connect(b, a, gIn(z.id, z.gate, 'A'))
    connect(b, gOut(n.id, n.gate, 'Y'), gIn(z.id, z.gate, 'B'))
    const buf = addGate(b, 'or', 3 * COL, i * ROW, `buf${i}`)
    connect(b, a, gIn(buf.id, buf.gate, 'A'))
    connect(b, gOut(z.id, z.gate, 'Y'), gIn(buf.id, buf.gate, 'B'))
    connect(b, gOut(buf.id, buf.gate, 'Y'), io(findPin(outputs, `Q${i + 4}`)))
  }

  return finish(
    key,
    inputs,
    outputs,
    b,
    'ROM[i]=(i<<4)|(~i&0xF) ⇒ Q[7:4]=A, Q[3:0]=¬A',
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
    case 'reg_8':
      return buildReg8(gates)
    case 'regfile_8x8':
      return buildRegFile8x8(gates)
    case 'ram_16x8':
      return buildRam16x8(gates)
    case 'rom_16x8':
      return buildRom16x8(gates)
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
