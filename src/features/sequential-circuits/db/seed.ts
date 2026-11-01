import { createSeedGates } from '@/features/logic-gates/db/seed'
import { createId } from '@/lib/utils'
import { snowflake } from '@/lib/snowflake'
import { inferPinDrive } from '../lib/pin-drive'
import { buildSeqInternals } from '../lib/internals'
import {
  SEQ_MODULE_KEYS,
  getSeqModule,
  type SeqModuleKey,
} from '../lib/seq-modules'
import {
  DEFAULT_SEQ_GROUP,
  type CircuitWire,
  type SequentialCircuit,
  type WireEndpoint,
} from '../types'

/** Bump when seed layout / IO changes so IndexedDB seeds re-apply. */
export const SEQ_LAYOUT_REV = 2

const SEQ_IDS: Record<SeqModuleKey, string> = {
  reg_4: snowflake.fixed(301),
  shift_reg_4_left: snowflake.fixed(302),
  shift_reg_4_right: snowflake.fixed(303),
  counter_bin_sync_4: snowflake.fixed(304),
  counter_bin_async_4: snowflake.fixed(305),
  counter_bin_sync_updown_4: snowflake.fixed(306),
  counter_dec_sync: snowflake.fixed(307),
  counter_dec_async: snowflake.fixed(308),
  counter_mod6_sync: snowflake.fixed(309),
  '74ls161': snowflake.fixed(310),
  '74ls90': snowflake.fixed(311),
  '74ls194': snowflake.fixed(312),
}

export const LEGACY_SEQ_IDS = [] as const

const DISPLAY_NAMES: Record<SeqModuleKey, string> = {
  reg_4: '4-bit Register',
  shift_reg_4_left: '4-bit Shift Register (Left)',
  shift_reg_4_right: '4-bit Shift Register (Right)',
  counter_bin_sync_4: '4-bit Sync Binary Counter',
  counter_bin_async_4: '4-bit Async Binary Counter',
  counter_bin_sync_updown_4: '4-bit Sync Up/Down Counter',
  counter_dec_sync: 'Sync Decade Counter',
  counter_dec_async: 'Async Decade Counter',
  counter_mod6_sync: 'Sync Mod-6 Counter',
  '74ls161': '74LS161',
  '74ls90': '74LS90',
  '74ls194': '74LS194',
}

const DESCRIPTIONS: Record<SeqModuleKey, string> = {
  reg_4: '4-bit parallel register with load / clear (4× edge D + mux)',
  shift_reg_4_left: 'Serial-in left shift, parallel out',
  shift_reg_4_right: 'Serial-in right shift, parallel out',
  counter_bin_sync_4: 'Synchronous binary up counter',
  counter_bin_async_4: 'Ripple (async) binary up counter',
  counter_bin_sync_updown_4: 'Synchronous binary up/down',
  counter_dec_sync: 'Synchronous decade 0–9',
  counter_dec_async: 'Asynchronous decade 0–9',
  counter_mod6_sync: 'Synchronous modulo-6 (N-ary example)',
  '74ls161': 'Sync 4-bit binary counter with load / RCO',
  '74ls90': 'Decade counter (teaching-simplified)',
  '74ls194': '4-bit bidirectional universal shift register',
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

/**
 * Seed = hierarchical internals (gates + FF modules), same pattern as flip-flops.
 * Top-level canvas shows the composed circuit (not a single black-box seq node).
 * Builtin remains read-only;「复制为自定义」后可改拓扑。
 */
function buildHierarchicalCircuit(key: SeqModuleKey): SequentialCircuit {
  const gates = createSeedGates()
  const view = buildSeqInternals(key, gates)
  if (!view) throw new Error(`No hierarchical internals for ${key}`)

  const mod = getSeqModule(key)!
  const pinMap = new Map<string, string>()
  const inputs = view.inputs.map((p) => {
    const id = `seq:${key}:in:${p.name}`
    pinMap.set(p.id, id)
    return { id, name: p.name, drive: inferPinDrive(p.name) }
  })
  const outputs = view.outputs.map((p) => {
    const id = `seq:${key}:out:${p.name}`
    pinMap.set(p.id, id)
    return { id, name: p.name }
  })

  const wires: CircuitWire[] = view.wires.map((w) => ({
    id: w.id.startsWith(view.id) ? w.id : `seq:${key}:${w.id}`,
    from: remapEndpoint(w.from, pinMap),
    to: remapEndpoint(w.to, pinMap),
  }))

  const now = Date.now()
  return {
    id: SEQ_IDS[key],
    name: DISPLAY_NAMES[key],
    description: DESCRIPTIONS[key],
    kind: 'builtin',
    builtinKey: key,
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

export function createSeedSequentials(): SequentialCircuit[] {
  return SEQ_MODULE_KEYS.map((k) => buildHierarchicalCircuit(k))
}

export function catalogKeyFromSeqId(id: string): SeqModuleKey | undefined {
  for (const key of SEQ_MODULE_KEYS) {
    if (SEQ_IDS[key] === id) return key
  }
  return undefined
}

export function createBlankCustomSequential(name: string): SequentialCircuit {
  const now = Date.now()
  return {
    id: createId('seq'),
    name,
    description: '',
    kind: 'custom',
    group: DEFAULT_SEQ_GROUP,
    inputs: [
      { id: createId('pin'), name: 'EN', drive: 'signal' },
      { id: createId('pin'), name: 'CLK', drive: 'clk' },
    ],
    outputs: [
      { id: createId('pin'), name: 'Q0' },
      { id: createId('pin'), name: 'Q1' },
    ],
    nodes: [],
    wires: [],
    createdAt: now,
    updatedAt: now,
  }
}
