import Dexie, { type Table } from 'dexie'
import type { CpuProgram } from '../types'
import { CPU_LAYOUT_REV, createSeedPrograms } from './seed'

class CpuDatabase extends Dexie {
  programs!: Table<CpuProgram, string>

  constructor() {
    super('zeda.cpu')
    this.version(1).stores({
      programs: 'id, kind, updatedAt, name',
    })
  }
}

export const cpuDb = new CpuDatabase()

let seedPromise: Promise<void> | null = null
let seededLayoutRev = -1

export function ensureSeeded(): Promise<void> {
  if (seededLayoutRev !== CPU_LAYOUT_REV) {
    seedPromise = null
    seededLayoutRev = CPU_LAYOUT_REV
  }
  if (!seedPromise) {
    seedPromise = (async () => {
      const seeds = createSeedPrograms()
      for (const p of seeds) {
        const existing = await cpuDb.programs.get(p.id)
        if (existing) {
          await cpuDb.programs.put({
            ...p,
            createdAt: existing.createdAt,
          })
        } else {
          await cpuDb.programs.add(p)
        }
      }
    })()
  }
  return seedPromise
}
