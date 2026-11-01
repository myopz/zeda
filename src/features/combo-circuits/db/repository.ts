import { compareSnowflakeId, createId } from '@/lib/utils'
import {
  DEFAULT_CIRCUIT_GROUP,
  type CircuitExportPayload,
  type ComboCircuit,
} from '../types'
import { db, ensureSeeded } from './database'
import { createBlankCustomCircuit } from './seed'

export function normalizeCircuit(raw: ComboCircuit): ComboCircuit {
  const group =
    typeof raw.group === 'string' && raw.group.trim()
      ? raw.group.trim()
      : DEFAULT_CIRCUIT_GROUP
  return {
    ...raw,
    description: raw.description ?? '',
    group,
    inputs: raw.inputs ?? [],
    outputs: raw.outputs ?? [],
    nodes: raw.nodes ?? [],
    wires: raw.wires ?? [],
  }
}

export async function listCircuits(): Promise<ComboCircuit[]> {
  await ensureSeeded()
  const rows = await db.circuits.toArray()
  return rows
    .map((c) => normalizeCircuit(c))
    .sort((a, b) => compareSnowflakeId(a.id, b.id))
}

export async function getCircuit(id: string): Promise<ComboCircuit | undefined> {
  await ensureSeeded()
  const row = await db.circuits.get(id)
  return row ? normalizeCircuit(row) : undefined
}

export async function createCircuit(name: string): Promise<ComboCircuit> {
  await ensureSeeded()
  const circuit = createBlankCustomCircuit(name)
  await db.circuits.add(circuit)
  return circuit
}

export async function updateCircuit(circuit: ComboCircuit): Promise<ComboCircuit> {
  if (circuit.kind === 'builtin') {
    throw new Error('Built-in circuits cannot be modified')
  }
  const next = normalizeCircuit({ ...circuit, updatedAt: Date.now() })
  await db.circuits.put(next)
  return next
}

export async function deleteCircuit(id: string): Promise<void> {
  const circuit = await getCircuit(id)
  if (!circuit) return
  if (circuit.kind === 'builtin') {
    throw new Error('Built-in circuits cannot be deleted')
  }
  await db.circuits.delete(id)
}

export async function duplicateCircuit(
  id: string,
  copySuffix: string,
): Promise<ComboCircuit> {
  const circuit = await getCircuit(id)
  if (!circuit) throw new Error('Circuit not found')
  const now = Date.now()
  const copy: ComboCircuit = {
    ...structuredClone(circuit),
    id: createId('ckt'),
    name: `${circuit.name}${copySuffix}`,
    kind: 'custom',
    builtinKey: undefined,
    createdAt: now,
    updatedAt: now,
  }
  await db.circuits.add(copy)
  return copy
}

export async function exportCircuits(ids?: string[]): Promise<CircuitExportPayload> {
  await ensureSeeded()
  const all = await listCircuits()
  const circuits = ids?.length ? all.filter((c) => ids.includes(c.id)) : all
  return {
    version: 1,
    exportedAt: Date.now(),
    circuits: structuredClone(circuits),
  }
}

export async function importCircuits(payload: unknown): Promise<number> {
  await ensureSeeded()
  const data = payload as CircuitExportPayload
  if (!data || data.version !== 1 || !Array.isArray(data.circuits)) {
    throw new Error('Invalid import file')
  }
  const now = Date.now()
  const toAdd: ComboCircuit[] = data.circuits.map((c) =>
    normalizeCircuit({
      ...structuredClone(c),
      id: createId('ckt'),
      kind: 'custom',
      builtinKey: undefined,
      createdAt: now,
      updatedAt: now,
    }),
  )
  await db.circuits.bulkAdd(toAdd)
  return toAdd.length
}
