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

export type SeqGateNode = {
  id: string
  kind: 'gate'
  ref: GateNodeRef
  position: { x: number; y: number }
}

export type SeqFfNode = {
  id: string
  kind: 'ff'
  /** Flip-flop catalog module key (stage 3). */
  moduleKey: string
  position: { x: number; y: number }
}

export type SeqModuleNode = {
  id: string
  kind: 'seq'
  /** Sequential catalog module key (this stage). */
  moduleKey: string
  position: { x: number; y: number }
}

export type SeqCircuitRefNode = {
  id: string
  kind: 'circuit'
  /** Nested SequentialCircuit */
  circuitId: string
  position: { x: number; y: number }
}

/** Reference to a ComboCircuit (combinational black box by IO). */
export type SeqComboNode = {
  id: string
  kind: 'combo'
  circuitId: string
  position: { x: number; y: number }
}

/** Combo catalog module (half_adder, …) for palette / drill views. */
export type SeqComboModuleNode = {
  id: string
  kind: 'comboModule'
  moduleKey: string
  position: { x: number; y: number }
}

export type SeqNode =
  | SeqGateNode
  | SeqFfNode
  | SeqModuleNode
  | SeqCircuitRefNode
  | SeqComboNode
  | SeqComboModuleNode

export const DEFAULT_SEQ_GROUP = 'default'

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

export type SequentialCircuit = {
  id: string
  name: string
  description?: string
  kind: 'builtin' | 'custom'
  builtinKey?: string
  /**
   * When set and the circuit has no nested stateful nodes, sequential sim uses
   * this catalog module behavior (matched by IO pin names).
   */
  behaviorKey?: string
  group: string
  inputs: CircuitPin[]
  outputs: CircuitPin[]
  nodes: SeqNode[]
  wires: CircuitWire[]
  createdAt: number
  updatedAt: number
}

export type SequentialDraft = Omit<
  SequentialCircuit,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string
}

export type SequentialExportPayload = {
  version: 1
  exportedAt: number
  circuits: SequentialCircuit[]
}
