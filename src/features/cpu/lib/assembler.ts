import {
  MNEMONIC_TO_OP,
  OP,
  encodeByte0,
  type Opcode,
} from './isa'

export type AssembleError = {
  line: number
  message: string
}

export type AssembleResult =
  | { ok: true; bytes: Uint8Array; entry: number; /** exclusive high address written */ highWater: number }
  | { ok: false; errors: AssembleError[] }

function parseReg(tok: string): number | null {
  const m = /^R([0-7])$/i.exec(tok.trim())
  if (!m) return null
  return Number(m[1])
}

function parseNumber(tok: string): number | null {
  const t = tok.trim().replace(/,$/, '')
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16) & 0xff
  if (/^[0-9]+$/.test(t)) return Number(t) & 0xff
  return null
}

type Emit =
  | { kind: 'bytes'; data: number[] }
  | { kind: 'org'; addr: number }
  | { kind: 'label'; name: string }
  | { kind: 'ref'; name: string; slot: 'imm' }

type LineOut = {
  line: number
  emits: Emit[]
}

function stripComment(line: string): string {
  const hash = line.indexOf('#')
  const semi = line.indexOf(';')
  let cut = line.length
  if (hash >= 0) cut = Math.min(cut, hash)
  if (semi >= 0) cut = Math.min(cut, semi)
  return line.slice(0, cut).trim()
}

/**
 * Two-pass assembler for Zeda-8.
 * Supports ORG, DB, labels, and ISA mnemonics (docs/isa.md).
 */
export function assemble(source: string): AssembleResult {
  const errors: AssembleError[] = []
  const lines = source.split(/\r?\n/)
  const parsed: LineOut[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1
    let text = stripComment(lines[i] ?? '')
    if (!text) continue

    const emits: Emit[] = []

    // Labels: name: ...rest
    while (true) {
      const lm = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(text)
      if (!lm) break
      emits.push({ kind: 'label', name: lm[1]!.toUpperCase() })
      text = lm[2]!.trim()
      if (!text) break
    }
    if (!text) {
      parsed.push({ line: lineNo, emits })
      continue
    }

    const parts = text.split(/[\s,]+/).filter(Boolean)
    const mnem = parts[0]!.toUpperCase()

    if (mnem === 'ORG') {
      const addr = parseNumber(parts[1] ?? '')
      if (addr == null || parts.length !== 2) {
        errors.push({ line: lineNo, message: 'ORG requires one address' })
      } else {
        emits.push({ kind: 'org', addr })
      }
      parsed.push({ line: lineNo, emits })
      continue
    }

    if (mnem === 'DB') {
      const data: number[] = []
      for (const p of parts.slice(1)) {
        const n = parseNumber(p)
        if (n == null) {
          errors.push({ line: lineNo, message: `Bad DB operand «${p}»` })
          data.length = 0
          break
        }
        data.push(n)
      }
      if (data.length) emits.push({ kind: 'bytes', data })
      parsed.push({ line: lineNo, emits })
      continue
    }

    const opcode = MNEMONIC_TO_OP[mnem] as Opcode | undefined
    if (opcode == null) {
      errors.push({ line: lineNo, message: `Unknown mnemonic «${mnem}»` })
      parsed.push({ line: lineNo, emits })
      continue
    }

    try {
      const bytes = encodeInsn(opcode, parts.slice(1), lineNo, errors, emits)
      if (bytes) emits.push({ kind: 'bytes', data: bytes })
    } catch (err) {
      errors.push({
        line: lineNo,
        message: err instanceof Error ? err.message : String(err),
      })
    }
    parsed.push({ line: lineNo, emits })
  }

  if (errors.length) return { ok: false, errors }

  // Pass 1: resolve labels / size
  const labels = new Map<string, number>()
  let pc = 0
  let entry = 0
  let entrySet = false

  for (const row of parsed) {
    for (const e of row.emits) {
      if (e.kind === 'org') {
        pc = e.addr
        if (!entrySet) {
          entry = e.addr
          entrySet = true
        }
      } else if (e.kind === 'label') {
        if (labels.has(e.name)) {
          errors.push({ line: row.line, message: `Duplicate label ${e.name}` })
        } else {
          labels.set(e.name, pc)
        }
      } else if (e.kind === 'bytes') {
        if (!entrySet) {
          entry = pc
          entrySet = true
        }
        pc = (pc + e.data.length) & 0xff
      } else if (e.kind === 'ref') {
        pc = (pc + 1) & 0xff
      }
    }
  }

  if (errors.length) return { ok: false, errors }

  // Pass 2: emit
  const mem = new Uint8Array(256)
  pc = 0
  let max = 0

  for (const row of parsed) {
    for (const e of row.emits) {
      if (e.kind === 'org') {
        pc = e.addr
      } else if (e.kind === 'bytes') {
        for (const b of e.data) {
          mem[pc] = b
          max = Math.max(max, pc + 1)
          pc = (pc + 1) & 0xff
        }
      } else if (e.kind === 'ref') {
        const addr = labels.get(e.name)
        if (addr == null) {
          errors.push({ line: row.line, message: `Undefined label ${e.name}` })
        } else {
          mem[pc] = addr & 0xff
          max = Math.max(max, pc + 1)
          pc = (pc + 1) & 0xff
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors }

  // Full 256-byte image so ORG data islands are preserved.
  return { ok: true, bytes: mem, entry: entrySet ? entry : 0, highWater: max }
}

function encodeInsn(
  opcode: Opcode,
  args: string[],
  lineNo: number,
  errors: AssembleError[],
  emits: Emit[],
): number[] | null {
  const need = (n: number) => {
    if (args.length !== n) {
      errors.push({ line: lineNo, message: `Expected ${n} operand(s)` })
      return false
    }
    return true
  }

  const asReg = (tok: string) => {
    const r = parseReg(tok.replace(/,$/, ''))
    if (r == null) {
      errors.push({ line: lineNo, message: `Expected register, got «${tok}»` })
    }
    return r
  }

  const asImmOrLabel = (tok: string): { imm?: number; label?: string } | null => {
    const clean = tok.replace(/,$/, '')
    const n = parseNumber(clean)
    if (n != null) return { imm: n }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean)) {
      return { label: clean.toUpperCase() }
    }
    errors.push({ line: lineNo, message: `Bad immediate/address «${tok}»` })
    return null
  }

  switch (opcode) {
    case OP.HALT:
    case OP.NOP:
      if (!need(0)) return null
      return [encodeByte0(opcode, 0)]
    case OP.NOT: {
      if (!need(1)) return null
      const rd = asReg(args[0]!)
      if (rd == null) return null
      return [encodeByte0(opcode, rd)]
    }
    case OP.LOAD:
    case OP.STORE:
    case OP.LOADI: {
      if (!need(2)) return null
      const rd = asReg(args[0]!)
      if (rd == null) return null
      const imm = asImmOrLabel(args[1]!)
      if (!imm) return null
      const b0 = encodeByte0(opcode, rd)
      if (imm.label) {
        emits.push({ kind: 'bytes', data: [b0] })
        emits.push({ kind: 'ref', name: imm.label, slot: 'imm' })
        return null // already pushed
      }
      return [b0, imm.imm!]
    }
    case OP.MOV:
    case OP.ADD:
    case OP.SUB:
    case OP.AND:
    case OP.OR:
    case OP.XOR: {
      if (!need(2)) return null
      const rd = asReg(args[0]!)
      const rs = asReg(args[1]!)
      if (rd == null || rs == null) return null
      return [encodeByte0(opcode, rd), rs & 0x7]
    }
    case OP.JMP:
    case OP.JZ:
    case OP.JC: {
      if (!need(1)) return null
      const imm = asImmOrLabel(args[0]!)
      if (!imm) return null
      const b0 = encodeByte0(opcode, 0)
      if (imm.label) {
        emits.push({ kind: 'bytes', data: [b0] })
        emits.push({ kind: 'ref', name: imm.label, slot: 'imm' })
        return null
      }
      return [b0, imm.imm!]
    }
    default:
      errors.push({ line: lineNo, message: `Unhandled opcode` })
      return null
  }
}

export function formatAssembleErrors(errors: AssembleError[]): string {
  return errors.map((e) => `L${e.line}: ${e.message}`).join('\n')
}
