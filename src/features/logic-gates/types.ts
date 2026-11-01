export type Bit = 0 | 1

export type GatePin = {
  id: string
  name: string
}

export type BuiltinKey = 'and' | 'or' | 'not' | 'nand' | 'nor' | 'xor' | 'xnor'

/** Default palette / meta group for custom gates. */
export const DEFAULT_GATE_GROUP = 'default'

export type LogicGate = {
  id: string
  name: string
  description?: string
  kind: 'builtin' | 'custom'
  builtinKey?: BuiltinKey
  /** Palette / meta grouping key (preset or free-form). */
  group: string
  inputs: GatePin[]
  outputs: GatePin[]
  /** output pin id -> formula string (source of truth; truth table is derived) */
  formulas: Record<string, string>
  createdAt: number
  updatedAt: number
}

export type LogicGateDraft = Omit<LogicGate, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export type GateExportPayload = {
  version: 1
  exportedAt: number
  gates: LogicGate[]
}
