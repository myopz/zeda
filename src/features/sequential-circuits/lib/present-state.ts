import type { Bit, SequentialCircuit, WireEndpoint } from '../types'
import type { FfSimState } from '@/features/flip-flops/lib/seq-sim'
import { resolveSeqOrFfModule } from './seq-modules'

function wireToOutput(
  circuit: SequentialCircuit,
  outputPinId: string,
): WireEndpoint | undefined {
  for (const w of circuit.wires) {
    if (w.to.nodeId === 'io' && w.to.pinId === outputPinId) return w.from
    if (w.from.nodeId === 'io' && w.from.pinId === outputPinId) return w.to
  }
  return undefined
}

type PresentTarget = {
  nodeId: string
  stateName: string
  stateNames: string[]
}

function resolvePresentTarget(
  circuit: SequentialCircuit,
  outputPinId: string,
): PresentTarget | null {
  const driver = wireToOutput(circuit, outputPinId)
  if (!driver || driver.nodeId === 'io') return null

  const node = circuit.nodes.find((n) => n.id === driver.nodeId)
  if (!node || (node.kind !== 'ff' && node.kind !== 'seq')) return null

  const mod = resolveSeqOrFfModule(node.moduleKey)
  if (!mod) return null

  const outPin = mod.outputs.find((p) => p.id === driver.pinId)
  if (!outPin) return null

  const name = outPin.name
  let stateName: string | null = null
  if (name === 'Qn' || (name.endsWith('n') && name.length > 1 && name !== 'n')) {
    const base = name === 'Qn' ? 'Q' : name.slice(0, -1)
    if (mod.stateNames.includes(base)) stateName = base
  } else if (mod.stateNames.includes(name)) {
    stateName = name
  }
  if (!stateName) return null

  return {
    nodeId: node.id,
    stateName,
    stateNames: mod.stateNames,
  }
}

/** Outputs whose value can seed / toggle present-state (现态). */
export function listPresentStateOutputs(
  circuit: SequentialCircuit,
): SequentialCircuit['outputs'] {
  return circuit.outputs.filter((p) => resolvePresentTarget(circuit, p.id))
}

/**
 * Set the present-state bit that drives an output pin.
 * Returns null when the output is not driven by a stateful module pin.
 */
export function setPresentStateOnOutput(
  circuit: SequentialCircuit,
  sim: FfSimState,
  outputPinId: string,
  bit: Bit,
): FfSimState | null {
  const target = resolvePresentTarget(circuit, outputPinId)
  if (!target) return null

  const prev =
    sim.ffState[target.nodeId] ??
    Object.fromEntries(target.stateNames.map((n) => [n, 0 as Bit]))

  return {
    ...sim,
    ffState: {
      ...sim.ffState,
      [target.nodeId]: {
        ...prev,
        [target.stateName]: bit,
      },
    },
  }
}

/**
 * Apply a map of output-pin-id → present-state bit onto sim.
 * Uncontrollable pins are ignored.
 */
export function applyPresentStateBits(
  circuit: SequentialCircuit,
  sim: FfSimState,
  bits: Record<string, Bit>,
): FfSimState {
  let next = sim
  for (const [pinId, bit] of Object.entries(bits)) {
    const applied = setPresentStateOnOutput(circuit, next, pinId, bit)
    if (applied) next = applied
  }
  return next
}

/**
 * Flip the present-state bit that drives an output pin (0↔1).
 * Returns null when the output is not driven by a stateful module pin.
 */
export function togglePresentStateOnOutput(
  circuit: SequentialCircuit,
  sim: FfSimState,
  outputPinId: string,
): FfSimState | null {
  const target = resolvePresentTarget(circuit, outputPinId)
  if (!target) return null
  const prev =
    sim.ffState[target.nodeId] ??
    Object.fromEntries(target.stateNames.map((n) => [n, 0 as Bit]))
  const cur = prev[target.stateName] ?? 0
  return setPresentStateOnOutput(
    circuit,
    sim,
    outputPinId,
    cur === 1 ? 0 : 1,
  )
}
