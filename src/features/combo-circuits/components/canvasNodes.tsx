import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GateSymbol } from '@/features/logic-gates/components/GateSymbol'
import type { LogicGate } from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import type { Bit } from '../types'

/** Selection neighborhood role — distinct from sim amber/emerald. */
export type NodeHighlight = 'focus' | 'neighbor'

export type IoNodeData = {
  role: 'in' | 'out'
  label: string
  pinId: string
  bit?: Bit
  /** Click input pin to toggle simulation level */
  onToggle?: () => void
  highlight?: NodeHighlight
}

export type DeviceNodeData = {
  label: string
  inputs: { id: string; name: string }[]
  outputs: { id: string; name: string }[]
  gate?: Pick<LogicGate, 'builtinKey' | 'inputs' | 'outputs' | 'name'>
  moduleKey?: string
  circuitId?: string
  drillable?: boolean
  /** Explicit drill affordance (also available via node double-click). */
  onDrill?: () => void
  inputBits?: Record<string, Bit>
  outputBits?: Record<string, Bit>
  highlight?: NodeHighlight
}

function highlightClass(highlight: NodeHighlight | undefined) {
  if (highlight === 'focus') {
    return 'border-indigo-500 ring-2 ring-indigo-500/80 bg-indigo-500/10'
  }
  if (highlight === 'neighbor') {
    return 'border-indigo-400/80 ring-2 ring-indigo-400/50 bg-indigo-500/5'
  }
  return undefined
}

function bitClass(bit: Bit | undefined, role: 'in' | 'out') {
  if (bit === 1) {
    return role === 'in'
      ? 'border-amber-500/70 bg-amber-500/15 ring-1 ring-amber-500/40'
      : 'border-emerald-500/70 bg-emerald-500/15 ring-1 ring-emerald-500/40'
  }
  if (bit === 0) {
    return 'border-muted-foreground/30'
  }
  return role === 'in' ? 'border-sky-500/40' : 'border-emerald-500/40'
}

export function IoNode({ data }: NodeProps) {
  const d = data as IoNodeData
  const isIn = d.role === 'in'
  const toggleable = isIn && !!d.onToggle
  return (
    <div
      className={cn(
        'nodrag nopan rounded-md border bg-card px-3 py-2 text-xs shadow-sm',
        bitClass(d.bit, d.role),
        highlightClass(d.highlight),
        toggleable && 'cursor-pointer select-none hover:brightness-95 active:scale-[0.98]',
      )}
      onClick={(e) => {
        if (!toggleable) return
        e.stopPropagation()
        d.onToggle?.()
      }}
      title={toggleable ? 'Click to toggle' : undefined}
    >
      <div className="font-mono font-medium">{d.label}</div>
      <div className="text-[10px] text-muted-foreground">
        {isIn ? 'IN' : 'OUT'}
        {d.bit !== undefined ? ` · ${d.bit}` : ''}
      </div>
      {isIn ? (
        <Handle
          type="source"
          position={Position.Right}
          id={d.pinId}
          className={cn('!h-2.5 !w-2.5', d.bit === 1 ? '!bg-amber-500' : '!bg-sky-500')}
        />
      ) : (
        <Handle
          type="target"
          position={Position.Left}
          id={d.pinId}
          className={cn('!h-2.5 !w-2.5', d.bit === 1 ? '!bg-emerald-500' : '!bg-emerald-700/50')}
        />
      )}
    </div>
  )
}

export function DeviceNode({ data }: NodeProps) {
  const d = data as DeviceNodeData
  const rows = Math.max(d.inputs.length, d.outputs.length, 1)
  const portAreaH = Math.max(32, rows * 20)
  const canDrill = !!(d.drillable && d.onDrill)

  return (
    <div
      className={cn(
        'relative rounded-md border bg-card px-1.5 py-1 text-xs shadow-sm',
        canDrill && 'cursor-pointer hover:border-primary/50',
        highlightClass(d.highlight),
      )}
      style={{ minWidth: 160, width: 160 }}
      title={canDrill ? 'Click ⇅ or double-click to inspect internals' : undefined}
    >
      <div className="truncate px-1 text-center text-[10px] font-medium leading-tight">
        {d.label}
      </div>
      <div className="relative" style={{ height: portAreaH }}>
        {d.gate ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-75">
            <GateSymbol gate={d.gate} width={52} height={26} />
          </div>
        ) : null}
        {canDrill ? (
          <button
            type="button"
            className="nodrag nopan absolute left-1/2 top-1/2 z-[5] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border border-transparent text-[10px] leading-none text-muted-foreground hover:border-border hover:bg-muted hover:text-primary"
            title="Inspect internals"
            aria-label="Inspect internals"
            onClick={(e) => {
              e.stopPropagation()
              d.onDrill?.()
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              d.onDrill?.()
            }}
          >
            ⇅
          </button>
        ) : null}
        {d.inputs.map((pin, i) => {
          const bit = d.inputBits?.[pin.id]
          return (
            <div
              key={pin.id}
              className="absolute left-0 z-10 font-mono text-[10px] text-muted-foreground"
              style={{ top: ((i + 0.5) / rows) * 100 + '%', transform: 'translateY(-50%)' }}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={pin.id}
                className={cn('!h-2.5 !w-2.5', bit === 1 ? '!bg-amber-500' : '!bg-sky-500')}
              />
              <span className={cn('pl-2', bit === 1 && 'text-amber-600 dark:text-amber-300')}>
                {pin.name}
              </span>
            </div>
          )
        })}
        {d.outputs.map((pin, i) => {
          const bit = d.outputBits?.[pin.id]
          return (
            <div
              key={pin.id}
              className="absolute right-0 z-10 font-mono text-[10px] text-muted-foreground"
              style={{ top: ((i + 0.5) / rows) * 100 + '%', transform: 'translateY(-50%)' }}
            >
              <span className={cn('pr-2', bit === 1 && 'text-emerald-600 dark:text-emerald-300')}>
                {pin.name}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={pin.id}
                className={cn('!h-2.5 !w-2.5', bit === 1 ? '!bg-emerald-500' : '!bg-emerald-700/50')}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const circuitNodeTypes = {
  circuitIo: IoNode,
  device: DeviceNode,
}
