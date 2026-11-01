import type { Bit } from '../types'
import type {
  StatefulModule,
} from '@/features/flip-flops/lib/seq-sim'
import { getFfModule } from '@/features/flip-flops/lib/ff-modules'

export type SeqCategory = 'register' | 'counter' | 'ttl'

export type SeqModuleDef = StatefulModule & {
  category: SeqCategory
}

export const SEQ_MODULE_KEYS = [
  'reg_4',
  'shift_reg_4_left',
  'shift_reg_4_right',
  'counter_bin_sync_4',
  'counter_bin_async_4',
  'counter_bin_sync_updown_4',
  'counter_dec_sync',
  'counter_dec_async',
  'counter_mod6_sync',
  '74ls161',
  '74ls90',
  '74ls194',
] as const

export type SeqModuleKey = (typeof SEQ_MODULE_KEYS)[number]

type ModulePin = { id: string; name: string }

function pin(moduleKey: string, name: string, role: 'in' | 'out'): ModulePin {
  return { id: `${moduleKey}:${role}:${name}`, name }
}

function pins(moduleKey: string, names: string[], role: 'in' | 'out'): ModulePin[] {
  return names.map((n) => pin(moduleKey, n, role))
}

function bit(v: boolean | number): Bit {
  return v ? 1 : 0
}

function rising(prev: Bit, curr: Bit): boolean {
  return prev === 0 && curr === 1
}

function asyncLow(v: Bit | undefined): boolean {
  return v === 0
}

function readQ(state: Record<string, Bit>, width: number): number {
  let n = 0
  for (let i = 0; i < width; i += 1) {
    if (state[`Q${i}`]) n |= 1 << i
  }
  return n
}

function writeQ(
  n: number,
  width: number,
): { state: Record<string, Bit>; outputs: Record<string, Bit> } {
  const state: Record<string, Bit> = {}
  const outputs: Record<string, Bit> = {}
  for (let i = 0; i < width; i += 1) {
    const q = bit((n >> i) & 1)
    state[`Q${i}`] = q
    outputs[`Q${i}`] = q
  }
  return { state, outputs }
}

function qNames(width: number): string[] {
  return Array.from({ length: width }, (_, i) => `Q${i}`)
}

function makeReg4(): SeqModuleDef {
  const key = 'reg_4'
  return {
    key,
    category: 'register',
    inputs: pins(key, ['D0', 'D1', 'D2', 'D3', 'CLK', 'nLOAD', 'nCLR'], 'in'),
    outputs: pins(key, qNames(4), 'out'),
    stateNames: qNames(4),
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: [
      'Async nCLR active-low clears all Qi',
      '↑CLK & nLOAD=0: Qi*=Di; else hold',
    ],
    step({ prevState, inputs, prevClk }) {
      if (asyncLow(inputs.nCLR)) {
        return { nextState: writeQ(0, 4).state, outputs: writeQ(0, 4).outputs }
      }
      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk)) {
        const cur = writeQ(readQ(prevState, 4), 4)
        return { nextState: cur.state, outputs: cur.outputs }
      }
      if (asyncLow(inputs.nLOAD)) {
        let n = 0
        for (let i = 0; i < 4; i += 1) {
          if (inputs[`D${i}`]) n |= 1 << i
        }
        const next = writeQ(n, 4)
        return { nextState: next.state, outputs: next.outputs }
      }
      const cur = writeQ(readQ(prevState, 4), 4)
      return { nextState: cur.state, outputs: cur.outputs }
    },
  }
}

function makeShift(
  key: 'shift_reg_4_left' | 'shift_reg_4_right',
  dir: 'left' | 'right',
): SeqModuleDef {
  return {
    key,
    category: 'register',
    inputs: pins(key, ['SI', 'CLK'], 'in'),
    outputs: pins(key, qNames(4), 'out'),
    stateNames: qNames(4),
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: [
      dir === 'left'
        ? '↑CLK: Q0*=SI; Qi*=Q(i-1)  (left toward Q3)'
        : '↑CLK: Q3*=SI; Qi*=Q(i+1)  (right toward Q0)',
    ],
    step({ prevState, inputs, prevClk }) {
      const cur = readQ(prevState, 4)
      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk)) {
        const hold = writeQ(cur, 4)
        return { nextState: hold.state, outputs: hold.outputs }
      }
      const si = inputs.SI ?? 0
      let next = 0
      if (dir === 'left') {
        next = ((cur << 1) | si) & 0xf
      } else {
        next = ((cur >> 1) | (si << 3)) & 0xf
      }
      const w = writeQ(next, 4)
      return { nextState: w.state, outputs: w.outputs }
    },
  }
}

function makeCounterBinSync4(): SeqModuleDef {
  const key = 'counter_bin_sync_4'
  return {
    key,
    category: 'counter',
    inputs: pins(key, ['CLK', 'EN'], 'in'),
    outputs: pins(key, qNames(4), 'out'),
    stateNames: qNames(4),
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: ['↑CLK & EN=1: count = (count+1) mod 16'],
    step({ prevState, inputs, prevClk }) {
      const cur = readQ(prevState, 4)
      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk) || (inputs.EN ?? 0) === 0) {
        const hold = writeQ(cur, 4)
        return { nextState: hold.state, outputs: hold.outputs }
      }
      const w = writeQ((cur + 1) & 0xf, 4)
      return { nextState: w.state, outputs: w.outputs }
    },
  }
}

function makeCounterBinAsync4(): SeqModuleDef {
  const key = 'counter_bin_async_4'
  return {
    key,
    category: 'counter',
    inputs: pins(key, ['CLK'], 'in'),
    outputs: pins(key, qNames(4), 'out'),
    stateNames: qNames(4),
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: ['Async ripple: ↑CLK toggles Q0; Qi toggles on ↑Q(i-1)'],
    step({ prevState, inputs, prevClk }) {
      const cur = readQ(prevState, 4)
      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk)) {
        const hold = writeQ(cur, 4)
        return { nextState: hold.state, outputs: hold.outputs }
      }
      // Ideal zero-delay ripple: one external edge advances full binary count.
      const w = writeQ((cur + 1) & 0xf, 4)
      return { nextState: w.state, outputs: w.outputs }
    },
  }
}

function makeCounterUpDown(): SeqModuleDef {
  const key = 'counter_bin_sync_updown_4'
  return {
    key,
    category: 'counter',
    inputs: pins(key, ['CLK', 'UP'], 'in'),
    outputs: pins(key, qNames(4), 'out'),
    stateNames: qNames(4),
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: ['↑CLK: UP=1 → +1; UP=0 → −1 (mod 16)'],
    step({ prevState, inputs, prevClk }) {
      const cur = readQ(prevState, 4)
      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk)) {
        const hold = writeQ(cur, 4)
        return { nextState: hold.state, outputs: hold.outputs }
      }
      const next = (inputs.UP ?? 1) === 1 ? (cur + 1) & 0xf : (cur - 1) & 0xf
      const w = writeQ(next, 4)
      return { nextState: w.state, outputs: w.outputs }
    },
  }
}

function makeModCounter(
  key: SeqModuleKey,
  mod: number,
  asyncRipple: boolean,
): SeqModuleDef {
  return {
    key,
    category: 'counter',
    inputs: pins(key, ['CLK'], 'in'),
    outputs: pins(key, qNames(4), 'out'),
    stateNames: qNames(4),
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: [
      asyncRipple
        ? `Async decade/mod: ↑CLK advances; wraps 0…${mod - 1}`
        : `↑CLK: count = (count+1) mod ${mod}`,
    ],
    step({ prevState, inputs, prevClk }) {
      const cur = readQ(prevState, 4) % mod
      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk)) {
        const hold = writeQ(cur, 4)
        return { nextState: hold.state, outputs: hold.outputs }
      }
      const next = (cur + 1) % mod
      const w = writeQ(next, 4)
      return { nextState: w.state, outputs: w.outputs }
    },
  }
}

function make74ls161(): SeqModuleDef {
  const key = '74ls161'
  return {
    key,
    category: 'ttl',
    inputs: pins(
      key,
      ['CLK', 'nCLR', 'nLOAD', 'ENP', 'ENT', 'A', 'B', 'C', 'D'],
      'in',
    ),
    outputs: pins(key, ['QA', 'QB', 'QC', 'QD', 'RCO'], 'out'),
    stateNames: ['QA', 'QB', 'QC', 'QD'],
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: [
      'Async nCLR clears; ↑CLK & nLOAD=0 loads DCBA',
      '↑CLK & ENP=ENT=1: binary +1; RCO=ENT·QD·QC·QB·QA',
    ],
    step({ prevState, inputs, prevClk }) {
      const read = () =>
        (prevState.QA ? 1 : 0) |
        ((prevState.QB ? 1 : 0) << 1) |
        ((prevState.QC ? 1 : 0) << 2) |
        ((prevState.QD ? 1 : 0) << 3)

      const pack = (n: number) => {
        const QA = bit(n & 1)
        const QB = bit((n >> 1) & 1)
        const QC = bit((n >> 2) & 1)
        const QD = bit((n >> 3) & 1)
        const ent = inputs.ENT ?? 0
        const rco = bit(ent === 1 && n === 0xf)
        return {
          nextState: { QA, QB, QC, QD },
          outputs: { QA, QB, QC, QD, RCO: rco },
        }
      }

      if (asyncLow(inputs.nCLR)) return pack(0)

      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk)) return pack(read())

      if (asyncLow(inputs.nLOAD)) {
        const n =
          (inputs.A ? 1 : 0) |
          ((inputs.B ? 1 : 0) << 1) |
          ((inputs.C ? 1 : 0) << 2) |
          ((inputs.D ? 1 : 0) << 3)
        return pack(n)
      }

      if ((inputs.ENP ?? 0) === 1 && (inputs.ENT ?? 0) === 1) {
        return pack((read() + 1) & 0xf)
      }
      return pack(read())
    },
  }
}

function make74ls90(): SeqModuleDef {
  const key = '74ls90'
  // Teaching-simplified: single CLK, decade 0–9 (combine A/B sections).
  return {
    key,
    category: 'ttl',
    inputs: pins(key, ['CLK', 'nR0'], 'in'),
    outputs: pins(key, ['QA', 'QB', 'QC', 'QD'], 'out'),
    stateNames: ['QA', 'QB', 'QC', 'QD'],
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: [
      'Simplified 74LS90: async nR0 clears; ↑CLK decade count 0–9',
    ],
    step({ prevState, inputs, prevClk }) {
      const read = () =>
        (prevState.QA ? 1 : 0) |
        ((prevState.QB ? 1 : 0) << 1) |
        ((prevState.QC ? 1 : 0) << 2) |
        ((prevState.QD ? 1 : 0) << 3)
      const pack = (n: number) => {
        const QA = bit(n & 1)
        const QB = bit((n >> 1) & 1)
        const QC = bit((n >> 2) & 1)
        const QD = bit((n >> 3) & 1)
        return {
          nextState: { QA, QB, QC, QD },
          outputs: { QA, QB, QC, QD },
        }
      }
      if (asyncLow(inputs.nR0)) return pack(0)
      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk)) return pack(read() % 10)
      return pack((read() % 10 + 1) % 10)
    },
  }
}

function make74ls194(): SeqModuleDef {
  const key = '74ls194'
  return {
    key,
    category: 'ttl',
    inputs: pins(
      key,
      ['CLK', 'nCLR', 'S0', 'S1', 'SR', 'SL', 'A', 'B', 'C', 'D'],
      'in',
    ),
    outputs: pins(key, ['QA', 'QB', 'QC', 'QD'], 'out'),
    stateNames: ['QA', 'QB', 'QC', 'QD'],
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: [
      'Async nCLR clears',
      'S1 S0: 00 hold; 01 shift right (SR→QA); 10 shift left (SL→QD); 11 parallel load',
    ],
    step({ prevState, inputs, prevClk }) {
      const pack = (n: number) => {
        const QA = bit(n & 1)
        const QB = bit((n >> 1) & 1)
        const QC = bit((n >> 2) & 1)
        const QD = bit((n >> 3) & 1)
        return {
          nextState: { QA, QB, QC, QD },
          outputs: { QA, QB, QC, QD },
        }
      }
      const read = () =>
        (prevState.QA ? 1 : 0) |
        ((prevState.QB ? 1 : 0) << 1) |
        ((prevState.QC ? 1 : 0) << 2) |
        ((prevState.QD ? 1 : 0) << 3)

      if (asyncLow(inputs.nCLR)) return pack(0)
      const clk = inputs.CLK ?? 0
      if (!rising(prevClk, clk)) return pack(read())

      const s0 = inputs.S0 ?? 0
      const s1 = inputs.S1 ?? 0
      const mode = (s1 << 1) | s0
      const cur = read()
      if (mode === 0) return pack(cur)
      if (mode === 1) {
        // shift right: SR -> QA, QA->QB, ...
        const QA = inputs.SR ?? 0
        const QB = bit(cur & 1)
        const QC = bit((cur >> 1) & 1)
        const QD = bit((cur >> 2) & 1)
        return {
          nextState: { QA, QB, QC, QD },
          outputs: { QA, QB, QC, QD },
        }
      }
      if (mode === 2) {
        // shift left: SL -> QD
        const QA = bit((cur >> 1) & 1)
        const QB = bit((cur >> 2) & 1)
        const QC = bit((cur >> 3) & 1)
        const QD = inputs.SL ?? 0
        return {
          nextState: { QA, QB, QC, QD },
          outputs: { QA, QB, QC, QD },
        }
      }
      // parallel load ABCD -> QA..QD (A=LSB)
      const n =
        (inputs.A ? 1 : 0) |
        ((inputs.B ? 1 : 0) << 1) |
        ((inputs.C ? 1 : 0) << 2) |
        ((inputs.D ? 1 : 0) << 3)
      return pack(n)
    },
  }
}

export const SEQ_MODULES: Record<SeqModuleKey, SeqModuleDef> = {
  reg_4: makeReg4(),
  shift_reg_4_left: makeShift('shift_reg_4_left', 'left'),
  shift_reg_4_right: makeShift('shift_reg_4_right', 'right'),
  counter_bin_sync_4: makeCounterBinSync4(),
  counter_bin_async_4: makeCounterBinAsync4(),
  counter_bin_sync_updown_4: makeCounterUpDown(),
  counter_dec_sync: makeModCounter('counter_dec_sync', 10, false),
  counter_dec_async: makeModCounter('counter_dec_async', 10, true),
  counter_mod6_sync: makeModCounter('counter_mod6_sync', 6, false),
  '74ls161': make74ls161(),
  '74ls90': make74ls90(),
  '74ls194': make74ls194(),
}

export function getSeqModule(key: string): SeqModuleDef | undefined {
  return SEQ_MODULES[key as SeqModuleKey]
}

/** Resolve FF or Seq catalog module for the shared simulator. */
export function resolveSeqOrFfModule(key: string): StatefulModule | undefined {
  return getSeqModule(key) ?? getFfModule(key)
}

export function listSeqModules(): SeqModuleDef[] {
  return SEQ_MODULE_KEYS.map((k) => SEQ_MODULES[k])
}

export function initialSeqState(mod: SeqModuleDef): Record<string, Bit> {
  const state: Record<string, Bit> = {}
  for (const name of mod.stateNames) state[name] = 0
  return state
}

export function isSeqModuleKey(key: string): key is SeqModuleKey {
  return (SEQ_MODULE_KEYS as readonly string[]).includes(key)
}
