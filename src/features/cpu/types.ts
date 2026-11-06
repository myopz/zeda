export type CpuProgram = {
  id: string
  name: string
  description?: string
  kind: 'builtin' | 'custom'
  builtinKey?: string
  /** Assembly source (authoritative). */
  source: string
  createdAt: number
  updatedAt: number
}

export type CpuProgramDraft = Omit<CpuProgram, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export type CpuExportPayload = {
  version: 1
  exportedAt: number
  programs: CpuProgram[]
}
