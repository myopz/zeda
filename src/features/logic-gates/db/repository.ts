import { compareSnowflakeId, createId } from '@/lib/utils'
import { normalizeGate } from '../lib/bool-engine'
import type { GateExportPayload, LogicGate } from '../types'
import { db, ensureSeeded } from './database'
import { createBlankCustomGate } from './seed'

export async function listGates(): Promise<LogicGate[]> {
  await ensureSeeded()
  const gates = await db.logicGates.toArray()
  return gates.map((g) => normalizeGate(g)).sort((a, b) => compareSnowflakeId(a.id, b.id))
}

export async function getGate(id: string): Promise<LogicGate | undefined> {
  await ensureSeeded()
  const gate = await db.logicGates.get(id)
  return gate ? normalizeGate(gate) : undefined
}

export async function createGate(name: string): Promise<LogicGate> {
  await ensureSeeded()
  const gate = createBlankCustomGate(name)
  await db.logicGates.add(gate)
  return gate
}

export async function updateGate(gate: LogicGate): Promise<LogicGate> {
  if (gate.kind === 'builtin') {
    throw new Error('Built-in gates cannot be modified')
  }
  const next = normalizeGate({ ...gate, updatedAt: Date.now() })
  await db.logicGates.put(next)
  return next
}

export async function deleteGate(id: string): Promise<void> {
  const gate = await getGate(id)
  if (!gate) return
  if (gate.kind === 'builtin') {
    throw new Error('Built-in gates cannot be deleted')
  }
  await db.logicGates.delete(id)
}

export async function duplicateGate(id: string, copySuffix: string): Promise<LogicGate> {
  const gate = await getGate(id)
  if (!gate) throw new Error('Gate not found')
  const now = Date.now()
  const copy: LogicGate = {
    ...structuredClone(gate),
    id: createId('gate'),
    name: `${gate.name}${copySuffix}`,
    kind: 'custom',
    builtinKey: undefined,
    createdAt: now,
    updatedAt: now,
  }
  await db.logicGates.add(copy)
  return copy
}

export async function exportGates(ids?: string[]): Promise<GateExportPayload> {
  await ensureSeeded()
  const all = await listGates()
  const gates = ids?.length ? all.filter((g) => ids.includes(g.id)) : all
  return {
    version: 1,
    exportedAt: Date.now(),
    gates: structuredClone(gates),
  }
}

export async function importGates(payload: unknown): Promise<number> {
  await ensureSeeded()
  const data = payload as GateExportPayload
  if (!data || data.version !== 1 || !Array.isArray(data.gates)) {
    throw new Error('Invalid import file')
  }
  const now = Date.now()
  const toAdd: LogicGate[] = data.gates.map((g) =>
    normalizeGate({
      ...structuredClone(g),
      id: createId('gate'),
      kind: 'custom',
      builtinKey: undefined,
      createdAt: now,
      updatedAt: now,
    }),
  )
  await db.logicGates.bulkAdd(toAdd)
  return toAdd.length
}

export async function countGates(): Promise<number> {
  await ensureSeeded()
  return db.logicGates.count()
}
