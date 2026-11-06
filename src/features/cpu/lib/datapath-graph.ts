/** Static layout for teaching CPU datapath canvas (React Flow). */

export type DatapathNodeDef = {
  id: string
  labelKey: string
  /** Fallback English label */
  label: string
  moduleKey?: string
  x: number
  y: number
  w?: number
  h?: number
}

export type DatapathEdgeDef = {
  id: string
  source: string
  target: string
  label?: string
  /** Explicit handle ids on DatapathBlockNode */
  sourceHandle?: string
  targetHandle?: string
  /** Fan-out parallel smoothstep paths (px) */
  offset?: number
}

/**
 * Layout leaves wire corridors between columns so edges do not cut through cards.
 *
 *   [ctrl]──────────────┐
 *      │                │
 *   [pc]──►[mem]──►[ir]
 *            │  └─►[imm]──►[wb]
 *            │              ▲
 *   [rf]─────┴──►[alu]──────┤
 *                     └►[flags]
 */
export const DATAPATH_NODES: DatapathNodeDef[] = [
  { id: 'ctrl', labelKey: 'cpu.blockControl', label: 'Control', x: 40, y: 24, w: 150, h: 88 },
  { id: 'pc', labelKey: 'cpu.blockPc', label: 'PC', moduleKey: 'reg_8', x: 40, y: 180, w: 130, h: 72 },
  { id: 'mem', labelKey: 'cpu.blockMem', label: 'RAM 16×8', moduleKey: 'ram_16x8', x: 280, y: 160, w: 160, h: 110 },
  { id: 'ir', labelKey: 'cpu.blockIr', label: 'IR', moduleKey: 'reg_8', x: 540, y: 40, w: 130, h: 72 },
  { id: 'imm', labelKey: 'cpu.blockImm', label: 'IMM', moduleKey: 'reg_8', x: 540, y: 180, w: 130, h: 72 },
  { id: 'rf', labelKey: 'cpu.blockRf', label: 'RegFile 8×8', moduleKey: 'regfile_8x8', x: 40, y: 380, w: 170, h: 150 },
  { id: 'alu', labelKey: 'cpu.blockAlu', label: 'ALU', moduleKey: 'alu_8', x: 320, y: 400, w: 150, h: 120 },
  { id: 'flags', labelKey: 'cpu.blockFlags', label: 'Flags Z/C', x: 560, y: 440, w: 120, h: 72 },
  { id: 'wb', labelKey: 'cpu.blockWb', label: 'WB mux', moduleKey: 'mux_2_1_8', x: 740, y: 200, w: 130, h: 88 },
]

export const DATAPATH_EDGES: DatapathEdgeDef[] = [
  // Data / address path (middle corridor)
  {
    id: 'pc->mem_addr',
    source: 'pc',
    target: 'mem',
    label: 'addr',
    sourceHandle: 'out-r1',
    targetHandle: 'in-l1',
    offset: 0,
  },
  {
    id: 'mem->ir',
    source: 'mem',
    target: 'ir',
    label: 'data',
    sourceHandle: 'out-r1',
    targetHandle: 'in-l2',
    offset: -12,
  },
  {
    id: 'mem->imm',
    source: 'mem',
    target: 'imm',
    label: 'data',
    sourceHandle: 'out-r2',
    targetHandle: 'in-l1',
    offset: 12,
  },
  {
    id: 'imm->mem_addr',
    source: 'imm',
    target: 'mem',
    label: 'addr',
    sourceHandle: 'out-b',
    targetHandle: 'in-b',
    offset: 28,
  },
  {
    id: 'imm->wb',
    source: 'imm',
    target: 'wb',
    label: 'imm',
    sourceHandle: 'out-r1',
    targetHandle: 'in-l1',
    offset: 0,
  },
  {
    id: 'mem->wb',
    source: 'mem',
    target: 'wb',
    label: 'Q',
    sourceHandle: 'out-r3',
    targetHandle: 'in-l2',
    offset: 36,
  },

  // PC / control (left column + top corridor)
  {
    id: 'ctrl->pc_inc',
    source: 'ctrl',
    target: 'pc',
    label: 'inc',
    sourceHandle: 'out-b',
    targetHandle: 'in-t',
    offset: -16,
  },
  {
    id: 'ctrl->pc_load',
    source: 'ctrl',
    target: 'pc',
    label: 'load',
    sourceHandle: 'out-b',
    targetHandle: 'in-t',
    offset: 0,
  },
  {
    id: 'ctrl->fetch',
    source: 'ctrl',
    target: 'pc',
    label: 'fetch',
    sourceHandle: 'out-b',
    targetHandle: 'in-t',
    offset: 16,
  },
  {
    id: 'imm->pc',
    source: 'imm',
    target: 'pc',
    label: 'target',
    sourceHandle: 'out-b',
    targetHandle: 'in-b',
    offset: 48,
  },

  // Control → mem / alu / wb / rf (route above / around, not through cards)
  {
    id: 'ctrl->mem',
    source: 'ctrl',
    target: 'mem',
    label: 'ctl',
    sourceHandle: 'out-r1',
    targetHandle: 'in-t',
    offset: -20,
  },
  {
    id: 'ctrl->mem_read',
    source: 'ctrl',
    target: 'mem',
    label: 'OE',
    sourceHandle: 'out-r2',
    targetHandle: 'in-t',
    offset: 0,
  },
  {
    id: 'ctrl->mem_we',
    source: 'ctrl',
    target: 'mem',
    label: 'WE',
    sourceHandle: 'out-r3',
    targetHandle: 'in-t',
    offset: 20,
  },
  {
    id: 'ctrl->alu',
    source: 'ctrl',
    target: 'alu',
    label: 'OP',
    sourceHandle: 'out-r2',
    targetHandle: 'in-t',
    offset: 40,
  },
  {
    id: 'ctrl->wb',
    source: 'ctrl',
    target: 'wb',
    label: 'sel',
    sourceHandle: 'out-r1',
    targetHandle: 'in-t',
    offset: -36,
  },
  {
    id: 'ctrl->rf_we',
    source: 'ctrl',
    target: 'rf',
    label: 'WE',
    sourceHandle: 'out-b',
    targetHandle: 'in-t',
    offset: -40,
  },
  {
    id: 'flags->ctrl',
    source: 'flags',
    target: 'ctrl',
    label: 'Z/C',
    sourceHandle: 'out-t',
    targetHandle: 'in-r',
    offset: 60,
  },

  // RegFile / ALU / WB (bottom corridor)
  {
    id: 'rf_a->alu',
    source: 'rf',
    target: 'alu',
    label: 'A',
    sourceHandle: 'out-r1',
    targetHandle: 'in-l1',
    offset: -10,
  },
  {
    id: 'rf_b->alu',
    source: 'rf',
    target: 'alu',
    label: 'B',
    sourceHandle: 'out-r2',
    targetHandle: 'in-l2',
    offset: 10,
  },
  {
    id: 'rf_a->mem_d',
    source: 'rf',
    target: 'mem',
    label: 'D',
    sourceHandle: 'out-t',
    targetHandle: 'in-b',
    offset: 0,
  },
  {
    id: 'rf_b->wb',
    source: 'rf',
    target: 'wb',
    label: 'Rs',
    sourceHandle: 'out-r3',
    targetHandle: 'in-b',
    offset: 52,
  },
  {
    id: 'alu->wb',
    source: 'alu',
    target: 'wb',
    label: 'Y',
    sourceHandle: 'out-r1',
    targetHandle: 'in-l3',
    offset: 20,
  },
  {
    id: 'wb->rf',
    source: 'wb',
    target: 'rf',
    label: 'WD',
    sourceHandle: 'out-b',
    targetHandle: 'in-b',
    offset: 72,
  },
]

export function busLinesForNode(
  nodeId: string,
  buses: Record<string, number>,
  regs: Uint8Array,
  mem: Uint8Array,
  pc: number,
  ir: number,
  imm: number,
  z: number,
  c: number,
  phase: string,
): string[] {
  switch (nodeId) {
    case 'pc':
      return [`PC=0x${pc.toString(16).toUpperCase().padStart(2, '0')}`]
    case 'ir':
      return [`IR=0x${ir.toString(16).toUpperCase().padStart(2, '0')}`]
    case 'imm':
      return [`IMM=0x${imm.toString(16).toUpperCase().padStart(2, '0')}`]
    case 'ctrl':
      return [`phase=${phase}`]
    case 'flags':
      return [`Z=${z}`, `C=${c}`]
    case 'rf':
      return Array.from({ length: 8 }, (_, i) => `R${i}=${regs[i]!.toString(16).padStart(2, '0')}`)
    case 'mem': {
      const lines = [`size=16`]
      if (buses.MEM_ADDR != null) lines.push(`A=0x${buses.MEM_ADDR.toString(16)}`)
      if (buses.MEM_Q != null) lines.push(`Q=0x${buses.MEM_Q.toString(16)}`)
      if (buses.MEM_D != null) lines.push(`D=0x${buses.MEM_D.toString(16)}`)
      lines.push(
        [...mem.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(' '),
      )
      return lines
    }
    case 'alu':
      return [
        buses.ALU_A != null ? `A=0x${buses.ALU_A.toString(16)}` : '',
        buses.ALU_B != null ? `B=0x${buses.ALU_B.toString(16)}` : '',
        buses.ALU_Y != null ? `Y=0x${buses.ALU_Y.toString(16)}` : '',
      ].filter(Boolean)
    case 'wb':
      return buses.WB_DATA != null ? [`data=0x${buses.WB_DATA.toString(16)}`] : []
    default:
      return []
  }
}
