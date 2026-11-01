import {
  DEFAULT_GATE_GROUP,
  type Bit,
  type GatePin,
  type LogicGate,
} from '../types'

export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaError'
  }
}

/** Quine–McCluskey auto-simplify is only safe up to this many inputs. */
export const AUTO_SIMPLIFY_MAX_INPUTS = 6

/** Above this, prefer showing total rows as 2^n (Number precision). */
export const SAFE_ROW_COUNT_BITS = 46

type Token =
  | { kind: 'ident'; value: string }
  | { kind: 'const'; value: Bit }
  | { kind: 'op'; value: 'AND' | 'OR' | 'NOT' | 'XOR' | 'XNOR' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

function normalizeSource(source: string): string {
  return source
    .replace(/·|∧|&{1,2}/g, ' AND ')
    .replace(/\+|∨|\|{1,2}/g, ' OR ')
    .replace(/⊕/g, ' XOR ')
    .replace(/⊙/g, ' XNOR ')
    .replace(/¯|¬|~/g, ' NOT ')
    .replace(/!/g, ' NOT ')
}

/** Tokenize boolean expression. Supports A' as NOT A postfix. */
export function tokenize(source: string): Token[] {
  const s = normalizeSource(source)
  const tokens: Token[] = []
  let i = 0

  while (i < s.length) {
    const ch = s[i]!
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' })
      i += 1
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' })
      i += 1
      continue
    }
    if (ch === '0' || ch === '1') {
      tokens.push({ kind: 'const', value: Number(ch) as Bit })
      i += 1
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j]!)) j += 1
      const word = s.slice(i, j)
      const upper = word.toUpperCase()
      if (upper === 'AND' || upper === 'OR' || upper === 'NOT' || upper === 'XOR' || upper === 'XNOR') {
        tokens.push({ kind: 'op', value: upper })
      } else if (s[j] === "'") {
        tokens.push({ kind: 'op', value: 'NOT' })
        tokens.push({ kind: 'ident', value: word })
        j += 1
      } else {
        tokens.push({ kind: 'ident', value: word })
      }
      i = j
      continue
    }
    throw new FormulaError(`Unexpected character "${ch}"`)
  }

  return insertImplicitAnd(tokens)
}

function insertImplicitAnd(tokens: Token[]): Token[] {
  const out: Token[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const curr = tokens[i]!
    const prev = out[out.length - 1]
    if (
      prev &&
      (prev.kind === 'ident' || prev.kind === 'const' || prev.kind === 'rparen') &&
      (curr.kind === 'ident' ||
        curr.kind === 'const' ||
        curr.kind === 'lparen' ||
        (curr.kind === 'op' && curr.value === 'NOT'))
    ) {
      out.push({ kind: 'op', value: 'AND' })
    }
    out.push(curr)
  }
  return out
}

type Ast =
  | { type: 'const'; value: Bit }
  | { type: 'var'; name: string }
  | { type: 'not'; arg: Ast }
  | { type: 'and'; left: Ast; right: Ast }
  | { type: 'or'; left: Ast; right: Ast }
  | { type: 'xor'; left: Ast; right: Ast }
  | { type: 'xnor'; left: Ast; right: Ast }

class Parser {
  pos = 0
  tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): Ast {
    if (this.tokens.length === 0) throw new FormulaError('Empty formula')
    const ast = this.parseOr()
    if (this.pos < this.tokens.length) throw new FormulaError('Unexpected trailing tokens')
    return ast
  }

  peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  consume(): Token {
    const t = this.tokens[this.pos]
    if (!t) throw new FormulaError('Unexpected end of formula')
    this.pos += 1
    return t
  }

  parseOr(): Ast {
    let left = this.parseXor()
    while (this.peek()?.kind === 'op' && (this.peek() as { value: string }).value === 'OR') {
      this.consume()
      left = { type: 'or', left, right: this.parseXor() }
    }
    return left
  }

  parseXor(): Ast {
    let left = this.parseAnd()
    while (
      this.peek()?.kind === 'op' &&
      ((this.peek() as { value: string }).value === 'XOR' ||
        (this.peek() as { value: string }).value === 'XNOR')
    ) {
      const op = this.consume() as { kind: 'op'; value: 'XOR' | 'XNOR' }
      const right = this.parseAnd()
      left = op.value === 'XOR' ? { type: 'xor', left, right } : { type: 'xnor', left, right }
    }
    return left
  }

  parseAnd(): Ast {
    let left = this.parseUnary()
    while (this.peek()?.kind === 'op' && (this.peek() as { value: string }).value === 'AND') {
      this.consume()
      left = { type: 'and', left, right: this.parseUnary() }
    }
    return left
  }

  parseUnary(): Ast {
    if (this.peek()?.kind === 'op' && (this.peek() as { value: string }).value === 'NOT') {
      this.consume()
      return { type: 'not', arg: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  parsePrimary(): Ast {
    const t = this.consume()
    if (t.kind === 'const') return { type: 'const', value: t.value }
    if (t.kind === 'ident') return { type: 'var', name: t.value }
    if (t.kind === 'lparen') {
      const inner = this.parseOr()
      const close = this.consume()
      if (close.kind !== 'rparen') throw new FormulaError('Expected ")"')
      return inner
    }
    throw new FormulaError('Expected variable, constant, or "("')
  }
}

export function parseFormula(source: string): Ast {
  return new Parser(tokenize(source)).parse()
}

export function evalAst(ast: Ast, env: Record<string, Bit>): Bit {
  switch (ast.type) {
    case 'const':
      return ast.value
    case 'var': {
      if (!(ast.name in env)) throw new FormulaError(`Unknown variable "${ast.name}"`)
      return env[ast.name]!
    }
    case 'not':
      return (1 - evalAst(ast.arg, env)) as Bit
    case 'and':
      return (evalAst(ast.left, env) & evalAst(ast.right, env)) as Bit
    case 'or':
      return (evalAst(ast.left, env) | evalAst(ast.right, env)) as Bit
    case 'xor':
      return (evalAst(ast.left, env) ^ evalAst(ast.right, env)) as Bit
    case 'xnor':
      return (1 - (evalAst(ast.left, env) ^ evalAst(ast.right, env))) as Bit
  }
}

export function evalFormula(source: string, envByName: Record<string, Bit>): Bit {
  return evalAst(parseFormula(source), envByName)
}

export type GateEvalModel = {
  inputs: GatePin[]
  outputs: GatePin[]
  formulas: Record<string, string>
}

export function totalTruthRowsBigInt(inputCount: number): bigint {
  return 1n << BigInt(Math.max(0, inputCount))
}

export function bitsForRowIndex(rowIndex: bigint, inputCount: number): Bit[] {
  const bits: Bit[] = []
  for (let b = 0; b < inputCount; b += 1) {
    const shift = BigInt(inputCount - 1 - b)
    bits.push(Number((rowIndex >> shift) & 1n) as Bit)
  }
  return bits
}

export function inputBitsById(inputs: GatePin[], bits: Bit[]): Record<string, Bit> {
  const row: Record<string, Bit> = {}
  for (let i = 0; i < inputs.length; i += 1) {
    row[inputs[i]!.id] = bits[i] ?? 0
  }
  return row
}

function envFromInputBits(
  inputs: GatePin[],
  inputBits: Record<string, Bit>,
): Record<string, Bit> {
  const env: Record<string, Bit> = {}
  for (const pin of inputs) {
    env[pin.name] = inputBits[pin.id] ?? 0
  }
  return env
}

/** Evaluate all outputs from formulas only. */
export function evaluateOutputs(
  model: GateEvalModel,
  inputBits: Record<string, Bit>,
): Record<string, Bit> {
  const env = envFromInputBits(model.inputs, inputBits)
  const out: Record<string, Bit> = {}
  for (const o of model.outputs) {
    const formula = model.formulas[o.id] ?? '0'
    try {
      out[o.id] = evalFormula(formula, env)
    } catch {
      out[o.id] = 0
    }
  }
  return out
}

export type TruthTablePageRow = {
  rowIndex: bigint
  cells: Record<string, Bit>
}

/** Lazily build one page of the truth table from formulas. */
export function buildTruthTablePage(
  model: GateEvalModel,
  pageStart: bigint,
  pageSize: number,
): TruthTablePageRow[] {
  const n = model.inputs.length
  const total = totalTruthRowsBigInt(n)
  const rows: TruthTablePageRow[] = []
  for (let i = 0; i < pageSize; i += 1) {
    const rowIndex = pageStart + BigInt(i)
    if (rowIndex >= total) break
    const bits = bitsForRowIndex(rowIndex, n)
    const inputMap = inputBitsById(model.inputs, bits)
    const outputs = evaluateOutputs(model, inputMap)
    rows.push({ rowIndex, cells: { ...inputMap, ...outputs } })
  }
  return rows
}

/** Quine–McCluskey for up to ~6 inputs. */
export function simplifySop(minterms: number[], numVars: number): number[][] {
  if (minterms.length === 0) return []
  if (minterms.length === 1 << numVars) return [[]] // tautology → empty product = 1

  type Term = { bits: (0 | 1 | '-')[]; covers: Set<number>; used: boolean }

  let current: Term[] = [...new Set(minterms)].map((m) => ({
    bits: Array.from({ length: numVars }, (_, i) => ((m >> (numVars - 1 - i)) & 1) as 0 | 1),
    covers: new Set([m]),
    used: false,
  }))

  const primes: Term[] = []

  while (current.length > 0) {
    const groups = new Map<number, Term[]>()
    for (const t of current) {
      const ones = t.bits.filter((b) => b === 1).length
      const list = groups.get(ones) ?? []
      list.push(t)
      groups.set(ones, list)
    }

    const next: Term[] = []
    const keys = [...groups.keys()].sort((a, b) => a - b)
    for (let gi = 0; gi < keys.length - 1; gi += 1) {
      const aList = groups.get(keys[gi]!)!
      const bList = groups.get(keys[gi + 1]!)!
      for (const a of aList) {
        for (const b of bList) {
          let diff = -1
          let ok = true
          for (let i = 0; i < numVars; i += 1) {
            if (a.bits[i] !== b.bits[i]) {
              if (a.bits[i] === '-' || b.bits[i] === '-' || diff !== -1) {
                ok = false
                break
              }
              diff = i
            }
          }
          if (!ok || diff === -1) continue
          a.used = true
          b.used = true
          const bits = a.bits.slice() as (0 | 1 | '-')[]
          bits[diff] = '-'
          const covers = new Set([...a.covers, ...b.covers])
          const key = bits.join('')
          if (!next.some((t) => t.bits.join('') === key)) {
            next.push({ bits, covers, used: false })
          }
        }
      }
    }

    for (const t of current) {
      if (!t.used) primes.push(t)
    }
    current = next
  }

  // Essential prime implicant chart (greedy + essentials)
  const uncovered = new Set(minterms)
  const chosen: Term[] = []
  const remaining = [...primes]

  while (uncovered.size > 0 && remaining.length > 0) {
    // essentials
    let progressed = false
    for (const m of [...uncovered]) {
      const covers = remaining.filter((p) => p.covers.has(m))
      if (covers.length === 1) {
        const p = covers[0]!
        chosen.push(p)
        for (const c of p.covers) uncovered.delete(c)
        const idx = remaining.indexOf(p)
        if (idx >= 0) remaining.splice(idx, 1)
        progressed = true
      }
    }
    if (progressed) continue
    // greedy: pick covering most uncovered
    remaining.sort(
      (a, b) =>
        [...b.covers].filter((x) => uncovered.has(x)).length -
        [...a.covers].filter((x) => uncovered.has(x)).length,
    )
    const best = remaining.shift()!
    chosen.push(best)
    for (const c of best.covers) uncovered.delete(c)
  }

  return chosen.map((t) =>
    t.bits.flatMap((b, i) => (b === '-' ? [] : b === 1 ? [i + 1] : [-(i + 1)])),
  )
}

export function formulaFromMinterms(minterms: number[], inputs: GatePin[]): string {
  const n = inputs.length
  if (n === 0) {
    return minterms.includes(0) ? '1' : '0'
  }
  if (minterms.length === 0) return '0'
  if (minterms.length === 1 << n) return '1'

  const products = simplifySop(minterms, n)
  if (products.length === 0) return '1'

  return products
    .map((lits) => {
      if (lits.length === 0) return '1'
      return lits
        .map((lit) => {
          const idx = Math.abs(lit) - 1
          const name = inputs[idx]!.name
          return lit > 0 ? name : `NOT ${name}`
        })
        .join(' AND ')
    })
    .join(' OR ')
}

function formulaFromLegacyTruthTable(
  truthTable: Record<string, Bit>[],
  inputs: GatePin[],
  outputId: string,
): string {
  const n = inputs.length
  if (n === 0) {
    const v = truthTable[0]?.[outputId] ?? 0
    return v === 1 ? '1' : '0'
  }
  const minterms: number[] = []
  for (let i = 0; i < truthTable.length; i += 1) {
    if (truthTable[i]![outputId] === 1) minterms.push(i)
  }
  return formulaFromMinterms(minterms, inputs)
}

export function defaultPinName(index: number, kind: 'in' | 'out'): string {
  if (kind === 'in') return String.fromCharCode(65 + (index % 26)) + (index >= 26 ? String(Math.floor(index / 26)) : '')
  if (index === 0) return 'Y'
  return `Y${index + 1}`
}

type LegacyGate = Partial<LogicGate> & {
  truthTable?: Record<string, Bit>[]
  overrides?: unknown
  formulas?: Record<string, string>
  inputs: GatePin[]
  outputs: GatePin[]
}

/** Normalize persisted / imported gates to formula-only model. */
export function normalizeGate(raw: LegacyGate): LogicGate {
  const formulas: Record<string, string> = { ...(raw.formulas ?? {}) }

  if (Array.isArray(raw.truthTable) && raw.truthTable.length > 0) {
    const n = raw.inputs.length
    if (n <= AUTO_SIMPLIFY_MAX_INPUTS) {
      for (const out of raw.outputs) {
        formulas[out.id] = formulaFromLegacyTruthTable(raw.truthTable, raw.inputs, out.id)
      }
    }
  }

  for (const out of raw.outputs) {
    if (!(out.id in formulas)) formulas[out.id] = '0'
  }

  const kind = raw.kind ?? 'custom'
  const groupRaw =
    typeof (raw as { group?: unknown }).group === 'string'
      ? (raw as { group: string }).group.trim()
      : ''
  return {
    id: raw.id!,
    name: raw.name ?? 'Gate',
    description: raw.description,
    kind,
    builtinKey: raw.builtinKey,
    group: groupRaw || (kind === 'builtin' ? 'basic' : DEFAULT_GATE_GROUP),
    inputs: raw.inputs,
    outputs: raw.outputs,
    formulas,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
  }
}
