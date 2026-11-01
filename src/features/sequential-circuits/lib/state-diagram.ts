import type { Bit } from '../types'
import {
  getSeqModule,
  initialSeqState,
  type SeqModuleDef,
} from './seq-modules'

export type StateNode = {
  id: string
  label: string
  /** Numeric count / bit-pattern for layout helpers */
  value: number
}

export type StateEdge = {
  id: string
  from: string
  to: string
  label: string
}

export type StateDiagram = {
  nodes: StateNode[]
  edges: StateEdge[]
  equations: string[]
}

function readCount(state: Record<string, Bit>, names: string[]): number {
  let n = 0
  for (let i = 0; i < names.length; i += 1) {
    if (state[names[i]!]) n |= 1 << i
  }
  return n
}

function writeCount(
  n: number,
  names: string[],
  base: Record<string, Bit>,
): Record<string, Bit> {
  const next = { ...base }
  for (let i = 0; i < names.length; i += 1) {
    next[names[i]!] = ((n >> i) & 1) as Bit
  }
  return next
}

function modulusFor(mod: SeqModuleDef): number {
  if (mod.key.includes('mod6')) return 6
  if (mod.key.includes('dec') || mod.key === '74ls90') return 10
  const bits = Math.min(mod.stateNames.length, 4)
  return 1 << bits
}

function binaryLabel(n: number, width: number): string {
  const bits = n.toString(2).padStart(width, '0')
  return `${n}\n${bits}`
}

function idleInputs(mod: SeqModuleDef): Record<string, Bit> {
  const inputs: Record<string, Bit> = {}
  for (const p of mod.inputs) {
    if (p.name === mod.clockPin) {
      inputs[p.name] = 1
      continue
    }
    if (
      p.name.includes('nPRE') ||
      p.name.includes('nCLR') ||
      p.name.includes('nLOAD') ||
      p.name.includes('nR0')
    ) {
      inputs[p.name] = 1
    } else if (
      p.name === 'EN' ||
      p.name === 'ENP' ||
      p.name === 'ENT' ||
      p.name === 'UP'
    ) {
      inputs[p.name] = 1
    } else if (p.name === 'S0' || p.name === 'S1') {
      // 74ls194: shift right (01) so the diagram shows motion, not hold
      inputs.S0 = 1
      inputs.S1 = 0
    } else {
      inputs[p.name] = 0
    }
  }
  return inputs
}

function addEdge(
  edgeMap: Map<string, Set<string>>,
  from: string,
  to: string,
  label: string,
) {
  const key = `${from}->${to}`
  if (!edgeMap.has(key)) edgeMap.set(key, new Set())
  edgeMap.get(key)!.add(label)
}

/**
 * Build a multi-state diagram for sequential modules (up to 16 states).
 * Counters: ↑CLK advances under enable.
 * Registers: hold (nLOAD=1) + load-to-0 (nLOAD=0, D=0) so both modes appear.
 */
export function buildStateDiagram(moduleKey: string): StateDiagram | null {
  const mod = getSeqModule(moduleKey)
  if (!mod) return null

  const names = mod.stateNames.slice(0, 4)
  const width = names.length
  const modN = Math.min(modulusFor(mod), 16)
  const nodes: StateNode[] = []
  for (let i = 0; i < modN; i += 1) {
    nodes.push({
      id: `s${i}`,
      label: width <= 2 ? String(i) : binaryLabel(i, width),
      value: i,
    })
  }

  const edgeMap = new Map<string, Set<string>>()
  const baseInputs = idleInputs(mod)

  const stepFrom = (cur: number, inputs: Record<string, Bit>) => {
    const prevState = writeCount(cur, names, initialSeqState(mod))
    const stepped = mod.step({ prevState, inputs, prevClk: 0 })
    return readCount(stepped.nextState, names) % modN
  }

  if (mod.category === 'register' && baseInputs.nLOAD !== undefined) {
    for (let cur = 0; cur < modN; cur += 1) {
      // Hold
      const holdInputs = { ...baseInputs, nLOAD: 1 as Bit }
      const holdNext = stepFrom(cur, holdInputs)
      addEdge(edgeMap, `s${cur}`, `s${holdNext}`, 'nLOAD=1 hold')

      // Parallel load zeros
      const loadInputs: Record<string, Bit> = { ...baseInputs, nLOAD: 0 }
      for (const p of mod.inputs) {
        if (/^D\d+$/.test(p.name) || ['A', 'B', 'C', 'D'].includes(p.name)) {
          loadInputs[p.name] = 0
        }
      }
      const loadNext = stepFrom(cur, loadInputs)
      addEdge(edgeMap, `s${cur}`, `s${loadNext}`, 'nLOAD=0 D=0')
    }
  } else if (mod.key === '74ls194') {
    for (let cur = 0; cur < modN; cur += 1) {
      const next = stepFrom(cur, { ...baseInputs, SR: 0 })
      addEdge(edgeMap, `s${cur}`, `s${next}`, 'S=01 SR=0')
    }
  } else {
    // Counters / default: single ↑CLK transition under idle enables
    for (let cur = 0; cur < modN; cur += 1) {
      const next = stepFrom(cur, baseInputs)
      addEdge(edgeMap, `s${cur}`, `s${next}`, '↑CLK')
    }
  }

  const edges: StateEdge[] = []
  let ei = 0
  for (const [key, labels] of edgeMap) {
    const [from, to] = key.split('->') as [string, string]
    const list = [...labels]
    const label =
      list.length <= 2
        ? list.join(' | ')
        : `${list.slice(0, 2).join(' | ')} | +${list.length - 2}`
    edges.push({ id: `e${ei++}`, from, to, label })
  }

  return { nodes, edges, equations: mod.equations ?? [] }
}
