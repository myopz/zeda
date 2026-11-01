import Dexie, { type EntityTable } from 'dexie'
import type { FlipFlopCircuit } from '../types'
import { FF_LAYOUT_REV, createSeedFlipFlops, LEGACY_FF_IDS } from './seed'

export class ZedaFlipFlopsDatabase extends Dexie {
  circuits!: EntityTable<FlipFlopCircuit, 'id'>

  constructor() {
    super('zeda.flip-flops')
    this.version(1).stores({
      circuits: 'id, kind, name, updatedAt, builtinKey',
    })
  }
}

export const db = new ZedaFlipFlopsDatabase()

let seedPromise: Promise<void> | null = null
let seededLayoutRev = -1

export function ensureSeeded(): Promise<void> {
  if (seededLayoutRev !== FF_LAYOUT_REV) {
    seedPromise = null
    seededLayoutRev = FF_LAYOUT_REV
  }
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        if (LEGACY_FF_IDS.length) {
          await db.circuits.bulkDelete([...LEGACY_FF_IDS])
        }
        const seeds = createSeedFlipFlops()
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
