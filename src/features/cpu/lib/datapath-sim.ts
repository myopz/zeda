/**
 * Teaching CPU datapath (16×8): coordinates PC/IR/RegFile/ALU/RAM/control.
 * Module behaviors (alu evaluate, ram/regfile semantics) are authoritative for
 * their slices; this coordinator advances multi-cycle phases — not combo netlist.
 */
import {
  OP,
  REG_COUNT,
  TEACHING_MEM_SIZE,
  type CpuPhase,
  decodeByte0,
  insnLength,
} from './isa'
import { evaluateModule, getModule } from '@/features/combo-circuits/lib/modules'
import type { Bit } from '@/features/combo-circuits/types'

export type DatapathSignals = {
  phase: CpuPhase
  pcInc: boolean
  pcLoad: boolean
  irLoad: boolean
  immLoad: boolean
  rfWe: boolean
  memWe: boolean
  memRead: boolean
  aluOp: number
  /** Active graph edge ids for highlight */
  activeEdges: string[]
  /** Human-readable bus values */
  buses: Record<string, number>
}

export type DatapathState = {
  mem: Uint8Array
  regs: Uint8Array
  pc: number
  ir: number
  imm: number
  z: 0 | 1
  c: 0 | 1
  phase: CpuPhase
  halted: boolean
  memData: number
  cycle: number
  signals: DatapathSignals
}

export type DatapathStepResult = {
  state: DatapathState
  error?: string
}

function emptySignals(phase: CpuPhase): DatapathSignals {
  return {
    phase,
    pcInc: false,
    pcLoad: false,
    irLoad: false,
    immLoad: false,
    rfWe: false,
    memWe: false,
    memRead: false,
    aluOp: 0,
    activeEdges: [],
    buses: {},
  }
}

/** Run alu_8 catalog evaluate for teaching visibility. */
export function evalAlu8(
  a: number,
  b: number,
  op: number,
): { y: number; z: 0 | 1; c: 0 | 1 } {
  const def = getModule('alu_8')
  if (!def) {
    // Fallback if catalog missing
    return { y: (a + b) & 0xff, z: 0, c: 0 }
  }
  const inputBits: Record<string, Bit> = {}
  for (const p of def.inputs) {
    if (p.name.startsWith('A')) inputBits[p.id] = ((a >> Number(p.name.slice(1))) & 1) as Bit
    else if (p.name.startsWith('B')) inputBits[p.id] = ((b >> Number(p.name.slice(1))) & 1) as Bit
    else if (p.name === 'OP0') inputBits[p.id] = (op & 1) as Bit
    else if (p.name === 'OP1') inputBits[p.id] = ((op >> 1) & 1) as Bit
    else if (p.name === 'OP2') inputBits[p.id] = ((op >> 2) & 1) as Bit
  }
  const out = evaluateModule(def, inputBits)
  let y = 0
  let z: 0 | 1 = 0
  let c: 0 | 1 = 0
  for (const p of def.outputs) {
    const v = out[p.id] ?? 0
    if (p.name.startsWith('Y')) y |= v << Number(p.name.slice(1))
    else if (p.name === 'Z') z = v
    else if (p.name === 'C') c = v
  }
  return { y: y & 0xff, z, c }
}

function aluOpcodeToOpField(opcode: number): number {
  switch (opcode) {
    case OP.ADD:
      return 0
    case OP.SUB:
      return 1
    case OP.AND:
      return 2
    case OP.OR:
      return 3
    case OP.XOR:
      return 4
    case OP.NOT:
      return 5
    default:
      return 6
  }
}

function memAddr4(addr: number): number {
  return addr & 0xf
}

export function createDatapathState(mem?: Uint8Array): DatapathState {
  const m = new Uint8Array(TEACHING_MEM_SIZE)
  if (mem) m.set(mem.subarray(0, TEACHING_MEM_SIZE))
  return {
    mem: m,
    regs: new Uint8Array(REG_COUNT),
    pc: 0,
    ir: 0,
    imm: 0,
    z: 0,
    c: 0,
    phase: 'FETCH0',
    halted: false,
    memData: 0,
    cycle: 0,
    signals: emptySignals('FETCH0'),
  }
}

export function resetDatapath(state: DatapathState, keepMem = true): DatapathState {
  return createDatapathState(keepMem ? state.mem : undefined)
}

/**
 * Load assembled image into teaching memory.
 * @throws if any written byte lies at address ≥ TEACHING_MEM_SIZE (via highWater)
 */
export function loadDatapathMemory(
  _state: DatapathState,
  image: Uint8Array,
  highWater: number,
): DatapathState {
  if (highWater > TEACHING_MEM_SIZE) {
    throw new Error(
      `Teaching datapath is 16×8 (0x00–0x0F); program uses ${highWater} bytes (exceeds 16)`,
    )
  }
  for (let i = TEACHING_MEM_SIZE; i < image.length; i += 1) {
    if (image[i]) {
      throw new Error(
        `Teaching datapath is 16×8; non-zero byte at 0x${i.toString(16)}`,
      )
    }
  }
  const mem = new Uint8Array(TEACHING_MEM_SIZE)
  mem.set(image.subarray(0, TEACHING_MEM_SIZE))
  return {
    ...createDatapathState(mem),
    mem,
  }
}

function snapshotBuses(s: DatapathState, extra: Record<string, number> = {}): Record<string, number> {
  return {
    PC: s.pc,
    IR: s.ir,
    IMM: s.imm,
    MEM_Q: s.mem[memAddr4(s.pc)] ?? 0,
    ...extra,
  }
}

/**
 * One ideal control cycle on the teaching datapath.
 * Updates sequential elements and exposes control/bus highlights for the canvas.
 */
export function stepDatapath(prev: DatapathState): DatapathStepResult {
  if (prev.halted || prev.phase === 'HALTED') {
    const signals = emptySignals('HALTED')
    signals.buses = snapshotBuses(prev)
    return {
      state: { ...prev, phase: 'HALTED', halted: true, signals },
    }
  }

  const state: DatapathState = {
    ...prev,
    mem: new Uint8Array(prev.mem),
    regs: new Uint8Array(prev.regs),
  }

  const { opcode, rd } = decodeByte0(state.ir)
  const edges: string[] = []

  try {
    if (state.phase === 'FETCH0') {
      if (state.pc >= TEACHING_MEM_SIZE) {
        return { state, error: `PC out of teaching range: 0x${state.pc.toString(16)}` }
      }
      const addr = memAddr4(state.pc)
      state.ir = state.mem[addr]!
      edges.push('pc->mem_addr', 'mem->ir', 'ctrl->pc_inc')
      state.pc = (state.pc + 1) & 0xff
      if (state.pc >= TEACHING_MEM_SIZE && state.pc !== 0) {
        // allow wrap within 8-bit but flag if fetch would leave 16-space next — soft
      }
      const op = decodeByte0(state.ir).opcode
      insnLength(op)
      state.phase = 'FETCH1'
      state.cycle += 1
      state.signals = {
        phase: 'FETCH1',
        pcInc: true,
        pcLoad: false,
        irLoad: true,
        immLoad: false,
        rfWe: false,
        memWe: false,
        memRead: true,
        aluOp: 0,
        activeEdges: edges,
        buses: snapshotBuses(state, { MEM_ADDR: addr, MEM_Q: state.ir }),
      }
      return { state }
    }

    if (state.phase === 'FETCH1') {
      const len = insnLength(opcode)
      if (len === 2) {
        if (state.pc >= TEACHING_MEM_SIZE) {
          return { state, error: `PC out of teaching range fetching imm: 0x${state.pc.toString(16)}` }
        }
        const addr = memAddr4(state.pc)
        state.imm = state.mem[addr]!
        state.pc = (state.pc + 1) & 0xff
        edges.push('pc->mem_addr', 'mem->imm', 'ctrl->pc_inc')
      }
      state.phase = 'EXEC'
      state.cycle += 1
      state.signals = {
        phase: 'EXEC',
        pcInc: len === 2,
        pcLoad: false,
        irLoad: false,
        immLoad: len === 2,
        rfWe: false,
        memWe: false,
        memRead: len === 2,
        aluOp: 0,
        activeEdges: edges,
        buses: snapshotBuses(state),
      }
      return { state }
    }

    if (state.phase === 'EXEC') {
      const rs = state.imm & 0x7
      switch (opcode) {
        case OP.HALT:
          state.halted = true
          state.phase = 'HALTED'
          state.cycle += 1
          edges.push('ctrl->halt')
          state.signals = {
            ...emptySignals('HALTED'),
            activeEdges: edges,
            buses: snapshotBuses(state),
          }
          return { state }
        case OP.NOP:
          state.phase = 'FETCH0'
          state.cycle += 1
          state.signals = {
            ...emptySignals('FETCH0'),
            activeEdges: ['ctrl->fetch'],
            buses: snapshotBuses(state),
          }
          return { state }
        case OP.LOAD:
        case OP.STORE:
          state.phase = 'MEM'
          state.cycle += 1
          edges.push('imm->mem_addr', 'ctrl->mem')
          state.signals = {
            phase: 'MEM',
            pcInc: false,
            pcLoad: false,
            irLoad: false,
            immLoad: false,
            rfWe: false,
            memWe: false,
            memRead: opcode === OP.LOAD,
            aluOp: 0,
            activeEdges: edges,
            buses: snapshotBuses(state, { MEM_ADDR: memAddr4(state.imm) }),
          }
          return { state }
        case OP.LOADI:
          state.memData = state.imm
          state.phase = 'WB'
          edges.push('imm->wb', 'ctrl->wb')
          break
        case OP.MOV:
          state.memData = state.regs[rs]!
          state.phase = 'WB'
          edges.push('rf_b->wb', 'ctrl->wb')
          break
        case OP.ADD:
        case OP.SUB:
        case OP.AND:
        case OP.OR:
        case OP.XOR: {
          const opField = aluOpcodeToOpField(opcode)
          const r = evalAlu8(state.regs[rd]!, state.regs[rs]!, opField)
          state.memData = r.y
          state.z = r.z
          state.c = r.c
          state.phase = 'WB'
          edges.push('rf_a->alu', 'rf_b->alu', 'alu->wb', 'ctrl->alu')
          state.cycle += 1
          state.signals = {
            phase: 'WB',
            pcInc: false,
            pcLoad: false,
            irLoad: false,
            immLoad: false,
            rfWe: false,
            memWe: false,
            memRead: false,
            aluOp: opField,
            activeEdges: edges,
            buses: snapshotBuses(state, {
              ALU_A: state.regs[rd]!,
              ALU_B: state.regs[rs]!,
              ALU_Y: r.y,
            }),
          }
          return { state }
        }
        case OP.NOT: {
          const r = evalAlu8(state.regs[rd]!, 0, 5)
          state.memData = r.y
          state.z = r.z
          state.c = 0
          state.phase = 'WB'
          edges.push('rf_a->alu', 'alu->wb', 'ctrl->alu')
          state.cycle += 1
          state.signals = {
            phase: 'WB',
            pcInc: false,
            pcLoad: false,
            irLoad: false,
            immLoad: false,
            rfWe: false,
            memWe: false,
            memRead: false,
            aluOp: 5,
            activeEdges: edges,
            buses: snapshotBuses(state, { ALU_A: state.regs[rd]!, ALU_Y: r.y }),
          }
          return { state }
        }
        case OP.JMP:
          state.pc = memAddr4(state.imm)
          state.phase = 'FETCH0'
          edges.push('imm->pc', 'ctrl->pc_load')
          state.cycle += 1
          state.signals = {
            phase: 'FETCH0',
            pcInc: false,
            pcLoad: true,
            irLoad: false,
            immLoad: false,
            rfWe: false,
            memWe: false,
            memRead: false,
            aluOp: 0,
            activeEdges: edges,
            buses: snapshotBuses(state),
          }
          return { state }
        case OP.JZ:
          if (state.z) {
            state.pc = memAddr4(state.imm)
            edges.push('imm->pc', 'ctrl->pc_load', 'flags->ctrl')
          } else {
            edges.push('flags->ctrl')
          }
          state.phase = 'FETCH0'
          state.cycle += 1
          state.signals = {
            phase: 'FETCH0',
            pcInc: false,
            pcLoad: !!state.z,
            irLoad: false,
            immLoad: false,
            rfWe: false,
            memWe: false,
            memRead: false,
            aluOp: 0,
            activeEdges: edges,
            buses: snapshotBuses(state),
          }
          return { state }
        case OP.JC:
          if (state.c) {
            state.pc = memAddr4(state.imm)
            edges.push('imm->pc', 'ctrl->pc_load', 'flags->ctrl')
          } else {
            edges.push('flags->ctrl')
          }
          state.phase = 'FETCH0'
          state.cycle += 1
          state.signals = {
            phase: 'FETCH0',
            pcInc: false,
            pcLoad: !!state.c,
            irLoad: false,
            immLoad: false,
            rfWe: false,
            memWe: false,
            memRead: false,
            aluOp: 0,
            activeEdges: edges,
            buses: snapshotBuses(state),
          }
          return { state }
        default:
          return {
            state,
            error: `Undefined opcode 0x${opcode.toString(16)} at EXEC`,
          }
      }
      // LOADI / MOV fall through to set WB signals
      state.cycle += 1
      state.signals = {
        phase: 'WB',
        pcInc: false,
        pcLoad: false,
        irLoad: false,
        immLoad: false,
        rfWe: false,
        memWe: false,
        memRead: false,
        aluOp: 0,
        activeEdges: edges,
        buses: snapshotBuses(state, { WB_DATA: state.memData }),
      }
      return { state }
    }

    if (state.phase === 'MEM') {
      const addr = memAddr4(state.imm)
      if (opcode === OP.LOAD) {
        state.memData = state.mem[addr]!
        state.phase = 'WB'
        edges.push('imm->mem_addr', 'mem->wb', 'ctrl->mem_read')
        state.cycle += 1
        state.signals = {
          phase: 'WB',
          pcInc: false,
          pcLoad: false,
          irLoad: false,
          immLoad: false,
          rfWe: false,
          memWe: false,
          memRead: true,
          aluOp: 0,
          activeEdges: edges,
          buses: snapshotBuses(state, { MEM_ADDR: addr, MEM_Q: state.memData }),
        }
        return { state }
      }
      if (opcode === OP.STORE) {
        state.mem[addr] = state.regs[rd]!
        state.phase = 'FETCH0'
        edges.push('imm->mem_addr', 'rf_a->mem_d', 'ctrl->mem_we')
        state.cycle += 1
        state.signals = {
          phase: 'FETCH0',
          pcInc: false,
          pcLoad: false,
          irLoad: false,
          immLoad: false,
          rfWe: false,
          memWe: true,
          memRead: false,
          aluOp: 0,
          activeEdges: edges,
          buses: snapshotBuses(state, {
            MEM_ADDR: addr,
            MEM_D: state.regs[rd]!,
          }),
        }
        return { state }
      }
      state.phase = 'FETCH0'
      state.cycle += 1
      state.signals = { ...emptySignals('FETCH0'), buses: snapshotBuses(state) }
      return { state }
    }

    if (state.phase === 'WB') {
      state.regs[rd] = state.memData & 0xff
      state.phase = 'FETCH0'
      edges.push('wb->rf', 'ctrl->rf_we')
      state.cycle += 1
      state.signals = {
        phase: 'FETCH0',
        pcInc: false,
        pcLoad: false,
        irLoad: false,
        immLoad: false,
        rfWe: true,
        memWe: false,
        memRead: false,
        aluOp: 0,
        activeEdges: edges,
        buses: snapshotBuses(state, { WB_DATA: state.memData, RF_WA: rd }),
      }
      return { state }
    }

    state.signals = { ...emptySignals(state.phase), buses: snapshotBuses(state) }
    return { state }
  } catch (err) {
    return {
      state,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function runDatapath(
  state: DatapathState,
  maxCycles = 10_000,
): DatapathStepResult {
  let cur = state
  for (let i = 0; i < maxCycles; i += 1) {
    const r = stepDatapath(cur)
    cur = r.state
    if (r.error) return r
    if (cur.halted || cur.phase === 'HALTED') return { state: cur }
  }
  return {
    state: cur,
    error: `Exceeded maxCycles (${maxCycles}) without HALT`,
  }
}
