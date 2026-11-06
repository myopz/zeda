import type { CpuExportPayload, CpuProgram } from '../types'
import { cpuDb, ensureSeeded } from './database'
import { createBlankProgram } from './seed'

function normalize(raw: CpuProgram): CpuProgram {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    kind: raw.kind === 'builtin' ? 'builtin' : 'custom',
    builtinKey: raw.builtinKey,
    source: raw.source ?? '',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

export async function listPrograms(): Promise<CpuProgram[]> {
  await ensureSeeded()
  const rows = await cpuDb.programs.orderBy('updatedAt').reverse().toArray()
  return rows.map(normalize)
}

export async function getProgram(id: string): Promise<CpuProgram | undefined> {
  await ensureSeeded()
  const row = await cpuDb.programs.get(id)
  return row ? normalize(row) : undefined
}

export async function createProgram(program: CpuProgram): Promise<CpuProgram> {
  await ensureSeeded()
  if (program.kind === 'builtin') throw new Error('Cannot create builtin')
  await cpuDb.programs.add(normalize(program))
  return normalize(program)
}

export async function updateProgram(program: CpuProgram): Promise<CpuProgram> {
  await ensureSeeded()
  const existing = await cpuDb.programs.get(program.id)
  if (!existing) throw new Error('Program not found')
  if (existing.kind === 'builtin') throw new Error('Cannot modify builtin program')
  const next = normalize({ ...program, kind: 'custom', updatedAt: Date.now() })
  await cpuDb.programs.put(next)
  return next
}

export async function deletePrograms(ids: string[]): Promise<void> {
  await ensureSeeded()
  for (const id of ids) {
    const row = await cpuDb.programs.get(id)
    if (!row) continue
    if (row.kind === 'builtin') throw new Error('Cannot delete builtin program')
    await cpuDb.programs.delete(id)
  }
}

export async function duplicateProgram(id: string, nameSuffix: string): Promise<CpuProgram> {
  await ensureSeeded()
  const src = await getProgram(id)
  if (!src) throw new Error('Program not found')
  const blank = createBlankProgram(`${src.name}${nameSuffix}`)
  const next: CpuProgram = {
    ...blank,
    description: src.description,
    source: src.source,
  }
  await cpuDb.programs.add(next)
  return next
}

export async function exportPrograms(ids?: string[]): Promise<CpuExportPayload> {
  await ensureSeeded()
  let programs = await listPrograms()
  if (ids?.length) {
    const set = new Set(ids)
    programs = programs.filter((p) => set.has(p.id))
  }
  return { version: 1, exportedAt: Date.now(), programs }
}

export async function importPrograms(payload: CpuExportPayload): Promise<number> {
  await ensureSeeded()
  if (payload.version !== 1) throw new Error(`Unsupported export version ${payload.version}`)
  let count = 0
  for (const raw of payload.programs) {
    const blank = createBlankProgram(raw.name || 'Imported')
    const next: CpuProgram = {
      ...blank,
      description: raw.description ?? '',
      source: raw.source ?? '',
    }
    await cpuDb.programs.add(next)
    count += 1
  }
  return count
}
