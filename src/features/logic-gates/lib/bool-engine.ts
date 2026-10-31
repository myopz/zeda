import type { Bit, GatePin } from '../types'

export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaError'
  }
}

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

export function generateInputCombinations(inputs: GatePin[]): Record<string, Bit>[] {
  const n = inputs.length
  const rows: Record<string, Bit>[] = []
  const total = 1 << n
  for (let i = 0; i < total; i += 1) {
    const row: Record<string, Bit> = {}
    for (let b = 0; b < n; b += 1) {
      const pin = inputs[b]!
      row[pin.id] = ((i >> (n - 1 - b)) & 1) as Bit
    }
    rows.push(row)
  }
  return rows
}

export function truthTableFromFormula(
  formula: string,
  inputs: GatePin[],
  outputId: string,
): Record<string, Bit>[] {
  const ast = parseFormula(formula)
  const nameById = Object.fromEntries(inputs.map((p) => [p.id, p.name]))
  return generateInputCombinations(inputs).map((row) => {
    const env: Record<string, Bit> = {}
    for (const pin of inputs) {
      env[pin.name] = row[pin.id]!
      env[nameById[pin.id]!] = row[pin.id]!
    }
    return { ...row, [outputId]: evalAst(ast, env) }
  })
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

export function formulaFromTruthTable(
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

export function rebuildFormulasFromTruthTable(
  truthTable: Record<string, Bit>[],
  inputs: GatePin[],
  outputs: GatePin[],
): Record<string, string> {
  const formulas: Record<string, string> = {}
  for (const out of outputs) {
    formulas[out.id] = formulaFromTruthTable(truthTable, inputs, out.id)
  }
  return formulas
}

export function applyFormulaToTable(
  truthTable: Record<string, Bit>[],
  inputs: GatePin[],
  outputId: string,
  formula: string,
): Record<string, Bit>[] {
  const computed = truthTableFromFormula(formula, inputs, outputId)
  return truthTable.map((row, i) => ({
    ...row,
    [outputId]: computed[i]![outputId]!,
  }))
}

export function resizeTruthTable(
  inputs: GatePin[],
  outputs: GatePin[],
  prevTable: Record<string, Bit>[],
  prevInputs: GatePin[],
): Record<string, Bit>[] {
  const prevByKey = new Map<string, Record<string, Bit>>()
  for (const row of prevTable) {
    const key = prevInputs.map((p) => row[p.id] ?? 0).join('')
    prevByKey.set(key, row)
  }

  return generateInputCombinations(inputs).map((row) => {
    const mapped: Record<string, Bit> = { ...row }
    // try match overlapping input names
    const keyParts = inputs.map((pin) => {
      const old = prevInputs.find((p) => p.name === pin.name || p.id === pin.id)
      return old ? String(row[pin.id]) : '0'
    })
    // Prefer exact previous pattern by name
    const nameKey = prevInputs
      .map((p) => {
        const match = inputs.find((n) => n.name === p.name)
        return match ? String(row[match.id]) : '0'
      })
      .join('')
    const prev = prevByKey.get(nameKey) ?? prevByKey.get(keyParts.join(''))
    for (const out of outputs) {
      const prevOut =
        prev?.[out.id] ??
        (prev
          ? Object.entries(prev).find(([k]) => !prevInputs.some((p) => p.id === k))?.[1]
          : undefined)
      mapped[out.id] = (prevOut as Bit | undefined) ?? 0
    }
    return mapped
  })
}

export function defaultPinName(index: number, kind: 'in' | 'out'): string {
  if (kind === 'in') return String.fromCharCode(65 + index) // A, B, C...
  if (index === 0) return 'Y'
  return `Y${index + 1}`
}

export function createEmptyGateTable(
  inputs: GatePin[],
  outputs: GatePin[],
): Record<string, Bit>[] {
  return generateInputCombinations(inputs).map((row) => {
    const full = { ...row }
    for (const o of outputs) full[o.id] = 0
    return full
  })
}
