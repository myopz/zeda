export type Bit = 0 | 1

export type CircuitPin = {
  id: string
  name: string
}

export type GateNodeRef = {
  builtinKey?: string
  gateId?: string
}

export type CircuitGateNode = {
  id: string
  kind: 'gate'
  ref: GateNodeRef
  position: { x: number; y: number }
}

export type CircuitModuleNode = {
  id: string
  kind: 'module'
  moduleKey: string
  position: { x: number; y: number }
}

/** Nested reference to another ComboCircuit (black-box by IO). */
export type CircuitRefNode = {
  id: string
  kind: 'circuit'
  circuitId: string
  position: { x: number; y: number }
}

export type CircuitNode = CircuitGateNode | CircuitModuleNode | CircuitRefNode

/** Default palette / meta group for circuits without a custom group. */
export const DEFAULT_CIRCUIT_GROUP = 'default'

export type WireEndpoint = {
  /** `'io'` for circuit ports; otherwise a node id */
  nodeId: string
  pinId: string
}

export type CircuitWire = {
  id: string
  from: WireEndpoint
  to: WireEndpoint
}

export type ComboCircuit = {
  id: string
  name: string
  description?: string
  kind: 'builtin' | 'custom'
  builtinKey?: string
  /** Palette grouping key; free-form, defaults to {@link DEFAULT_CIRCUIT_GROUP}. */
  group: string
  inputs: CircuitPin[]
  outputs: CircuitPin[]
  nodes: CircuitNode[]
  wires: CircuitWire[]
  createdAt: number
  updatedAt: number
}

export type ComboCircuitDraft = Omit<ComboCircuit, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export type CircuitExportPayload = {
  version: 1
  exportedAt: number
  circuits: ComboCircuit[]
}
