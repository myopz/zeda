import type { Bit } from '../types'

export type FfCategory = 'latch' | 'edge' | 'ttl'

export type ModulePin = {
  id: string
  name: string
}

export type ClockMode = 'none' | 'level' | 'posedge' | 'negedge'

export type FfStepArgs = {
  /** Persistent Q state keyed by logical state name (e.g. Q, 1Q). */
  prevState: Record<string, Bit>
  /** Input bits keyed by pin name. */
  inputs: Record<string, Bit>
  /** Previous sample of the clock/enable pin (for edge detect). */
  prevClk: Bit
}

export type FfStepResult = {
  nextState: Record<string, Bit>
  outputs: Record<string, Bit>
  warnings?: string[]
}

export type FfModuleDef = {
  key: string
  category: FfCategory
  inputs: ModulePin[]
  outputs: ModulePin[]
  /** Names of persistent state bits (usually Q / 1Q / …). */
  stateNames: string[]
  clockMode: ClockMode
  /** Pin name used for clock/enable; undefined when clockMode is none. */
  clockPin?: string
  /** Characteristic equation(s) for UI (read-only). */
  equations: string[]
  step: (args: FfStepArgs) => FfStepResult
}

export const FF_MODULE_KEYS = [
  'rs_basic_nor',
  'rs_gated',
  'jk_gated',
  'jk_edge',
  'd_edge',
  't_edge',
  't_bar_edge',
  '74ls74',
  '74ls112',
  '74ls175',
] as const

export type FfModuleKey = (typeof FF_MODULE_KEYS)[number]

function pin(moduleKey: string, name: string, role: 'in' | 'out'): ModulePin {
  return { id: `${moduleKey}:${role}:${name}`, name }
}

function pins(moduleKey: string, names: string[], role: 'in' | 'out'): ModulePin[] {
  return names.map((n) => pin(moduleKey, n, role))
}

function bit(v: boolean | number): Bit {
  return v ? 1 : 0
}

function inv(q: Bit): Bit {
  return q === 1 ? 0 : 1
}

function rising(prev: Bit, curr: Bit): boolean {
  return prev === 0 && curr === 1
}

function falling(prev: Bit, curr: Bit): boolean {
  return prev === 1 && curr === 0
}

function edgeHit(mode: ClockMode, prev: Bit, curr: Bit): boolean {
  if (mode === 'posedge') return rising(prev, curr)
  if (mode === 'negedge') return falling(prev, curr)
  return false
}

function qPair(q: Bit): { Q: Bit; Qn: Bit } {
  return { Q: q, Qn: inv(q) }
}

/** Active-low async: asserted when pin === 0. */
function asyncLow(v: Bit | undefined): boolean {
  return v === 0
}

function rsNext(s: Bit, r: Bit, q: Bit): { q: Bit; warn?: string } {
  if (s === 1 && r === 1) return { q: 0, warn: 'RS forbidden: S=R=1' }
  if (s === 1) return { q: 1 }
  if (r === 1) return { q: 0 }
  return { q }
}

function jkNext(j: Bit, k: Bit, q: Bit): Bit {
  if (j === 0 && k === 0) return q
  if (j === 0 && k === 1) return 0
  if (j === 1 && k === 0) return 1
  return inv(q)
}

function makeRsBasicNor(): FfModuleDef {
  const key = 'rs_basic_nor'
  return {
    key,
    category: 'latch',
    inputs: pins(key, ['S', 'R'], 'in'),
    outputs: pins(key, ['Q', 'Qn'], 'out'),
    stateNames: ['Q'],
    clockMode: 'none',
    equations: ['Q* = S + R\'·Q  (forbidden when S=R=1)'],
    step({ prevState, inputs }) {
      const s = inputs.S ?? 0
      const r = inputs.R ?? 0
      const { q, warn } = rsNext(s, r, prevState.Q ?? 0)
      return {
        nextState: { Q: q },
        outputs: qPair(q),
        warnings: warn ? [warn] : undefined,
      }
    },
  }
}

function makeRsGated(): FfModuleDef {
  const key = 'rs_gated'
  return {
    key,
    category: 'latch',
    inputs: pins(key, ['S', 'R', 'EN'], 'in'),
    outputs: pins(key, ['Q', 'Qn'], 'out'),
    stateNames: ['Q'],
    clockMode: 'level',
    clockPin: 'EN',
    equations: ['EN=1: Q* = S + R\'·Q; EN=0: hold'],
    step({ prevState, inputs }) {
      const q0 = prevState.Q ?? 0
      if ((inputs.EN ?? 0) === 0) {
        return { nextState: { Q: q0 }, outputs: qPair(q0) }
      }
      const { q, warn } = rsNext(inputs.S ?? 0, inputs.R ?? 0, q0)
      return {
        nextState: { Q: q },
        outputs: qPair(q),
        warnings: warn ? [warn] : undefined,
      }
    },
  }
}

function makeJkGated(): FfModuleDef {
  const key = 'jk_gated'
  return {
    key,
    category: 'latch',
    inputs: pins(key, ['J', 'K', 'CLK'], 'in'),
    outputs: pins(key, ['Q', 'Qn'], 'out'),
    stateNames: ['Q'],
    clockMode: 'level',
    clockPin: 'CLK',
    equations: ['CLK=1: Q* = J·Q\' + K\'·Q; CLK=0: hold'],
    step({ prevState, inputs }) {
      const q0 = prevState.Q ?? 0
      if ((inputs.CLK ?? 0) === 0) {
        return { nextState: { Q: q0 }, outputs: qPair(q0) }
      }
      const q = jkNext(inputs.J ?? 0, inputs.K ?? 0, q0)
      return { nextState: { Q: q }, outputs: qPair(q) }
    },
  }
}

function makeJkEdge(): FfModuleDef {
  const key = 'jk_edge'
  return {
    key,
    category: 'edge',
    inputs: pins(key, ['J', 'K', 'CLK', 'nPRE', 'nCLR'], 'in'),
    outputs: pins(key, ['Q', 'Qn'], 'out'),
    stateNames: ['Q'],
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: [
      'Async nPRE/nCLR (active-low) override clock',
      '↑CLK: Q* = J·Q\' + K\'·Q',
    ],
    step({ prevState, inputs, prevClk }) {
      const q0 = prevState.Q ?? 0
      // Prefer clear if both asserted (simplified datasheet note in UI).
      if (asyncLow(inputs.nCLR)) {
        return { nextState: { Q: 0 }, outputs: qPair(0) }
      }
      if (asyncLow(inputs.nPRE)) {
        return { nextState: { Q: 1 }, outputs: qPair(1) }
      }
      const clk = inputs.CLK ?? 0
      if (!edgeHit('posedge', prevClk, clk)) {
        return { nextState: { Q: q0 }, outputs: qPair(q0) }
      }
      const q = jkNext(inputs.J ?? 0, inputs.K ?? 0, q0)
      return { nextState: { Q: q }, outputs: qPair(q) }
    },
  }
}

function makeDEdge(): FfModuleDef {
  const key = 'd_edge'
  return {
    key,
    category: 'edge',
    inputs: pins(key, ['D', 'CLK', 'nPRE', 'nCLR'], 'in'),
    outputs: pins(key, ['Q', 'Qn'], 'out'),
    stateNames: ['Q'],
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: ['Async nPRE/nCLR (active-low) override', '↑CLK: Q* = D'],
    step({ prevState, inputs, prevClk }) {
      const q0 = prevState.Q ?? 0
      if (asyncLow(inputs.nCLR)) {
        return { nextState: { Q: 0 }, outputs: qPair(0) }
      }
      if (asyncLow(inputs.nPRE)) {
        return { nextState: { Q: 1 }, outputs: qPair(1) }
      }
      const clk = inputs.CLK ?? 0
      if (!edgeHit('posedge', prevClk, clk)) {
        return { nextState: { Q: q0 }, outputs: qPair(q0) }
      }
      const q = inputs.D ?? 0
      return { nextState: { Q: q }, outputs: qPair(q) }
    },
  }
}

function makeTEdge(): FfModuleDef {
  const key = 't_edge'
  return {
    key,
    category: 'edge',
    inputs: pins(key, ['T', 'CLK'], 'in'),
    outputs: pins(key, ['Q', 'Qn'], 'out'),
    stateNames: ['Q'],
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: ['↑CLK: Q* = T ⊕ Q'],
    step({ prevState, inputs, prevClk }) {
      const q0 = prevState.Q ?? 0
      const clk = inputs.CLK ?? 0
      if (!edgeHit('posedge', prevClk, clk)) {
        return { nextState: { Q: q0 }, outputs: qPair(q0) }
      }
      const t = inputs.T ?? 0
      const q = bit((t === 1) !== (q0 === 1))
      return { nextState: { Q: q }, outputs: qPair(q) }
    },
  }
}

function makeTBarEdge(): FfModuleDef {
  const key = 't_bar_edge'
  return {
    key,
    category: 'edge',
    inputs: pins(key, ['T', 'CLK'], 'in'),
    outputs: pins(key, ['Q', 'Qn'], 'out'),
    stateNames: ['Q'],
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: ['↑CLK: Q* = ¬(T ⊕ Q)  (T=0 toggle, T=1 hold)'],
    step({ prevState, inputs, prevClk }) {
      const q0 = prevState.Q ?? 0
      const clk = inputs.CLK ?? 0
      if (!edgeHit('posedge', prevClk, clk)) {
        return { nextState: { Q: q0 }, outputs: qPair(q0) }
      }
      const t = inputs.T ?? 0
      // Q* = NOT (T XOR Q) = T XNOR Q (toggle when T=0)
      const q = bit((t === 1) === (q0 === 1))
      return { nextState: { Q: q }, outputs: qPair(q) }
    },
  }
}

function make74ls74(): FfModuleDef {
  const key = '74ls74'
  const inNames = [
    '1D',
    '1CLK',
    '1nPRE',
    '1nCLR',
    '2D',
    '2CLK',
    '2nPRE',
    '2nCLR',
  ]
  const outNames = ['1Q', '1Qn', '2Q', '2Qn']
  return {
    key,
    category: 'ttl',
    inputs: pins(key, inNames, 'in'),
    outputs: pins(key, outNames, 'out'),
    stateNames: ['1Q', '2Q'],
    clockMode: 'posedge',
    clockPin: '1CLK',
    equations: [
      'Dual D FF; async nPRE/nCLR active-low',
      '↑nCLK: nQ* = nD (per half)',
    ],
    step({ prevState, inputs, prevClk }) {
      // prevClk tracks 1CLK; also track 2CLK via encoding in unused — use inputs only with edge vs stored.
      // For dual clocks we store previous clocks in state under __1CLK/__2CLK is awkward.
      // Caller passes prevClk for primary; we also accept prevState.__clk2.
      const clk2Prev = (prevState.__clk2 as Bit | undefined) ?? 0
      const half = (
        prefix: '1' | '2',
        qKey: '1Q' | '2Q',
        clkPrev: Bit,
      ): { q: Bit } => {
        const d = inputs[`${prefix}D`] ?? 0
        const clk = inputs[`${prefix}CLK`] ?? 0
        const nClr = inputs[`${prefix}nCLR`]
        const nPre = inputs[`${prefix}nPRE`]
        const q0 = prevState[qKey] ?? 0
        if (asyncLow(nClr)) return { q: 0 }
        if (asyncLow(nPre)) return { q: 1 }
        if (!edgeHit('posedge', clkPrev, clk)) return { q: q0 }
        return { q: d }
      }
      const h1 = half('1', '1Q', prevClk)
      const h2 = half('2', '2Q', clk2Prev)
      return {
        nextState: {
          '1Q': h1.q,
          '2Q': h2.q,
          __clk2: inputs['2CLK'] ?? 0,
        },
        outputs: {
          '1Q': h1.q,
          '1Qn': inv(h1.q),
          '2Q': h2.q,
          '2Qn': inv(h2.q),
        },
      }
    },
  }
}

function make74ls112(): FfModuleDef {
  const key = '74ls112'
  // Negative-edge JK dual; we mark clockMode negedge and use 1CLK as primary.
  const inNames = [
    '1J',
    '1K',
    '1CLK',
    '1nPRE',
    '1nCLR',
    '2J',
    '2K',
    '2CLK',
    '2nPRE',
    '2nCLR',
  ]
  return {
    key,
    category: 'ttl',
    inputs: pins(key, inNames, 'in'),
    outputs: pins(key, ['1Q', '1Qn', '2Q', '2Qn'], 'out'),
    stateNames: ['1Q', '2Q'],
    clockMode: 'negedge',
    clockPin: '1CLK',
    equations: [
      'Dual JK; falling-edge clock; async nPRE/nCLR active-low',
      '↓nCLK: nQ* = nJ·nQ\' + nK\'·nQ',
    ],
    step({ prevState, inputs, prevClk }) {
      const clk2Prev = (prevState.__clk2 as Bit | undefined) ?? 0
      const half = (
        prefix: '1' | '2',
        qKey: '1Q' | '2Q',
        clkPrev: Bit,
      ): { q: Bit } => {
        const j = inputs[`${prefix}J`] ?? 0
        const k = inputs[`${prefix}K`] ?? 0
        const clk = inputs[`${prefix}CLK`] ?? 0
        const nClr = inputs[`${prefix}nCLR`]
        const nPre = inputs[`${prefix}nPRE`]
        const q0 = prevState[qKey] ?? 0
        if (asyncLow(nClr)) return { q: 0 }
        if (asyncLow(nPre)) return { q: 1 }
        if (!edgeHit('negedge', clkPrev, clk)) return { q: q0 }
        return { q: jkNext(j, k, q0) }
      }
      const h1 = half('1', '1Q', prevClk)
      const h2 = half('2', '2Q', clk2Prev)
      return {
        nextState: {
          '1Q': h1.q,
          '2Q': h2.q,
          __clk2: inputs['2CLK'] ?? 0,
        },
        outputs: {
          '1Q': h1.q,
          '1Qn': inv(h1.q),
          '2Q': h2.q,
          '2Qn': inv(h2.q),
        },
      }
    },
  }
}

function make74ls175(): FfModuleDef {
  const key = '74ls175'
  const inNames = ['D0', 'D1', 'D2', 'D3', 'CLK', 'nCLR']
  const outNames = ['Q0', 'Q0n', 'Q1', 'Q1n', 'Q2', 'Q2n', 'Q3', 'Q3n']
  return {
    key,
    category: 'ttl',
    inputs: pins(key, inNames, 'in'),
    outputs: pins(key, outNames, 'out'),
    stateNames: ['Q0', 'Q1', 'Q2', 'Q3'],
    clockMode: 'posedge',
    clockPin: 'CLK',
    equations: ['Common ↑CLK; common nCLR active-low', 'Qi* = Di'],
    step({ prevState, inputs, prevClk }) {
      if (asyncLow(inputs.nCLR)) {
        const z: Record<string, Bit> = { Q0: 0, Q1: 0, Q2: 0, Q3: 0 }
        return {
          nextState: z,
          outputs: {
            Q0: 0,
            Q0n: 1,
            Q1: 0,
            Q1n: 1,
            Q2: 0,
            Q2n: 1,
            Q3: 0,
            Q3n: 1,
          },
        }
      }
      const clk = inputs.CLK ?? 0
      const hold = !edgeHit('posedge', prevClk, clk)
      const next: Record<string, Bit> = {}
      const outs: Record<string, Bit> = {}
      for (let i = 0; i < 4; i += 1) {
        const qKey = `Q${i}`
        const q = hold ? (prevState[qKey] ?? 0) : (inputs[`D${i}`] ?? 0)
        next[qKey] = q
        outs[qKey] = q
        outs[`Q${i}n`] = inv(q)
      }
      return { nextState: next, outputs: outs }
    },
  }
}

export const FF_MODULES: Record<FfModuleKey, FfModuleDef> = {
  rs_basic_nor: makeRsBasicNor(),
  rs_gated: makeRsGated(),
  jk_gated: makeJkGated(),
  jk_edge: makeJkEdge(),
  d_edge: makeDEdge(),
  t_edge: makeTEdge(),
  t_bar_edge: makeTBarEdge(),
  '74ls74': make74ls74(),
  '74ls112': make74ls112(),
  '74ls175': make74ls175(),
}

export function getFfModule(key: string): FfModuleDef | undefined {
  return FF_MODULES[key as FfModuleKey]
}

export function listFfModules(): FfModuleDef[] {
  return FF_MODULE_KEYS.map((k) => FF_MODULES[k])
}

export function initialFfState(mod: FfModuleDef): Record<string, Bit> {
  const state: Record<string, Bit> = {}
  for (const name of mod.stateNames) state[name] = 0
  return state
}
