import type { Bit } from '../types'
import { getFfModule, initialFfState, type FfModuleDef } from './ff-modules'

export type StateNode = {
  id: string
  label: string
  q: Bit
}

export type StateEdge = {
  id: string
  from: string
  to: string
  /** Excitation label, e.g. "J=1,K=0" */
  label: string
}

export type StateDiagram = {
  nodes: StateNode[]
  edges: StateEdge[]
  equations: string[]
}

function excitationInputs(mod: FfModuleDef): string[] {
  if (mod.key === '74ls74') return ['1D']
  if (mod.key === '74ls112') return ['1J', '1K']
  if (mod.key === '74ls175') return ['D0']
  return mod.inputs
    .map((p) => p.name)
    .filter(
      (n) =>
        n !== mod.clockPin &&
        !n.includes('nPRE') &&
        !n.includes('nCLR') &&
        n !== 'EN',
    )
}

/**
 * Build a 2-state diagram (Q=0 / Q=1) for the primary bit of a module.
 * Edges labeled by excitation inputs that cause the transition (on an ideal clock edge / level).
 */
export function buildStateDiagram(moduleKey: string): StateDiagram | null {
  const mod = getFfModule(moduleKey)
  if (!mod) return null

  const qName = mod.stateNames[0] ?? 'Q'
  const nodes: StateNode[] = [
    { id: 'q0', label: 'Q=0', q: 0 },
    { id: 'q1', label: 'Q=1', q: 1 },
  ]

  const excNames = excitationInputs(mod)
  const width = Math.min(excNames.length, 4)
  const combos = 1 << width
  const edgeMap = new Map<string, Set<string>>()

  for (const q of [0, 1] as Bit[]) {
    for (let i = 0; i < combos; i += 1) {
      const inputs: Record<string, Bit> = {}
      for (let b = 0; b < width; b += 1) {
        inputs[excNames[b]!] = ((i >> (width - 1 - b)) & 1) as Bit
      }
      for (const p of mod.inputs) {
        if (inputs[p.name] !== undefined) continue
        if (p.name === mod.clockPin) {
          inputs[p.name] = mod.clockMode === 'negedge' ? 0 : 1
          continue
        }
        if (p.name === 'EN') {
          inputs[p.name] = 1
          continue
        }
        inputs[p.name] =
          p.name.includes('nPRE') || p.name.includes('nCLR') ? 1 : 0
      }

      const prevState = { ...initialFfState(mod), [qName]: q }
      const prevClk: Bit =
        mod.clockMode === 'negedge' ? 1 : mod.clockMode === 'posedge' ? 0 : 1
      const stepped = mod.step({ prevState, inputs, prevClk })
      if (stepped.warnings?.some((w) => w.includes('forbidden'))) continue
      const qNext = stepped.nextState[qName] ?? q
      const from = q === 0 ? 'q0' : 'q1'
      const to = qNext === 0 ? 'q0' : 'q1'
      const label =
        width === 0
          ? '—'
          : excNames
              .slice(0, width)
              .map((n) => `${n}=${inputs[n]}`)
              .join(',')
      const key = `${from}->${to}`
      if (!edgeMap.has(key)) edgeMap.set(key, new Set())
      edgeMap.get(key)!.add(label)
    }
  }

  const edges: StateEdge[] = []
  let ei = 0
  for (const [key, labels] of edgeMap) {
    const [from, to] = key.split('->') as [string, string]
    const labelList = [...labels]
    const label =
      labelList.length <= 3
        ? labelList.join(' | ')
        : `${labelList.slice(0, 2).join(' | ')} | +${labelList.length - 2}`
    edges.push({ id: `e${ei++}`, from, to, label })
  }

  return { nodes, edges, equations: mod.equations }
}
