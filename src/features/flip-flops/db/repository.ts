import { compareSnowflakeId, createId } from '@/lib/utils'
import {
  DEFAULT_FF_GROUP,
  type FlipFlopExportPayload,
  type FlipFlopCircuit,
} from '../types'
import { db, ensureSeeded } from './database'
import { createBlankCustomFlipFlop } from './seed'

export function normalizeFlipFlop(raw: FlipFlopCircuit): FlipFlopCircuit {
  const group =
    typeof raw.group === 'string' && raw.group.trim()
      ? raw.group.trim()
      : DEFAULT_FF_GROUP
  return {
    ...raw,
    description: raw.description ?? '',
    group,
    behaviorKey: raw.behaviorKey,
    inputs: raw.inputs ?? [],
    outputs: raw.outputs ?? [],
    nodes: raw.nodes ?? [],
    wires: raw.wires ?? [],
  }
}

export async function listFlipFlops(): Promise<FlipFlopCircuit[]> {
  await ensureSeeded()
  const rows = await db.circuits.toArray()
  return rows
    .map((c) => normalizeFlipFlop(c))
    .sort((a, b) => compareSnowflakeId(a.id, b.id))
}

export async function getFlipFlop(
  id: string,
): Promise<FlipFlopCircuit | undefined> {
  await ensureSeeded()
  const row = await db.circuits.get(id)
  return row ? normalizeFlipFlop(row) : undefined
}

export async function createFlipFlop(name: string): Promise<FlipFlopCircuit> {
  await ensureSeeded()
  const circuit = createBlankCustomFlipFlop(name)
  await db.circuits.add(circuit)
  return circuit
}

export async function updateFlipFlop(
  circuit: FlipFlopCircuit,
): Promise<FlipFlopCircuit> {
  if (circuit.kind === 'builtin') {
    throw new Error('Built-in flip-flop circuits cannot be modified')
  }
  const next = normalizeFlipFlop({ ...circuit, updatedAt: Date.now() })
  await db.circuits.put(next)
  return next
}

export async function deleteFlipFlop(id: string): Promise<void> {
  const circuit = await getFlipFlop(id)
  if (!circuit) return
  if (circuit.kind === 'builtin') {
    throw new Error('Built-in flip-flop circuits cannot be deleted')
  }
  await db.circuits.delete(id)
}

export async function duplicateFlipFlop(
  id: string,
  copySuffix: string,
): Promise<FlipFlopCircuit> {
  const circuit = await getFlipFlop(id)
  if (!circuit) throw new Error('Flip-flop circuit not found')
  const now = Date.now()
  const copy: FlipFlopCircuit = {
    ...structuredClone(circuit),
    id: createId('ff'),
    name: `${circuit.name}${copySuffix}`,
    kind: 'custom',
    builtinKey: undefined,
    // Keep behaviorKey so gate-level latch copies still simulate.
    behaviorKey: circuit.behaviorKey ?? circuit.builtinKey,
    createdAt: now,
    updatedAt: now,
  }
  await db.circuits.add(copy)
  return copy
}

export async function exportFlipFlops(
  ids?: string[],
): Promise<FlipFlopExportPayload> {
  await ensureSeeded()
  const all = await listFlipFlops()
  const circuits = ids?.length ? all.filter((c) => ids.includes(c.id)) : all
  return {
    version: 1,
    exportedAt: Date.now(),
    circuits: structuredClone(circuits),
  }
}

export async function importFlipFlops(payload: unknown): Promise<number> {
  await ensureSeeded()
  const data = payload as FlipFlopExportPayload
  if (!data || data.version !== 1 || !Array.isArray(data.circuits)) {
    throw new Error('Invalid import file')
  }
  const now = Date.now()
  const toAdd: FlipFlopCircuit[] = data.circuits.map((c) =>
    normalizeFlipFlop({
      ...structuredClone(c),
      id: createId('ff'),
      kind: 'custom',
      builtinKey: undefined,
      createdAt: now,
      updatedAt: now,
    }),
  )
  await db.circuits.bulkAdd(toAdd)
  return toAdd.length
}
