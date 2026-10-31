import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GateSymbol } from '@/features/logic-gates/components/GateSymbol'
import type { LogicGate } from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import type { Bit } from '../types'

export type IoNodeData = {
  role: 'in' | 'out'
  label: string
  pinId: string
  bit?: Bit
  /** Click input pin to toggle simulation level */
  onToggle?: () => void
}

export type DeviceNodeData = {
  label: string
  inputs: { id: string; name: string }[]
  outputs: { id: string; name: string }[]
  gate?: Pick<LogicGate, 'builtinKey' | 'inputs' | 'outputs' | 'name'>
  moduleKey?: string
  drillable?: boolean
  inputBits?: Record<string, Bit>
  outputBits?: Record<string, Bit>
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
        'rounded-md border bg-card px-3 py-2 text-xs shadow-sm',
        bitClass(d.bit, d.role),
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

  return (
    <div
      className={cn(
        'relative rounded-md border bg-card px-1.5 py-1 text-xs shadow-sm',
        d.drillable && 'cursor-pointer hover:border-primary/50',
      )}
      style={{ minWidth: 160, width: 160 }}
      title={d.drillable ? 'Double-click to inspect internals' : undefined}
    >
      <div className="truncate px-1 text-center text-[10px] font-medium leading-tight">
        {d.label}
      </div>
      <div className="relative" style={{ height: portAreaH }}>
        {d.gate ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-75">
            <GateSymbol gate={d.gate} width={52} height={26} />
          </div>
        ) : d.drillable ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] text-muted-foreground">
            ⇅
          </div>
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
