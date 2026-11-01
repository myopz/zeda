import type { Bit, FlipFlopCircuit, WireEndpoint } from '../types'
import { getFfModule } from './ff-modules'
import { BEHAVIOR_NODE_ID, type FfSimState } from './seq-sim'

function wireToOutput(
  circuit: FlipFlopCircuit,
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

function stateNameFromPin(
  pinName: string,
  stateNames: string[],
): string | null {
  if (
    pinName === 'Qn' ||
    (pinName.endsWith('n') && pinName.length > 1 && pinName !== 'n')
  ) {
    const base = pinName === 'Qn' ? 'Q' : pinName.slice(0, -1)
    if (stateNames.includes(base)) return base
  }
  if (stateNames.includes(pinName)) return pinName
  return null
}

function resolvePresentTarget(
  circuit: FlipFlopCircuit,
  outputPinId: string,
): PresentTarget | null {
  const driver = wireToOutput(circuit, outputPinId)
  if (driver && driver.nodeId !== 'io') {
    const node = circuit.nodes.find((n) => n.id === driver.nodeId)
    if (node?.kind === 'ff') {
      const mod = getFfModule(node.moduleKey)
      if (mod) {
        const outPin = mod.outputs.find((p) => p.id === driver.pinId)
        if (outPin) {
          const stateName = stateNameFromPin(outPin.name, mod.stateNames)
          if (stateName) {
            return {
              nodeId: node.id,
              stateName,
              stateNames: mod.stateNames,
            }
          }
        }
      }
    }
  }

  // Gate-level seeds with behaviorKey (no FF nodes): map IO name → behavior state.
  const hasFf = circuit.nodes.some((n) => n.kind === 'ff')
  if (hasFf) return null
  const behaviorKey = circuit.behaviorKey ?? circuit.builtinKey
  if (!behaviorKey) return null
  const mod = getFfModule(behaviorKey)
  if (!mod) return null
  const out = circuit.outputs.find((p) => p.id === outputPinId)
  if (!out) return null
  const stateName = stateNameFromPin(out.name, mod.stateNames)
  if (!stateName) return null
  return {
    nodeId: BEHAVIOR_NODE_ID,
    stateName,
    stateNames: mod.stateNames,
  }
}

/** Outputs whose value can seed / toggle present-state (现态). */
export function listPresentStateOutputs(
  circuit: FlipFlopCircuit,
): FlipFlopCircuit['outputs'] {
  return circuit.outputs.filter((p) => resolvePresentTarget(circuit, p.id))
}

export function setPresentStateOnOutput(
  circuit: FlipFlopCircuit,
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

export function applyPresentStateBits(
  circuit: FlipFlopCircuit,
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

export function togglePresentStateOnOutput(
  circuit: FlipFlopCircuit,
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
