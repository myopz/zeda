import { compareSnowflakeId, createId } from '@/lib/utils'
import { normalizeCircuitPin } from '../lib/pin-drive'
import {
  DEFAULT_SEQ_GROUP,
  type SequentialExportPayload,
  type SequentialCircuit,
} from '../types'
import { db, ensureSeeded } from './database'
import { createBlankCustomSequential } from './seed'

export function normalizeSequential(raw: SequentialCircuit): SequentialCircuit {
  const group =
    typeof raw.group === 'string' && raw.group.trim()
      ? raw.group.trim()
      : DEFAULT_SEQ_GROUP
  return {
    ...raw,
    description: raw.description ?? '',
    group,
    behaviorKey: raw.behaviorKey,
    inputs: (raw.inputs ?? []).map(normalizeCircuitPin),
    outputs: (raw.outputs ?? []).map((p) => ({
      id: p.id,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'X',
    })),
    nodes: raw.nodes ?? [],
    wires: raw.wires ?? [],
  }
}

export async function listSequentials(): Promise<SequentialCircuit[]> {
  await ensureSeeded()
  const rows = await db.circuits.toArray()
  return rows
    .map((c) => normalizeSequential(c))
    .sort((a, b) => compareSnowflakeId(a.id, b.id))
}

export async function getSequential(
  id: string,
): Promise<SequentialCircuit | undefined> {
  await ensureSeeded()
  const row = await db.circuits.get(id)
  return row ? normalizeSequential(row) : undefined
}

export async function createSequential(name: string): Promise<SequentialCircuit> {
  await ensureSeeded()
  const circuit = createBlankCustomSequential(name)
  await db.circuits.add(circuit)
  return circuit
}

export async function updateSequential(
  circuit: SequentialCircuit,
): Promise<SequentialCircuit> {
  if (circuit.kind === 'builtin') {
    throw new Error('Built-in sequential circuits cannot be modified')
  }
  const next = normalizeSequential({ ...circuit, updatedAt: Date.now() })
  await db.circuits.put(next)
  return next
}

export async function deleteSequential(id: string): Promise<void> {
  const circuit = await getSequential(id)
  if (!circuit) return
  if (circuit.kind === 'builtin') {
    throw new Error('Built-in sequential circuits cannot be deleted')
  }
  await db.circuits.delete(id)
}

export async function duplicateSequential(
  id: string,
  copySuffix: string,
): Promise<SequentialCircuit> {
  const circuit = await getSequential(id)
  if (!circuit) throw new Error('Sequential circuit not found')
  const now = Date.now()
  const copy: SequentialCircuit = {
    ...structuredClone(circuit),
    id: createId('seq'),
    name: `${circuit.name}${copySuffix}`,
    kind: 'custom',
    builtinKey: undefined,
    behaviorKey: circuit.behaviorKey ?? circuit.builtinKey,
    createdAt: now,
    updatedAt: now,
  }
  await db.circuits.add(copy)
  return copy
}

export async function exportSequentials(
  ids?: string[],
): Promise<SequentialExportPayload> {
  await ensureSeeded()
  const all = await listSequentials()
  const circuits = ids?.length ? all.filter((c) => ids.includes(c.id)) : all
  return {
    version: 1,
    exportedAt: Date.now(),
    circuits: structuredClone(circuits),
  }
}

export async function importSequentials(payload: unknown): Promise<number> {
  await ensureSeeded()
  const data = payload as SequentialExportPayload
  if (!data || data.version !== 1 || !Array.isArray(data.circuits)) {
    throw new Error('Invalid import file')
  }
  const now = Date.now()
  const toAdd: SequentialCircuit[] = data.circuits.map((c) =>
    normalizeSequential({
      ...structuredClone(c),
      id: createId('seq'),
      kind: 'custom',
      builtinKey: undefined,
      createdAt: now,
      updatedAt: now,
    }),
  )
  await db.circuits.bulkAdd(toAdd)
  return toAdd.length
}
