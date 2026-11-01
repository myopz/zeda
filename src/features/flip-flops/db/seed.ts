import { createSeedGates } from '@/features/logic-gates/db/seed'
import { createId } from '@/lib/utils'
import { snowflake } from '@/lib/snowflake'
import {
  GATE_LEVEL_FF_KEYS,
  buildFfInternals,
  type GateLevelFfKey,
} from '../lib/internals'
import { FF_MODULE_KEYS, getFfModule, type FfModuleKey } from '../lib/ff-modules'
import {
  DEFAULT_FF_GROUP,
  type CircuitWire,
  type FlipFlopCircuit,
  type FfModuleNode,
  type WireEndpoint,
} from '../types'

/** Bump when seed layout / IO changes so IndexedDB seeds re-apply. */
export const FF_LAYOUT_REV = 8

const FF_IDS: Record<FfModuleKey, string> = {
  rs_basic_nor: snowflake.fixed(201),
  rs_gated: snowflake.fixed(202),
  jk_gated: snowflake.fixed(203),
  jk_edge: snowflake.fixed(204),
  d_edge: snowflake.fixed(205),
  t_edge: snowflake.fixed(206),
  t_bar_edge: snowflake.fixed(207),
  '74ls74': snowflake.fixed(208),
  '74ls112': snowflake.fixed(209),
  '74ls175': snowflake.fixed(210),
}

/** Reserved for future custom-only seeds (74LS now ship as composite builtins). */
export const CUSTOM_SEED_KEYS = new Set<FfModuleKey>([])

export const LEGACY_FF_IDS = [] as const

const DISPLAY_NAMES: Record<FfModuleKey, string> = {
  rs_basic_nor: 'Basic RS Latch (NOR)',
  rs_gated: 'Gated RS Latch',
  jk_gated: 'Gated JK Latch',
  jk_edge: 'Edge JK Flip-Flop',
  d_edge: 'Edge D Flip-Flop',
  t_edge: 'Edge T Flip-Flop',
  t_bar_edge: 'Edge T′ Flip-Flop',
  '74ls74': '74LS74',
  '74ls112': '74LS112',
  '74ls175': '74LS175',
}

const DESCRIPTIONS: Record<FfModuleKey, string> = {
  rs_basic_nor: 'Gate-level cross-coupled NOR; S=R=1 forbidden',
  rs_gated: 'AND gates + reusable basic RS module',
  jk_gated: 'AND tree + reusable basic RS module',
  jk_edge: 'Master–slave: 2× gated JK modules + complementary CLK',
  d_edge: 'Master–slave D: NOT + 2× gated RS modules',
  t_edge: 'XOR + edge D module (D = T⊕Q)',
  t_bar_edge: 'XNOR + edge D module (D = T⊙Q)',
  '74ls74': 'Dual edge D modules (independent clocks / async)',
  '74ls112': 'Dual falling-edge JK via NOT + edge JK',
  '74ls175': 'Quad edge D modules, common CLK / nCLR',
}

function remapEndpoint(
  ep: WireEndpoint,
  pinMap: Map<string, string>,
): WireEndpoint {
  if (ep.nodeId !== 'io') return ep
  const next = pinMap.get(ep.pinId)
  if (!next) throw new Error(`Missing pin remap for ${ep.pinId}`)
  return { nodeId: 'io', pinId: next }
}

function buildGateLevelCircuit(key: GateLevelFfKey): FlipFlopCircuit {
  const gates = createSeedGates()
  const view = buildFfInternals(key, gates)
  if (!view) throw new Error(`No gate-level internals for ${key}`)

  const pinMap = new Map<string, string>()
  const inputs = view.inputs.map((p) => {
    const id = `ff:${key}:in:${p.name}`
    pinMap.set(p.id, id)
    return { id, name: p.name }
  })
  const outputs = view.outputs.map((p) => {
    const id = `ff:${key}:out:${p.name}`
    pinMap.set(p.id, id)
    return { id, name: p.name }
  })

  const wires: CircuitWire[] = view.wires.map((w) => ({
    id: w.id.startsWith(view.id) ? w.id : `ff:${key}:${w.id}`,
    from: remapEndpoint(w.from, pinMap),
    to: remapEndpoint(w.to, pinMap),
  }))

  const mod = getFfModule(key)!
  const now = Date.now()
  return {
    id: FF_IDS[key],
    name: DISPLAY_NAMES[key],
    description: DESCRIPTIONS[key],
    kind: 'builtin',
    builtinKey: key,
    // Pure gate latches only; composites with embedded FF modules omit this.
    behaviorKey: view.behaviorKey,
    group: mod.category,
    inputs,
    outputs,
    nodes: view.nodes,
    wires,
    createdAt: now,
    updatedAt: now,
  }
}

function buildBlackBoxCircuit(key: FfModuleKey): FlipFlopCircuit {
  const mod = getFfModule(key)
  if (!mod) throw new Error(`Missing FF module ${key}`)
  const isCustomSeed = CUSTOM_SEED_KEYS.has(key)

  const inputs = mod.inputs.map((p) => ({
    id: `ff:${key}:in:${p.name}`,
    name: p.name,
  }))
  const outputs = mod.outputs.map((p) => ({
    id: `ff:${key}:out:${p.name}`,
    name: p.name,
  }))

  const node: FfModuleNode = {
    id: `ff:${key}:node`,
    kind: 'ff',
    moduleKey: key,
    position: { x: 280, y: 120 },
  }

  const wires: CircuitWire[] = []
  for (const p of mod.inputs) {
    const io = inputs.find((x) => x.name === p.name)!
    wires.push({
      id: `ff:${key}:w:in:${p.name}`,
      from: { nodeId: 'io', pinId: io.id },
      to: { nodeId: node.id, pinId: p.id },
    })
  }
  for (const p of mod.outputs) {
    const io = outputs.find((x) => x.name === p.name)!
    wires.push({
      id: `ff:${key}:w:out:${p.name}`,
      from: { nodeId: node.id, pinId: p.id },
      to: { nodeId: 'io', pinId: io.id },
    })
  }

  const now = Date.now()
  return {
    id: FF_IDS[key],
    name: DISPLAY_NAMES[key],
    description: DESCRIPTIONS[key],
    kind: isCustomSeed ? 'custom' : 'builtin',
    builtinKey: isCustomSeed ? undefined : key,
    group: mod.category,
    inputs,
    outputs,
    nodes: [node],
    wires,
    createdAt: now,
    updatedAt: now,
  }
}

const GATE_LEVEL_SET = new Set<string>(GATE_LEVEL_FF_KEYS)

function buildModuleCircuit(key: FfModuleKey): FlipFlopCircuit {
  if (GATE_LEVEL_SET.has(key)) {
    return buildGateLevelCircuit(key as GateLevelFfKey)
  }
  return buildBlackBoxCircuit(key)
}

export function createSeedFlipFlops(): FlipFlopCircuit[] {
  return FF_MODULE_KEYS.map((k) => buildModuleCircuit(k))
}

export function catalogKeyFromFfId(id: string): FfModuleKey | undefined {
  for (const key of FF_MODULE_KEYS) {
    if (FF_IDS[key] === id) return key
  }
  return undefined
}

export function createBlankCustomFlipFlop(name: string): FlipFlopCircuit {
  const now = Date.now()
  return {
    id: createId('ff'),
    name,
    description: '',
    kind: 'custom',
    group: DEFAULT_FF_GROUP,
    inputs: [
      { id: createId('pin'), name: 'D' },
      { id: createId('pin'), name: 'CLK' },
    ],
    outputs: [
      { id: createId('pin'), name: 'Q' },
      { id: createId('pin'), name: 'Qn' },
    ],
    nodes: [],
    wires: [],
    createdAt: now,
    updatedAt: now,
  }
}
