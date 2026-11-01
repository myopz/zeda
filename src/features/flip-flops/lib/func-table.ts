import type { Bit } from '../types'
import {
  getFfModule,
  initialFfState,
  type FfModuleDef,
  type FfModuleKey,
} from './ff-modules'

export type FuncTableRow = {
  cells: (Bit | string)[]
  forbidden?: boolean
}

export type FuncTablePage = {
  columns: string[]
  rows: FuncTableRow[]
  totalRows: number
  page: number
  pageSize: number
  totalPages: number
  equations: string[]
}

function bitAt(index: number, width: number): Bit[] {
  const bits: Bit[] = []
  for (let i = width - 1; i >= 0; i -= 1) {
    bits.push(((index >> i) & 1) as Bit)
  }
  return bits
}

/**
 * Build a paged characteristic / function table for a single FF module.
 * Edge-triggered modules omit CLK from the enumeration and apply one ideal edge per row.
 */
export function buildFuncTablePage(
  moduleKey: string,
  page: number,
  pageSize: number,
): FuncTablePage {
  const mod = getFfModule(moduleKey)
  if (!mod) {
    return {
      columns: [],
      rows: [],
      totalRows: 0,
      page: 1,
      pageSize,
      totalPages: 1,
      equations: [],
    }
  }
  return buildSingleQTable(mod, page, pageSize)
}

function tableInputNames(mod: FfModuleDef): string[] {
  if (mod.key === '74ls74') return ['1D', '1nPRE', '1nCLR']
  if (mod.key === '74ls112') return ['1J', '1K', '1nPRE', '1nCLR']
  if (mod.key === '74ls175') return ['D0', 'nCLR']
  if (mod.clockMode === 'posedge' || mod.clockMode === 'negedge') {
    return mod.inputs.map((p) => p.name).filter((n) => n !== mod.clockPin)
  }
  return mod.inputs.map((p) => p.name)
}

function primaryStateName(mod: FfModuleDef): string {
  return mod.stateNames[0] ?? 'Q'
}

function buildSingleQTable(
  mod: FfModuleDef,
  page: number,
  pageSize: number,
): FuncTablePage {
  const inNames = tableInputNames(mod)
  const qName = primaryStateName(mod)
  const columns = [...inNames, 'Q', 'Q+', 'Qn+']
  const inputWidth = inNames.length
  const totalCombos = 1 << (inputWidth + 1)
  const totalPages = Math.max(1, Math.ceil(totalCombos / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const end = Math.min(totalCombos, start + pageSize)
  const rows: FuncTableRow[] = []

  for (let i = start; i < end; i += 1) {
    const allBits = bitAt(i, inputWidth + 1)
    const q = allBits[inputWidth]!
    const inputs: Record<string, Bit> = {}
    inNames.forEach((name, idx) => {
      inputs[name] = allBits[idx]!
    })
    for (const p of mod.inputs) {
      if (inputs[p.name] !== undefined) continue
      if (p.name === mod.clockPin) {
        // Force active edge sample.
        inputs[p.name] = mod.clockMode === 'negedge' ? 0 : 1
        continue
      }
      inputs[p.name] =
        p.name.includes('nPRE') || p.name.includes('nCLR') ? 1 : 0
    }

    const prevState = { ...initialFfState(mod), [qName]: q }
    let prevClk: Bit = 0
    if (mod.clockMode === 'posedge') prevClk = 0
    else if (mod.clockMode === 'negedge') prevClk = 1
    else prevClk = inputs[mod.clockPin ?? ''] ?? 0

    const stepped = mod.step({ prevState, inputs, prevClk })
    const qNext = stepped.nextState[qName] ?? q
    const forbidden = stepped.warnings?.some((w) => w.includes('forbidden'))
    rows.push({
      cells: [...inNames.map((n) => inputs[n] ?? 0), q, qNext, qNext === 1 ? 0 : 1],
      forbidden,
    })
  }

  return {
    columns,
    rows,
    totalRows: totalCombos,
    page: safePage,
    pageSize,
    totalPages,
    equations: mod.equations,
  }
}

export function isFfModuleKey(key: string): key is FfModuleKey {
  return getFfModule(key) != null
}
