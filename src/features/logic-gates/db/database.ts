import Dexie, { type EntityTable } from 'dexie'
import type { LogicGate } from '../types'
import { createSeedGates, GATE_META_REV, LEGACY_GATE_IDS } from './seed'

export class ZedaDatabase extends Dexie {
  logicGates!: EntityTable<LogicGate, 'id'>

  constructor() {
    // Distinct name avoids collisions with other local apps using "zeda".
    super('zeda.logic-gates')
    this.version(1).stores({
      logicGates: 'id, kind, name, updatedAt, builtinKey',
    })
  }
}

export const db = new ZedaDatabase()

const META_REV_KEY = 'zeda.logic-gates.metaRev'

let seedPromise: Promise<void> | null = null

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        await db.logicGates.bulkDelete([...LEGACY_GATE_IDS])
        const seeds = createSeedGates()
        const storedRev = Number(localStorage.getItem(META_REV_KEY) ?? '0')
        if (storedRev !== GATE_META_REV) {
          // Re-apply seed meta (group, etc.) without wiping user customs.
          await db.logicGates.bulkPut(seeds)
          localStorage.setItem(META_REV_KEY, String(GATE_META_REV))
        } else {
          const existing = await db.logicGates.bulkGet(seeds.map((g) => g.id))
          const missing = seeds.filter((_, i) => !existing[i])
          if (missing.length > 0) {
            await db.logicGates.bulkAdd(missing)
          }
        }
      } catch (err) {
        seedPromise = null
        throw err
      }
    })()
  }
  return seedPromise
}
