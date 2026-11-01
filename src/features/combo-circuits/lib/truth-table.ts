import type { LogicGate } from '@/features/logic-gates/types'
import type { Bit, ComboCircuit } from '../types'
import {
  evaluateCircuit,
  NetlistError,
  type CircuitResolver,
  type GateResolver,
} from './netlist'

/** Soft cap: larger tables stay paginated but avoid huge in-memory builds. */
export const TRUTH_TABLE_MAX_INPUTS = 12

export type TruthTableRow = {
  cells: Bit[]
}

export type TruthTablePage = {
  columns: string[]
  rows: TruthTableRow[]
  totalRows: number
  page: number
  pageSize: number
  totalPages: number
  truncated?: boolean
}

function bitAt(index: number, width: number): Bit[] {
  const bits: Bit[] = []
  for (let i = width - 1; i >= 0; i -= 1) {
    bits.push(((index >> i) & 1) as Bit)
  }
  return bits
}

export function makeGateResolver(gates: LogicGate[]): GateResolver {
  const byId = new Map(gates.map((g) => [g.id, g]))
  const byKey = new Map<string, LogicGate>()
  for (const g of gates) {
    if (g.builtinKey) byKey.set(g.builtinKey, g)
  }
  return (node) => {
    if (node.ref.builtinKey) return byKey.get(node.ref.builtinKey)
    if (node.ref.gateId) return byId.get(node.ref.gateId)
    return undefined
  }
}

/**
 * Build a paged truth / function table by enumerating circuit input combinations.
 */
export function buildTruthTablePage(
  circuit: ComboCircuit,
  gates: LogicGate[],
  page: number,
  pageSize: number,
  resolveCircuit: CircuitResolver = () => undefined,
): TruthTablePage {
  const inPins = circuit.inputs
  const outPins = circuit.outputs
  const columns = [...inPins.map((p) => p.name), ...outPins.map((p) => p.name)]
  const width = inPins.length

  if (width === 0 || width > TRUTH_TABLE_MAX_INPUTS) {
    return {
      columns,
      rows: [],
      totalRows: 0,
      page: 1,
      pageSize,
      totalPages: 1,
      truncated: width > TRUTH_TABLE_MAX_INPUTS,
    }
  }

  const totalCombos = 1 << width
  const totalPages = Math.max(1, Math.ceil(totalCombos / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const end = Math.min(totalCombos, start + pageSize)
  const resolveGate = makeGateResolver(gates)
  const rows: TruthTableRow[] = []

  for (let i = start; i < end; i += 1) {
    const bits = bitAt(i, width)
    const inputBits: Record<string, Bit> = {}
    inPins.forEach((p, idx) => {
      inputBits[p.id] = bits[idx]!
    })
    try {
      const result = evaluateCircuit(
        circuit,
        inputBits,
        resolveGate,
        resolveCircuit,
      )
      rows.push({
        cells: [
          ...bits,
          ...outPins.map((p) => result.outputs[p.id] ?? 0),
        ],
      })
    } catch (err) {
      throw err instanceof NetlistError
        ? err
        : new NetlistError(err instanceof Error ? err.message : String(err))
    }
  }

  return {
    columns,
    rows,
    totalRows: totalCombos,
    page: safePage,
    pageSize,
    totalPages,
  }
}
