import { createSeedGates } from '@/features/logic-gates/db/seed'
import { createId } from '@/lib/utils'
import { snowflake } from '@/lib/snowflake'
import { buildModuleInternals } from '../lib/internals'
import { MODULE_KEYS, type ModuleKey } from '../lib/modules'
import type { ComboCircuit, CircuitWire, WireEndpoint } from '../types'

/** Bump when gate-level layout spacing changes so IndexedDB seeds re-apply. */
export const CIRCUIT_LAYOUT_REV = 5

const CIRCUIT_IDS: Record<ModuleKey, string> = {
  half_adder: snowflake.fixed(101),
  full_adder: snowflake.fixed(102),
  encoder_4_2: snowflake.fixed(103),
  priority_encoder_8_3: snowflake.fixed(104),
  decoder_2_4: snowflake.fixed(105),
  decoder_3_8: snowflake.fixed(106),
  seven_seg_decoder: snowflake.fixed(107),
  '74ls138': snowflake.fixed(108),
  '74ls148': snowflake.fixed(109),
  '74ls283': snowflake.fixed(110),
}

/** 74LS examples are seeded as custom (editable / deletable), not builtin. */
export const CUSTOM_SEED_KEYS = new Set<ModuleKey>(['74ls138', '74ls148', '74ls283'])

export const LEGACY_CIRCUIT_IDS = [
  'builtin_half_adder',
  'builtin_full_adder',
] as const

const DISPLAY_NAMES: Record<ModuleKey, string> = {
  half_adder: 'Half Adder',
  full_adder: 'Full Adder',
  encoder_4_2: '4→2 Binary Encoder',
  priority_encoder_8_3: '8→3 Priority Encoder',
  decoder_2_4: '2→4 Binary Decoder',
  decoder_3_8: '3→8 Binary Decoder',
  seven_seg_decoder: 'Seven-Segment Decoder (CC)',
  '74ls138': '74LS138',
  '74ls148': '74LS148',
  '74ls283': '74LS283',
}

const DESCRIPTIONS: Record<ModuleKey, string> = {
  half_adder: 'Gate-level: XOR + AND',
  full_adder: 'Gate-level: 2×XOR + 2×AND + OR',
  encoder_4_2: 'Gate-level OR-tree encoder',
  priority_encoder_8_3: 'Gate-level priority one-hot encoder',
  decoder_2_4: 'Gate-level NOT + AND decoder',
  decoder_3_8: 'Gate-level 3–8 AND decoder',
  seven_seg_decoder: 'Gate-level hex SOP → a–g (common cathode)',
  '74ls138': 'Gate-level enable + decode, active-low Y',
  '74ls148': 'Gate-level active-low priority encoder',
  '74ls283': '4× full adder (drill into gates)',
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

function buildModuleCircuit(key: ModuleKey): ComboCircuit {
  const gates = createSeedGates()
  const view = buildModuleInternals(key, gates)
  if (!view) {
    throw new Error(`No gate-level internals for ${key}`)
  }

  const isCustomSeed = CUSTOM_SEED_KEYS.has(key)
  const pinMap = new Map<string, string>()
  const inputs = view.inputs.map((p) => {
    const id = `ckt:${key}:in:${p.name}`
    pinMap.set(p.id, id)
    return { id, name: p.name }
  })
  const outputs = view.outputs.map((p) => {
    const id = `ckt:${key}:out:${p.name}`
    pinMap.set(p.id, id)
    return { id, name: p.name }
  })

  const wires: CircuitWire[] = view.wires.map((w) => ({
    id: w.id.startsWith('view:') ? w.id : `ckt:${key}:${w.id}`,
    from: remapEndpoint(w.from, pinMap),
    to: remapEndpoint(w.to, pinMap),
  }))

  const now = Date.now()
  return {
    id: CIRCUIT_IDS[key],
    name: DISPLAY_NAMES[key],
    description: DESCRIPTIONS[key],
    kind: isCustomSeed ? 'custom' : 'builtin',
    builtinKey: isCustomSeed ? undefined : key,
    inputs,
    outputs,
    nodes: view.nodes,
    wires,
    createdAt: now,
    updatedAt: now,
  }
}

export function createSeedCircuits(): ComboCircuit[] {
  return MODULE_KEYS.map((k) => buildModuleCircuit(k))
}

/** Ids of catalog seeds (builtin + 74LS examples). */
export function catalogSeedIds(): string[] {
  return MODULE_KEYS.map((k) => CIRCUIT_IDS[k])
}

export function customSeedIds(): string[] {
  return [...CUSTOM_SEED_KEYS].map((k) => CIRCUIT_IDS[k])
}

/** Resolve catalog module key from a seeded circuit id (for i18n labels). */
export function catalogKeyFromCircuitId(id: string): ModuleKey | undefined {
  for (const key of MODULE_KEYS) {
    if (CIRCUIT_IDS[key] === id) return key
  }
  return undefined
}

export function createBlankCustomCircuit(name: string): ComboCircuit {
  const now = Date.now()
  return {
    id: createId('ckt'),
    name,
    description: '',
    kind: 'custom',
    inputs: [
      { id: createId('pin'), name: 'A' },
      { id: createId('pin'), name: 'B' },
    ],
    outputs: [{ id: createId('pin'), name: 'Y' }],
    nodes: [],
    wires: [],
    createdAt: now,
    updatedAt: now,
  }
}
