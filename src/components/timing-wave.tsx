import { cn } from '@/lib/utils'

type Bit = 0 | 1

type Props = {
  bits: Bit[]
  role?: 'in' | 'out'
  className?: string
}

const SLOT_W = 24
const Y_HIGH = 5
const Y_LOW = 23
const VIEW_H = 28

function wavePath(bits: Bit[]): string {
  if (bits.length === 0) return ''
  let d = `M 0 ${bits[0] === 1 ? Y_HIGH : Y_LOW}`
  for (let i = 0; i < bits.length; i += 1) {
    const y = bits[i] === 1 ? Y_HIGH : Y_LOW
    const x0 = i * SLOT_W
    const x1 = (i + 1) * SLOT_W
    if (i > 0 && bits[i] !== bits[i - 1]) {
      d += ` L ${x0} ${bits[i - 1] === 1 ? Y_HIGH : Y_LOW} L ${x0} ${y}`
    }
    d += ` L ${x1} ${y}`
  }
  return d
}

/** Filled bands under logic-1 segments so a flat high is not confused with low. */
function highBands(bits: Bit[]): { x: number; w: number }[] {
  const bands: { x: number; w: number }[] = []
  let i = 0
  while (i < bits.length) {
    if (bits[i] !== 1) {
      i += 1
      continue
    }
    const start = i
    while (i < bits.length && bits[i] === 1) i += 1
    bands.push({ x: start * SLOT_W, w: (i - start) * SLOT_W })
  }
  return bands
}

/**
 * Digital timing trace with high/low guides, high-level fill, and 0/1 rails
 * so a constant level is still readable.
 */
export function TimingWave({ bits, role = 'out', className }: Props) {
  const width = Math.max(bits.length * SLOT_W, SLOT_W)
  const stroke = role === 'in' ? '#f59e0b' : '#10b981'
  const fill = role === 'in' ? 'rgba(245, 158, 11, 0.28)' : 'rgba(16, 185, 129, 0.28)'
  const guide = 'currentColor'

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-1', className)}>
      <div className="flex h-7 w-3 shrink-0 flex-col justify-between py-0.5 font-mono text-[9px] leading-none text-muted-foreground">
        <span>1</span>
        <span>0</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${VIEW_H}`}
        className="h-7 w-full text-muted-foreground/40"
        preserveAspectRatio="none"
      >
        <line
          x1={0}
          y1={Y_HIGH}
          x2={width}
          y2={Y_HIGH}
          stroke={guide}
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          y1={Y_LOW}
          x2={width}
          y2={Y_LOW}
          stroke={guide}
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
        {highBands(bits).map((b) => (
          <rect
            key={b.x}
            x={b.x}
            y={Y_HIGH}
            width={b.w}
            height={Y_LOW - Y_HIGH}
            fill={fill}
          />
        ))}
        <path
          d={wavePath(bits)}
          fill="none"
          stroke={stroke}
          strokeWidth={2.25}
          strokeLinejoin="miter"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
