import type { ComboCircuit } from '@/features/combo-circuits/types'
import {
  evaluateModule,
  getModule,
} from '@/features/combo-circuits/lib/modules'
import {
  evaluateCircuit,
  NetlistError,
  type CircuitResolver,
  type GateResolver as ComboGateResolver,
} from '@/features/combo-circuits/lib/netlist'
import type { LogicGate } from '@/features/logic-gates/types'
import type { Bit } from '../types'
import { SeqSimError } from './seq-sim'

export type ComboIo = {
  inputs: { id: string; name: string }[]
  outputs: { id: string; name: string }[]
}

export function comboCircuitIo(circuit: ComboCircuit): ComboIo {
  return { inputs: circuit.inputs, outputs: circuit.outputs }
}

export function comboModuleIo(moduleKey: string): ComboIo | null {
  const mod = getModule(moduleKey)
  if (!mod) return null
  return { inputs: mod.inputs, outputs: mod.outputs }
}

export function evalComboCircuitNode(
  circuit: ComboCircuit,
  inputBitsByPinId: Record<string, Bit>,
  resolveGate: ComboGateResolver,
  resolveCircuit: CircuitResolver,
): { outputs: Record<string, Bit>; nodeOutBits: Record<string, Bit> } {
  try {
    const result = evaluateCircuit(
      circuit,
      inputBitsByPinId,
      resolveGate,
      resolveCircuit,
    )
    const nodeOutBits: Record<string, Bit> = {}
    for (const p of circuit.outputs) {
      nodeOutBits[p.id] = result.outputs[p.id] ?? 0
    }
    return { outputs: result.outputs, nodeOutBits }
  } catch (err) {
    const msg =
      err instanceof NetlistError || err instanceof Error
        ? err.message
        : String(err)
    throw new SeqSimError(`Combo circuit "${circuit.name}": ${msg}`)
  }
}

export function evalComboModuleNode(
  moduleKey: string,
  inputBitsByPinId: Record<string, Bit>,
): { outputs: Record<string, Bit>; nodeOutBits: Record<string, Bit> } {
  const mod = getModule(moduleKey)
  if (!mod) throw new SeqSimError(`Unknown combo module "${moduleKey}"`)
  try {
    const outputs = evaluateModule(mod, inputBitsByPinId)
    return { outputs, nodeOutBits: { ...outputs } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new SeqSimError(`Combo module "${moduleKey}": ${msg}`)
  }
}

export function makeComboGateResolver(
  gateMap: Map<string, LogicGate>,
): ComboGateResolver {
  return (node) => {
    if (node.ref.builtinKey) {
      for (const g of gateMap.values()) {
        if (g.builtinKey === node.ref.builtinKey) return g
      }
    }
    if (node.ref.gateId) return gateMap.get(node.ref.gateId)
    return undefined
  }
}
