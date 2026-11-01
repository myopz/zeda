import { createId } from '@/lib/utils'
import { snowflake } from '@/lib/snowflake'
import { DEFAULT_GATE_GROUP, type BuiltinKey, type LogicGate } from '../types'

/** Bump when seed meta (e.g. group) changes so IndexedDB seeds re-apply. */
export const GATE_META_REV = 1

function pin(name: string, id?: string) {
  return { id: id ?? createId(), name }
}

/**
 * Fixed snowflake ids (worker=0, seq=0, timestamp offset ascending)
 * so AND/OR/NOT sort first under numeric id order.
 */
const BUILTIN_IDS: Record<BuiltinKey, string> = {
  and: snowflake.fixed(1),
  or: snowflake.fixed(2),
  not: snowflake.fixed(3),
  nand: snowflake.fixed(4),
  nor: snowflake.fixed(5),
  xor: snowflake.fixed(6),
  xnor: snowflake.fixed(7),
}

const AOI_ID = snowflake.fixed(8)

/** Previous string ids cleaned up on seed. */
export const LEGACY_GATE_IDS = [
  'builtin_and',
  'builtin_or',
  'builtin_not',
  'builtin_0_and',
  'builtin_1_or',
  'builtin_2_not',
  'builtin_nand',
  'builtin_nor',
  'builtin_xor',
  'builtin_xnor',
  'example_aoi',
] as const

const KEY_ORDER: BuiltinKey[] = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor']

const BUILTIN_FORMULAS: Record<BuiltinKey, string> = {
  and: 'A AND B',
  or: 'A OR B',
  not: 'NOT A',
  nand: 'NOT (A AND B)',
  nor: 'NOT (A OR B)',
  xor: 'A XOR B',
  xnor: 'A XNOR B',
}

function buildBuiltin(
  key: BuiltinKey,
  name: string,
  description: string,
  inputNames: string[],
): LogicGate {
  const id = BUILTIN_IDS[key]
  const base = (KEY_ORDER.indexOf(key) + 1) * 100
  const inputs = inputNames.map((n, i) => pin(n, snowflake.fixed(base + i + 1)))
  const outputs = [pin('Y', snowflake.fixed(base + 50))]
  const outId = outputs[0]!.id
  const now = Date.now()
  return {
    id,
    name,
    description,
    kind: 'builtin',
    builtinKey: key,
    group: 'basic',
    inputs,
    outputs,
    formulas: {
      [outId]: BUILTIN_FORMULAS[key],
    },
    createdAt: now,
    updatedAt: now,
  }
}

/** AND-OR-INVERT: Y = NOT((A AND B) OR (C AND D)) */
export function createAoiExampleGate(): LogicGate {
  const inputs = [
    pin('A', snowflake.fixed(801)),
    pin('B', snowflake.fixed(802)),
    pin('C', snowflake.fixed(803)),
    pin('D', snowflake.fixed(804)),
  ]
  const outputs = [pin('Y', snowflake.fixed(850))]
  const outId = outputs[0]!.id
  const formula = 'NOT ((A AND B) OR (C AND D))'
  const now = Date.now()
  return {
    id: AOI_ID,
    name: 'AOI',
    description: 'AND-OR-INVERT combination: NOT((A·B)+(C·D))',
    kind: 'custom',
    group: DEFAULT_GATE_GROUP,
    inputs,
    outputs,
    formulas: { [outId]: formula },
    createdAt: now,
    updatedAt: now,
  }
}

export function createBuiltinGates(): LogicGate[] {
  return [
    buildBuiltin('and', 'AND', '2-input AND gate', ['A', 'B']),
    buildBuiltin('or', 'OR', '2-input OR gate', ['A', 'B']),
    buildBuiltin('not', 'NOT', '1-input NOT gate', ['A']),
    buildBuiltin('nand', 'NAND', '2-input NAND gate', ['A', 'B']),
    buildBuiltin('nor', 'NOR', '2-input NOR gate', ['A', 'B']),
    buildBuiltin('xor', 'XOR', '2-input XOR gate', ['A', 'B']),
    buildBuiltin('xnor', 'XNOR', '2-input XNOR gate', ['A', 'B']),
  ]
}

/** Built-ins + seeded custom examples (upserted by stable id). */
export function createSeedGates(): LogicGate[] {
  return [...createBuiltinGates(), createAoiExampleGate()]
}

export function createBlankCustomGate(name: string): LogicGate {
  const inputs = [pin('A'), pin('B')]
  const outputs = [pin('Y')]
  const now = Date.now()
  const outId = outputs[0]!.id
  return {
    id: createId(),
    name,
    description: '',
    kind: 'custom',
    group: DEFAULT_GATE_GROUP,
    inputs,
    outputs,
    formulas: { [outId]: '0' },
    createdAt: now,
    updatedAt: now,
  }
}
