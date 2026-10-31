import type { ReactNode } from 'react'
import type { BuiltinKey, LogicGate } from '../types'
import { cn } from '@/lib/utils'

type Props = {
  gate: Pick<LogicGate, 'builtinKey' | 'inputs' | 'outputs' | 'name'>
  className?: string
  width?: number
  height?: number
}

function AndBody({ w, h }: { w: number; h: number }) {
  return (
    <path
      d={`M ${w * 0.2} ${h * 0.2} H ${w * 0.45} C ${w * 0.75} ${h * 0.2}, ${w * 0.75} ${h * 0.8}, ${w * 0.45} ${h * 0.8} H ${w * 0.2} Z`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  )
}

function OrBody({ w, h }: { w: number; h: number }) {
  return (
    <path
      d={`M ${w * 0.18} ${h * 0.2}
          Q ${w * 0.35} ${h * 0.5}, ${w * 0.18} ${h * 0.8}
          Q ${w * 0.5} ${h * 0.78}, ${w * 0.72} ${h * 0.5}
          Q ${w * 0.5} ${h * 0.22}, ${w * 0.18} ${h * 0.2} Z`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  )
}

function TwoInOut({
  w,
  h,
  inX = 0.2,
  outX = 0.7,
}: {
  w: number
  h: number
  inX?: number
  outX?: number
}) {
  return (
    <>
      <line x1={w * 0.05} y1={h * 0.35} x2={w * inX} y2={h * 0.35} stroke="currentColor" strokeWidth="2" />
      <line x1={w * 0.05} y1={h * 0.65} x2={w * inX} y2={h * 0.65} stroke="currentColor" strokeWidth="2" />
      <line x1={w * outX} y1={h * 0.5} x2={w * 0.95} y2={h * 0.5} stroke="currentColor" strokeWidth="2" />
    </>
  )
}

function Bubble({ w, h, cx }: { w: number; h: number; cx: number }) {
  return (
    <circle
      cx={w * cx}
      cy={h * 0.5}
      r={w * 0.045}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  )
}

function AndSymbol({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <AndBody w={w} h={h} />
      <TwoInOut w={w} h={h} />
    </g>
  )
}

function NandSymbol({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <AndBody w={w} h={h} />
      <TwoInOut w={w} h={h} outX={0.78} />
      <Bubble w={w} h={h} cx={0.74} />
    </g>
  )
}

function OrSymbol({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <OrBody w={w} h={h} />
      <TwoInOut w={w} h={h} inX={0.28} outX={0.72} />
    </g>
  )
}

function NorSymbol({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <OrBody w={w} h={h} />
      <TwoInOut w={w} h={h} inX={0.28} outX={0.82} />
      <Bubble w={w} h={h} cx={0.77} />
    </g>
  )
}

function XorSymbol({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <path
        d={`M ${w * 0.12} ${h * 0.2} Q ${w * 0.28} ${h * 0.5}, ${w * 0.12} ${h * 0.8}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <OrBody w={w} h={h} />
      <TwoInOut w={w} h={h} inX={0.22} outX={0.72} />
    </g>
  )
}

function XnorSymbol({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <path
        d={`M ${w * 0.12} ${h * 0.2} Q ${w * 0.28} ${h * 0.5}, ${w * 0.12} ${h * 0.8}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <OrBody w={w} h={h} />
      <TwoInOut w={w} h={h} inX={0.22} outX={0.82} />
      <Bubble w={w} h={h} cx={0.77} />
    </g>
  )
}

function NotSymbol({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <path
        d={`M ${w * 0.25} ${h * 0.22} L ${w * 0.25} ${h * 0.78} L ${w * 0.68} ${h * 0.5} Z`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <Bubble w={w} h={h} cx={0.74} />
      <line x1={w * 0.05} y1={h * 0.5} x2={w * 0.25} y2={h * 0.5} stroke="currentColor" strokeWidth="2" />
      <line x1={w * 0.79} y1={h * 0.5} x2={w * 0.95} y2={h * 0.5} stroke="currentColor" strokeWidth="2" />
    </g>
  )
}

function CustomSymbol({
  w,
  h,
  label,
  inCount,
  outCount,
}: {
  w: number
  h: number
  label: string
  inCount: number
  outCount: number
}) {
  const bodyX = w * 0.28
  const bodyW = w * 0.4
  const bodyY = h * 0.18
  const bodyH = h * 0.64
  return (
    <g>
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={4}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <text
        x={bodyX + bodyW / 2}
        y={h * 0.52}
        textAnchor="middle"
        fontSize={Math.max(9, w * 0.1)}
        fill="currentColor"
      >
        {label.slice(0, 6)}
      </text>
      {Array.from({ length: Math.max(inCount, 1) }, (_, i) => {
        const y = bodyY + ((i + 1) * bodyH) / (Math.max(inCount, 1) + 1)
        return (
          <line
            key={`in-${i}`}
            x1={w * 0.05}
            y1={y}
            x2={bodyX}
            y2={y}
            stroke="currentColor"
            strokeWidth="2"
          />
        )
      })}
      {Array.from({ length: Math.max(outCount, 1) }, (_, i) => {
        const y = bodyY + ((i + 1) * bodyH) / (Math.max(outCount, 1) + 1)
        return (
          <line
            key={`out-${i}`}
            x1={bodyX + bodyW}
            y1={y}
            x2={w * 0.95}
            y2={y}
            stroke="currentColor"
            strokeWidth="2"
          />
        )
      })}
    </g>
  )
}

const BUILTIN_SYMBOLS: Record<
  BuiltinKey,
  (props: { w: number; h: number }) => ReactNode
> = {
  and: AndSymbol,
  or: OrSymbol,
  not: NotSymbol,
  nand: NandSymbol,
  nor: NorSymbol,
  xor: XorSymbol,
  xnor: XnorSymbol,
}

export function GateSymbol({ gate, className, width = 96, height = 64 }: Props) {
  const Symbol = gate.builtinKey ? BUILTIN_SYMBOLS[gate.builtinKey] : null
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('text-foreground', className)}
      aria-hidden
    >
      {Symbol ? (
        <Symbol w={width} h={height} />
      ) : (
        <CustomSymbol
          w={width}
          h={height}
          label={gate.name}
          inCount={gate.inputs.length}
          outCount={gate.outputs.length}
        />
      )}
    </svg>
  )
}
