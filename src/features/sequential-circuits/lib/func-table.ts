import type { Bit } from '../types'
import {
  getSeqModule,
  isSeqModuleKey,
  type SeqModuleDef,
} from './seq-modules'

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

/** Prefer a compact control-input set for wide sequential modules. */
function tableInputNames(mod: SeqModuleDef): string[] {
  const all = mod.inputs.map((p) => p.name).filter((n) => n !== mod.clockPin)
  // Cap enumeration width to avoid 2^n explosion (keep ≤ 4 control bits).
  if (all.length <= 4) return all
  const prefer = ['EN', 'UP', 'nCLR', 'nLOAD', 'nR0', 'ENP', 'ENT', 'S0', 'S1', 'SI', 'SR', 'SL']
  const picked: string[] = []
  for (const name of prefer) {
    if (all.includes(name) && picked.length < 4) picked.push(name)
  }
  for (const name of all) {
    if (picked.length >= 4) break
    if (!picked.includes(name)) picked.push(name)
  }
  return picked
}

function stateCols(mod: SeqModuleDef): string[] {
  return mod.stateNames.slice(0, 4)
}

export function buildFuncTablePage(
  moduleKey: string,
  page: number,
  pageSize: number,
): FuncTablePage {
  const mod = getSeqModule(moduleKey)
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

  const inNames = tableInputNames(mod)
  const qCols = stateCols(mod)
  const columns = [...inNames, ...qCols.map((q) => q), ...qCols.map((q) => `${q}+`)]
  const inputWidth = inNames.length
  const stateWidth = qCols.length
  const totalCombos = 1 << (inputWidth + stateWidth)
  const totalPages = Math.max(1, Math.ceil(totalCombos / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const rows: FuncTableRow[] = []

  for (let i = start; i < Math.min(start + pageSize, totalCombos); i += 1) {
    const bits = bitAt(i, inputWidth + stateWidth)
    const inBits = bits.slice(0, inputWidth)
    const stateBits = bits.slice(inputWidth)
    const inputs: Record<string, Bit> = {}
    for (let j = 0; j < inNames.length; j += 1) {
      inputs[inNames[j]!] = inBits[j] ?? 0
    }
    // Idle async pins
    for (const p of mod.inputs) {
      if (inputs[p.name] !== undefined) continue
      if (p.name === mod.clockPin) continue
      if (
        p.name.includes('nPRE') ||
        p.name.includes('nCLR') ||
        p.name.includes('nLOAD') ||
        p.name.includes('nR0')
      ) {
        inputs[p.name] = 1
      } else {
        inputs[p.name] = 0
      }
    }
    if (mod.clockPin) inputs[mod.clockPin] = 1

    const prevState: Record<string, Bit> = {}
    for (let j = 0; j < qCols.length; j += 1) {
      prevState[qCols[j]!] = stateBits[j] ?? 0
    }
    for (const name of mod.stateNames) {
      if (prevState[name] === undefined) prevState[name] = 0
    }

    const stepped = mod.step({
      prevState,
      inputs,
      prevClk: 0,
    })

    rows.push({
      cells: [
        ...inBits,
        ...qCols.map((q) => prevState[q] ?? 0),
        ...qCols.map((q) => stepped.nextState[q] ?? 0),
      ],
    })
  }

  return {
    columns,
    rows,
    totalRows: totalCombos,
    page: safePage,
    pageSize,
    totalPages,
    equations: mod.equations ?? [],
  }
}

export { isSeqModuleKey }
