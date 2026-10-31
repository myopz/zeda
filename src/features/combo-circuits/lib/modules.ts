import { evalFormula } from '@/features/logic-gates/lib/bool-engine'
import type { Bit } from '../types'

export type ModuleCategory = 'adder' | 'encoder' | 'decoder' | 'ttl'

export type ModulePin = {
  id: string
  name: string
}

export type ModuleDef = {
  key: string
  category: ModuleCategory
  inputs: ModulePin[]
  outputs: ModulePin[]
  /** output pin id -> formula over input pin names */
  formulas?: Record<string, string>
  /** bits keyed by input pin name -> output pin name -> bit */
  evaluate?: (bitsByName: Record<string, Bit>) => Record<string, Bit>
}

export const MODULE_KEYS = [
  'half_adder',
  'full_adder',
  'encoder_4_2',
  'priority_encoder_8_3',
  'decoder_2_4',
  'decoder_3_8',
  'seven_seg_decoder',
  '74ls138',
  '74ls148',
  '74ls283',
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

function pin(moduleKey: string, name: string, role: 'in' | 'out'): ModulePin {
  return { id: `${moduleKey}:${role}:${name}`, name }
}

function pins(moduleKey: string, names: string[], role: 'in' | 'out'): ModulePin[] {
  return names.map((n) => pin(moduleKey, n, role))
}

function bit(v: boolean | number): Bit {
  return v ? 1 : 0
}

/** Common-cathode 7-seg patterns for hex 0–F (a–g high = lit). */
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
  10: '1110111', // A
  11: '0011111', // b
  12: '1001110', // C
  13: '0111101', // d
  14: '1001111', // E
  15: '1000111', // F
}

function makeFormulaModule(
  key: ModuleKey,
  category: ModuleCategory,
  inputNames: string[],
  outputFormulas: Record<string, string>,
): ModuleDef {
  const inputs = pins(key, inputNames, 'in')
  const outputs = pins(key, Object.keys(outputFormulas), 'out')
  const formulas: Record<string, string> = {}
  for (const out of outputs) {
    formulas[out.id] = outputFormulas[out.name]!
  }
  return { key, category, inputs, outputs, formulas }
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  half_adder: makeFormulaModule('half_adder', 'adder', ['A', 'B'], {
    Sum: 'A XOR B',
    Cout: 'A AND B',
  }),

  full_adder: makeFormulaModule('full_adder', 'adder', ['A', 'B', 'Cin'], {
    Sum: '(A XOR B) XOR Cin',
    Cout: '(A AND B) OR (Cin AND (A XOR B))',
  }),

  // Mutually exclusive active-high one-hot inputs I0–I3 (I0 = lowest).
  encoder_4_2: makeFormulaModule(
    'encoder_4_2',
    'encoder',
    ['I0', 'I1', 'I2', 'I3'],
    {
      Y1: 'I2 OR I3',
      Y0: 'I1 OR I3',
      V: 'I0 OR I1 OR I2 OR I3',
    },
  ),

  priority_encoder_8_3: {
    key: 'priority_encoder_8_3',
    category: 'encoder',
    inputs: pins('priority_encoder_8_3', ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'], 'in'),
    outputs: pins('priority_encoder_8_3', ['Y2', 'Y1', 'Y0', 'V'], 'out'),
    evaluate: (bits) => {
      let code = 0
      let valid = false
      for (let i = 7; i >= 0; i -= 1) {
        if (bits[`I${i}`]) {
          code = i
          valid = true
          break
        }
      }
      return {
        Y2: bit((code >> 2) & 1),
        Y1: bit((code >> 1) & 1),
        Y0: bit(code & 1),
        V: bit(valid),
      }
    },
  },

  decoder_2_4: makeFormulaModule('decoder_2_4', 'decoder', ['A1', 'A0'], {
    Y0: '(NOT A1) AND (NOT A0)',
    Y1: '(NOT A1) AND A0',
    Y2: 'A1 AND (NOT A0)',
    Y3: 'A1 AND A0',
  }),

  decoder_3_8: {
    key: 'decoder_3_8',
    category: 'decoder',
    inputs: pins('decoder_3_8', ['A2', 'A1', 'A0'], 'in'),
    outputs: pins('decoder_3_8', ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7'], 'out'),
    evaluate: (bits) => {
      const idx = (bits.A2! << 2) | (bits.A1! << 1) | bits.A0!
      const out: Record<string, Bit> = {}
      for (let i = 0; i < 8; i += 1) out[`Y${i}`] = bit(i === idx)
      return out
    },
  },

  seven_seg_decoder: {
    key: 'seven_seg_decoder',
    category: 'decoder',
    inputs: pins('seven_seg_decoder', ['D3', 'D2', 'D1', 'D0'], 'in'),
    outputs: pins('seven_seg_decoder', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'out'),
    evaluate: (bits) => {
      const n = (bits.D3! << 3) | (bits.D2! << 2) | (bits.D1! << 1) | bits.D0!
      const pattern = SEVEN_SEG[n] ?? '0000000'
      const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const
      const out: Record<string, Bit> = {}
      for (let i = 0; i < 7; i += 1) {
        out[names[i]!] = bit(pattern[i] === '1')
      }
      return out
    },
  },

  // Active-low Y outputs; enable when G1=1 and G2A=0 and G2B=0.
  '74ls138': {
    key: '74ls138',
    category: 'ttl',
    inputs: pins('74ls138', ['A', 'B', 'C', 'G1', 'G2A', 'G2B'], 'in'),
    outputs: pins('74ls138', ['Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7'], 'out'),
    evaluate: (bits) => {
      const enabled = bits.G1 === 1 && bits.G2A === 0 && bits.G2B === 0
      const idx = enabled ? (bits.C! << 2) | (bits.B! << 1) | bits.A! : -1
      const out: Record<string, Bit> = {}
      for (let i = 0; i < 8; i += 1) {
        // active low: selected line = 0 when enabled
        out[`Y${i}`] = bit(!(enabled && i === idx))
      }
      return out
    },
  },

  // Active-low inputs I0–I7 (0 = asserted); EI active-low enable.
  // A2–A0 active-low binary; GS / EO active-low status (simplified).
  '74ls148': {
    key: '74ls148',
    category: 'ttl',
    inputs: pins('74ls148', ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'EI'], 'in'),
    outputs: pins('74ls148', ['A2', 'A1', 'A0', 'GS', 'EO'], 'out'),
    evaluate: (bits) => {
      if (bits.EI !== 0) {
        return { A2: 1, A1: 1, A0: 1, GS: 1, EO: 1 }
      }
      let code = -1
      for (let i = 7; i >= 0; i -= 1) {
        if (bits[`I${i}`] === 0) {
          code = i
          break
        }
      }
      if (code < 0) {
        return { A2: 1, A1: 1, A0: 1, GS: 1, EO: 0 }
      }
      return {
        A2: bit(!((code >> 2) & 1)),
        A1: bit(!((code >> 1) & 1)),
        A0: bit(!(code & 1)),
        GS: 0,
        EO: 1,
      }
    },
  },

  '74ls283': {
    key: '74ls283',
    category: 'ttl',
    inputs: pins(
      '74ls283',
      ['A3', 'A2', 'A1', 'A0', 'B3', 'B2', 'B1', 'B0', 'Cin'],
      'in',
    ),
    outputs: pins('74ls283', ['S3', 'S2', 'S1', 'S0', 'Cout'], 'out'),
    evaluate: (bits) => {
      const a =
        (bits.A3! << 3) | (bits.A2! << 2) | (bits.A1! << 1) | bits.A0!
      const b =
        (bits.B3! << 3) | (bits.B2! << 2) | (bits.B1! << 1) | bits.B0!
      const sum = a + b + bits.Cin!
      return {
        S0: bit(sum & 1),
        S1: bit((sum >> 1) & 1),
        S2: bit((sum >> 2) & 1),
        S3: bit((sum >> 3) & 1),
        Cout: bit((sum >> 4) & 1),
      }
    },
  },
}

export function getModule(key: string): ModuleDef | undefined {
  return MODULES[key as ModuleKey]
}

export function listModules(): ModuleDef[] {
  return MODULE_KEYS.map((k) => MODULES[k])
}

/** Evaluate a module; returns bits keyed by output pin id. */
export function evaluateModule(
  def: ModuleDef,
  inputBitsById: Record<string, Bit>,
): Record<string, Bit> {
  const byName: Record<string, Bit> = {}
  for (const p of def.inputs) {
    byName[p.name] = inputBitsById[p.id] ?? 0
  }

  let byOutName: Record<string, Bit>
  if (def.evaluate) {
    byOutName = def.evaluate(byName)
  } else if (def.formulas) {
    byOutName = {}
    for (const out of def.outputs) {
      const formula = def.formulas[out.id] ?? '0'
      try {
        byOutName[out.name] = evalFormula(formula, byName)
      } catch (err) {
        throw new Error(
          `Module ${def.key} output ${out.name}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  } else {
    throw new Error(`Module ${def.key} has no evaluation strategy`)
  }

  const byId: Record<string, Bit> = {}
  for (const out of def.outputs) {
    byId[out.id] = byOutName[out.name] ?? 0
  }
  return byId
}
