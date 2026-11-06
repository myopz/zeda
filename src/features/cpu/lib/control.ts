import {
  type ControlSignals,
  type CpuPhase,
  OP,
  insnLength,
} from './isa'

/**
 * Hardwired multi-cycle control: (phase, opcode) → signals + next phase.
 * Does not mutate datapath; cpu-runtime applies signals.
 */
export function controlStep(phase: CpuPhase, opcode: number): ControlSignals {
  const idle: ControlSignals = {
    pcInc: false,
    pcLoad: false,
    irLoad: false,
    immLoad: false,
    rfWe: false,
    memWe: false,
    memRead: false,
    aluOp: 0,
    nextPhase: phase,
  }

  if (phase === 'HALTED') {
    return { ...idle, nextPhase: 'HALTED' }
  }

  if (phase === 'FETCH0') {
    return {
      ...idle,
      memRead: true,
      irLoad: true,
      pcInc: true,
      nextPhase: 'FETCH1',
    }
  }

  if (phase === 'FETCH1') {
    let len: number
    try {
      len = insnLength(opcode)
    } catch {
      // Undefined opcode surfaced by runtime after IR load
      return { ...idle, nextPhase: 'EXEC' }
    }
    if (len === 2) {
      return {
        ...idle,
        memRead: true,
        immLoad: true,
        pcInc: true,
        nextPhase: 'EXEC',
      }
    }
    return { ...idle, nextPhase: 'EXEC' }
  }

  if (phase === 'EXEC') {
    switch (opcode) {
      case OP.HALT:
        return { ...idle, nextPhase: 'HALTED' }
      case OP.NOP:
        return { ...idle, nextPhase: 'FETCH0' }
      case OP.LOAD:
        return { ...idle, nextPhase: 'MEM' }
      case OP.STORE:
        return { ...idle, nextPhase: 'MEM' }
      case OP.LOADI:
      case OP.MOV:
      case OP.ADD:
      case OP.SUB:
      case OP.AND:
      case OP.OR:
      case OP.XOR:
      case OP.NOT:
        return { ...idle, nextPhase: 'WB' }
      case OP.JMP:
      case OP.JZ:
      case OP.JC:
        return { ...idle, pcLoad: true, nextPhase: 'FETCH0' }
      default:
        return { ...idle, nextPhase: 'FETCH0' }
    }
  }

  if (phase === 'MEM') {
    if (opcode === OP.LOAD) {
      return { ...idle, memRead: true, nextPhase: 'WB' }
    }
    if (opcode === OP.STORE) {
      return { ...idle, memWe: true, nextPhase: 'FETCH0' }
    }
    return { ...idle, nextPhase: 'FETCH0' }
  }

  if (phase === 'WB') {
    return { ...idle, rfWe: true, nextPhase: 'FETCH0' }
  }

  return idle
}
