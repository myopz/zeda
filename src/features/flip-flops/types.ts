export type Bit = 0 | 1

/**
 * Input drive semantics for timing / simulation stimulus.
 * Outputs ignore this field. Missing values are inferred from {@link CircuitPin.name}.
 */
export type PinDrive = 'signal' | 'clk' | 'vcc' | 'gnd'

export type CircuitPin = {
  id: string
  name: string
  /** Input stimulus role; defaults via name inference when omitted. */
  drive?: PinDrive
}

export type GateNodeRef = {
  builtinKey?: string
  gateId?: string
}

export type FfGateNode = {
  id: string
  kind: 'gate'
  ref: GateNodeRef
  position: { x: number; y: number }
}

export type FfModuleNode = {
  id: string
  kind: 'ff'
  moduleKey: string
  position: { x: number; y: number }
}

export type FfNode = FfGateNode | FfModuleNode

export const DEFAULT_FF_GROUP = 'default'

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

export type FlipFlopCircuit = {
  id: string
  name: string
  description?: string
  kind: 'builtin' | 'custom'
  builtinKey?: string
  /**
   * When set, sequential sim uses this FF module behavior (matched by IO pin names)
   * instead of evaluating gate netlists. Used for gate-level textbook seeds that
   * contain cross-coupled loops.
   */
  behaviorKey?: string
  group: string
  inputs: CircuitPin[]
  outputs: CircuitPin[]
  nodes: FfNode[]
  wires: CircuitWire[]
  createdAt: number
  updatedAt: number
}

export type FlipFlopDraft = Omit<FlipFlopCircuit, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}

export type FlipFlopExportPayload = {
  version: 1
  exportedAt: number
  circuits: FlipFlopCircuit[]
}
