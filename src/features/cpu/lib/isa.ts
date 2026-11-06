/** Zeda-8 ISA constants — see docs/isa.md */

export const MEM_SIZE = 256
/** Teaching datapath canvas memory (ram_16x8). */
export const TEACHING_MEM_SIZE = 16
export const REG_COUNT = 8

export const OP = {
  HALT: 0x0,
  NOP: 0x1,
  LOAD: 0x2,
  STORE: 0x3,
  LOADI: 0x4,
  MOV: 0x5,
  ADD: 0x6,
  SUB: 0x7,
  AND: 0x8,
  OR: 0x9,
  XOR: 0xa,
  NOT: 0xb,
  JMP: 0xc,
  JZ: 0xd,
  JC: 0xe,
} as const

export type Opcode = (typeof OP)[keyof typeof OP]

export const MNEMONIC_TO_OP: Record<string, Opcode> = {
  HALT: OP.HALT,
  NOP: OP.NOP,
  LOAD: OP.LOAD,
  STORE: OP.STORE,
  LOADI: OP.LOADI,
  MOV: OP.MOV,
  ADD: OP.ADD,
  SUB: OP.SUB,
  AND: OP.AND,
  OR: OP.OR,
  XOR: OP.XOR,
  NOT: OP.NOT,
  JMP: OP.JMP,
  JZ: OP.JZ,
  JC: OP.JC,
}

export const OP_TO_MNEMONIC: Record<number, string> = Object.fromEntries(
  Object.entries(MNEMONIC_TO_OP).map(([k, v]) => [v, k]),
)

export function encodeByte0(opcode: Opcode, rd: number): number {
  if (rd < 0 || rd > 7) throw new Error(`Register out of range: ${rd}`)
  return ((opcode & 0xf) << 4) | ((rd & 0x7) << 1)
}

export function decodeByte0(byte: number): { opcode: number; rd: number } {
  return {
    opcode: (byte >> 4) & 0xf,
    rd: (byte >> 1) & 0x7,
  }
}

/** Instruction length in bytes (1 or 2). */
export function insnLength(opcode: number): number {
  switch (opcode) {
    case OP.HALT:
    case OP.NOP:
    case OP.NOT:
      return 1
    case OP.LOAD:
    case OP.STORE:
    case OP.LOADI:
    case OP.MOV:
    case OP.ADD:
    case OP.SUB:
    case OP.AND:
    case OP.OR:
    case OP.XOR:
    case OP.JMP:
    case OP.JZ:
    case OP.JC:
      return 2
    default:
      throw new Error(`Undefined opcode 0x${opcode.toString(16)}`)
  }
}

export type CpuPhase =
  | 'FETCH0'
  | 'FETCH1'
  | 'EXEC'
  | 'MEM'
  | 'WB'
  | 'HALTED'

export type ControlSignals = {
  pcInc: boolean
  pcLoad: boolean
  irLoad: boolean
  immLoad: boolean
  rfWe: boolean
  memWe: boolean
  memRead: boolean
  aluOp: number
  /** Next phase after this cycle completes. */
  nextPhase: CpuPhase
}
