import Dexie, { type EntityTable } from 'dexie'
import type { ComboCircuit } from '../types'
import { CIRCUIT_LAYOUT_REV, createSeedCircuits, LEGACY_CIRCUIT_IDS } from './seed'

export class ZedaComboCircuitsDatabase extends Dexie {
  circuits!: EntityTable<ComboCircuit, 'id'>

  constructor() {
    super('zeda.combo-circuits')
    this.version(1).stores({
      circuits: 'id, kind, name, updatedAt, builtinKey',
    })
  }
}

export const db = new ZedaComboCircuitsDatabase()

let seedPromise: Promise<void> | null = null
let seededLayoutRev = -1

export function ensureSeeded(): Promise<void> {
  if (seededLayoutRev !== CIRCUIT_LAYOUT_REV) {
    seedPromise = null
    seededLayoutRev = CIRCUIT_LAYOUT_REV
  }
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        await db.circuits.bulkDelete([...LEGACY_CIRCUIT_IDS])
        const seeds = createSeedCircuits()
        for (const seed of seeds) {
          const existing = await db.circuits.get(seed.id)
          if (!existing) {
            await db.circuits.add(seed)
          } else {
            // Refresh catalog topology (gate-level layouts) while keeping createdAt
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
