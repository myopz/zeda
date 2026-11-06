import { controlStep } from './control'
import {
  MEM_SIZE,
  OP,
  REG_COUNT,
  type CpuPhase,
  decodeByte0,
  insnLength,
} from './isa'

export type CpuState = {
  mem: Uint8Array
  regs: Uint8Array
  pc: number
  ir: number
  imm: number
  z: 0 | 1
  c: 0 | 1
  phase: CpuPhase
  halted: boolean
  /** Scratch for LOAD writeback */
  memData: number
  cycle: number
}

export type CpuStepResult = {
  state: CpuState
  error?: string
}

export function createCpuState(mem?: Uint8Array): CpuState {
  return {
    mem: mem ? new Uint8Array(mem) : new Uint8Array(MEM_SIZE),
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
  }
}

export function resetCpu(state: CpuState, keepMem = true): CpuState {
  return {
    ...createCpuState(keepMem ? state.mem : undefined),
    mem: keepMem ? new Uint8Array(state.mem) : new Uint8Array(MEM_SIZE),
  }
}

export function loadMemory(state: CpuState, bytes: Uint8Array, base = 0): CpuState {
  if (base < 0 || base + bytes.length > MEM_SIZE) {
    throw new Error(
      `Load out of range: base=0x${base.toString(16)} len=${bytes.length}`,
    )
  }
  const mem = new Uint8Array(state.mem)
  mem.set(bytes, base)
  return { ...state, mem }
}

function alu(
  op: number,
  a: number,
  b: number,
): { y: number; z: 0 | 1; c: 0 | 1 } {
  let y = 0
  let c: 0 | 1 = 0
  switch (op) {
    case OP.ADD: {
      const sum = a + b
      y = sum & 0xff
      c = sum > 0xff ? 1 : 0
      break
    }
    case OP.SUB: {
      const diff = a - b
      y = diff & 0xff
      c = a < b ? 1 : 0
      break
    }
    case OP.AND:
      y = a & b
      break
    case OP.OR:
      y = a | b
      break
    case OP.XOR:
      y = a ^ b
      break
    case OP.NOT:
      y = (~a) & 0xff
      break
    default:
      y = a
  }
  return { y, z: y === 0 ? 1 : 0, c }
}

/**
 * Advance one ideal control cycle. Applies hardwired control + datapath.
 */
export function stepCpu(prev: CpuState): CpuStepResult {
  if (prev.halted || prev.phase === 'HALTED') {
    return { state: { ...prev, phase: 'HALTED', halted: true } }
  }

  const state: CpuState = {
    ...prev,
    mem: new Uint8Array(prev.mem),
    regs: new Uint8Array(prev.regs),
  }

  const { opcode, rd } = decodeByte0(state.ir)
  const ctrl = controlStep(state.phase, state.phase === 'FETCH0' ? 0 : opcode)

  try {
    if (state.phase === 'FETCH0') {
      if (state.pc >= MEM_SIZE) {
        return { state, error: `PC out of range: 0x${state.pc.toString(16)}` }
      }
      state.ir = state.mem[state.pc]!
      state.pc = (state.pc + 1) & 0xff
      // Validate opcode early
      const op = decodeByte0(state.ir).opcode
      insnLength(op)
      state.phase = 'FETCH1'
      state.cycle += 1
      return { state }
    }

    if (state.phase === 'FETCH1') {
      const len = insnLength(opcode)
      if (len === 2) {
        state.imm = state.mem[state.pc]!
        state.pc = (state.pc + 1) & 0xff
      }
      state.phase = 'EXEC'
      state.cycle += 1
      return { state }
    }

    if (state.phase === 'EXEC') {
      const rs = state.imm & 0x7
      switch (opcode) {
        case OP.HALT:
          state.halted = true
          state.phase = 'HALTED'
          state.cycle += 1
          return { state }
        case OP.NOP:
          state.phase = 'FETCH0'
          state.cycle += 1
          return { state }
        case OP.LOAD:
        case OP.STORE:
          state.phase = 'MEM'
          state.cycle += 1
          return { state }
        case OP.LOADI:
          state.memData = state.imm
          state.phase = 'WB'
          state.cycle += 1
          return { state }
        case OP.MOV:
          state.memData = state.regs[rs]!
          state.phase = 'WB'
          state.cycle += 1
          return { state }
        case OP.ADD:
        case OP.SUB:
        case OP.AND:
        case OP.OR:
        case OP.XOR: {
          const r = alu(opcode, state.regs[rd]!, state.regs[rs]!)
          state.memData = r.y
          state.z = r.z
          state.c = r.c
          state.phase = 'WB'
          state.cycle += 1
          return { state }
        }
        case OP.NOT: {
          const r = alu(OP.NOT, state.regs[rd]!, 0)
          state.memData = r.y
          state.z = r.z
          state.c = 0
          state.phase = 'WB'
          state.cycle += 1
          return { state }
        }
        case OP.JMP:
          state.pc = state.imm & 0xff
          state.phase = 'FETCH0'
          state.cycle += 1
          return { state }
        case OP.JZ:
          if (state.z) state.pc = state.imm & 0xff
          state.phase = 'FETCH0'
          state.cycle += 1
          return { state }
        case OP.JC:
          if (state.c) state.pc = state.imm & 0xff
          state.phase = 'FETCH0'
          state.cycle += 1
          return { state }
        default:
          return {
            state,
            error: `Undefined opcode 0x${opcode.toString(16)} at EXEC`,
          }
      }
    }

    if (state.phase === 'MEM') {
      const addr = state.imm & 0xff
      if (opcode === OP.LOAD) {
        state.memData = state.mem[addr]!
        state.phase = 'WB'
      } else if (opcode === OP.STORE) {
        state.mem[addr] = state.regs[rd]!
        state.phase = 'FETCH0'
      } else {
        state.phase = 'FETCH0'
      }
      state.cycle += 1
      return { state }
    }

    if (state.phase === 'WB') {
      state.regs[rd] = state.memData & 0xff
      state.phase = 'FETCH0'
      state.cycle += 1
      return { state }
    }

    // Fallback using ctrl table (should not reach)
    state.phase = ctrl.nextPhase
    state.cycle += 1
    return { state }
  } catch (err) {
    return {
      state,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Run until HALT or maxCycles; returns final state. */
export function runCpu(state: CpuState, maxCycles = 10_000): CpuStepResult {
  let cur = state
  for (let i = 0; i < maxCycles; i += 1) {
    const r = stepCpu(cur)
    cur = r.state
    if (r.error) return r
    if (cur.halted || cur.phase === 'HALTED') return { state: cur }
  }
  return {
    state: cur,
    error: `Exceeded maxCycles (${maxCycles}) without HALT`,
  }
}
