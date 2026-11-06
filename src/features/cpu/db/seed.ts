import { createId } from '@/lib/utils'
import { snowflake } from '@/lib/snowflake'
import type { CpuProgram } from '../types'

/** Bump when builtin program sources change. */
export const CPU_LAYOUT_REV = 2

export const EXAMPLE_KEYS = ['demo_add', 'demo_loop', 'demo_mem'] as const
export type ExampleKey = (typeof EXAMPLE_KEYS)[number]

const PROGRAM_IDS: Record<ExampleKey, string> = {
  demo_add: snowflake.fixed(401),
  demo_loop: snowflake.fixed(402),
  demo_mem: snowflake.fixed(403),
}

const SOURCES: Record<ExampleKey, { name: string; description: string; source: string }> = {
  demo_add: {
    name: 'Add immediates',
    description: 'LOADI → ADD → STORE → HALT (16×8)',
    source: `; Teaching datapath 16×8: R0 = 3 + 5, store at 0x0E
LOADI R0, 3
LOADI R1, 5
ADD R0, R1
STORE R0, 0x0E
HALT
`,
  },
  demo_loop: {
    name: 'Countdown loop',
    description: 'JZ / JMP countdown to zero',
    source: `; Count R0 from 3 down to 0 (fits in 16 bytes)
LOADI R0, 3
LOADI R1, 1
loop:
SUB R0, R1
JZ done
JMP loop
done:
HALT
`,
  },
  demo_mem: {
    name: 'Memory move',
    description: 'LOAD / STORE within 0x00–0x0F',
    source: `; Copy mem[0x0E] to mem[0x0F]
ORG 0x0E
DB 0x2A
ORG 0x00
LOAD R0, 0x0E
STORE R0, 0x0F
HALT
`,
  },
}

export function createSeedPrograms(): CpuProgram[] {
  const now = Date.now()
  return EXAMPLE_KEYS.map((key) => {
    const meta = SOURCES[key]
    return {
      id: PROGRAM_IDS[key],
      name: meta.name,
      description: meta.description,
      kind: 'builtin' as const,
      builtinKey: key,
      source: meta.source,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export function catalogKeyFromProgramId(id: string): ExampleKey | undefined {
  for (const key of EXAMPLE_KEYS) {
    if (PROGRAM_IDS[key] === id) return key
  }
  return undefined
}

export function createBlankProgram(name: string): CpuProgram {
  const now = Date.now()
  return {
    id: createId('cpu'),
    name,
    description: '',
    kind: 'custom',
    source: '; Zeda-8\nLOADI R0, 0\nHALT\n',
    createdAt: now,
    updatedAt: now,
  }
}
