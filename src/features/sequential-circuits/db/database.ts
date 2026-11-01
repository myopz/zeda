import Dexie, { type EntityTable } from 'dexie'
import type { SequentialCircuit } from '../types'
import { SEQ_LAYOUT_REV, createSeedSequentials, LEGACY_SEQ_IDS } from './seed'

export class ZedaSequentialDatabase extends Dexie {
  circuits!: EntityTable<SequentialCircuit, 'id'>

  constructor() {
    super('zeda.sequential-circuits')
    this.version(1).stores({
      circuits: 'id, kind, name, updatedAt, builtinKey',
    })
  }
}

export const db = new ZedaSequentialDatabase()

let seedPromise: Promise<void> | null = null
let seededLayoutRev = -1

export function ensureSeeded(): Promise<void> {
  if (seededLayoutRev !== SEQ_LAYOUT_REV) {
    seedPromise = null
    seededLayoutRev = SEQ_LAYOUT_REV
  }
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        if (LEGACY_SEQ_IDS.length) {
          await db.circuits.bulkDelete([...LEGACY_SEQ_IDS])
        }
        const seeds = createSeedSequentials()
        for (const seed of seeds) {
          const existing = await db.circuits.get(seed.id)
          if (!existing) {
            await db.circuits.add(seed)
          } else {
            await db.circuits.put({
              ...seed,
              createdAt: existing.createdAt,
              updatedAt: Date.now(),
            })
          }
        }
      } catch (err) {
        seedPromise = null
        seededLayoutRev = -1
        throw err
      }
    })()
  }
  return seedPromise
}
