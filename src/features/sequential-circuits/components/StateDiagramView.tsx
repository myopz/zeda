import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { buildStateDiagram } from '../lib/state-diagram'

type Props = {
  moduleKey: string | undefined
  className?: string
}

function ringPositions(
  count: number,
  cx: number,
  cy: number,
  radius: number,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}
  if (count <= 0) return positions
  if (count === 1) {
    positions.s0 = { x: cx, y: cy }
    return positions
  }
  for (let i = 0; i < count; i += 1) {
    const a = (2 * Math.PI * i) / count - Math.PI / 2
    positions[`s${i}`] = {
      x: cx + radius * Math.cos(a),
      y: cy + radius * Math.sin(a),
    }
  }
  return positions
}

export function StateDiagramView({ moduleKey, className }: Props) {
  const { t } = useTranslation()
  const diagram = useMemo(
    () => (moduleKey ? buildStateDiagram(moduleKey) : null),
    [moduleKey],
  )

  if (!moduleKey || !diagram) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        {t('sequential.stateDiagramUnavailable')}
      </p>
    )
  }

  const n = diagram.nodes.length
  const size = n <= 6 ? 360 : n <= 10 ? 420 : 520
  const cx = size / 2
  const cy = size / 2
  const radius = n <= 6 ? 110 : n <= 10 ? 140 : 190
  const nodeR = n <= 6 ? 24 : n <= 10 ? 20 : 16
  const positions = ringPositions(n, cx, cy, radius)
  const markerId = `seq-arrow-${moduleKey}`

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {diagram.equations.length > 0 ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
          {diagram.equations.map((eq) => (
            <div key={eq}>{eq}</div>
          ))}
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full max-w-xl rounded-lg border bg-card"
        role="img"
        aria-label={t('sequential.stateDiagram')}
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        {diagram.edges.map((e) => {
          const from = positions[e.from] ?? { x: cx, y: cy }
          const to = positions[e.to] ?? { x: cx, y: cy }
          const self = e.from === e.to
          if (self) {
            const dx = from.x - cx
            const dy = from.y - cy
            const len = Math.hypot(dx, dy) || 1
            const ox = (dx / len) * (nodeR + 28)
            const oy = (dy / len) * (nodeR + 28)
            const tx = from.x + ox
            const ty = from.y + oy
            return (
              <g key={e.id}>
                <path
                  d={`M ${from.x - 10} ${from.y - nodeR * 0.6} C ${tx - 18} ${ty - 8}, ${tx + 18} ${ty - 8}, ${from.x + 10} ${from.y - nodeR * 0.6}`}
                  fill="none"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeWidth={1.25}
                  markerEnd={`url(#${markerId})`}
                />
                <text
                  x={tx}
                  y={ty - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[8px]"
                >
                  {e.label}
                </text>
              </g>
            )
          }
          const dx = to.x - from.x
          const dy = to.y - from.y
          const len = Math.hypot(dx, dy) || 1
          const ux = dx / len
          const uy = dy / len
          const startX = from.x + ux * nodeR
          const startY = from.y + uy * nodeR
          const endX = to.x - ux * (nodeR + 4)
          const endY = to.y - uy * (nodeR + 4)
          // Bow outward from center for ring chords
          const midX = (startX + endX) / 2 + (-uy) * 18
          const midY = (startY + endY) / 2 + ux * 18
          return (
            <g key={e.id}>
              <path
                d={`M ${startX} ${startY} Q ${midX} ${midY}, ${endX} ${endY}`}
                fill="none"
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth={1.25}
                markerEnd={`url(#${markerId})`}
              />
              <text
                x={midX}
                y={midY - 4}
                textAnchor="middle"
                className="fill-foreground text-[8px]"
              >
                {e.label}
              </text>
            </g>
          )
        })}
        {diagram.nodes.map((node) => {
          const p = positions[node.id] ?? { x: cx, y: cy }
          const lines = node.label.split('\n')
          return (
            <g key={node.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={nodeR}
                className="fill-card stroke-foreground"
                strokeWidth={1.5}
              />
              {lines.map((line, i) => (
                <text
                  key={`${node.id}-${i}`}
                  x={p.x}
                  y={
                    p.y +
                    (lines.length === 1 ? 4 : (i - (lines.length - 1) / 2) * 10 + 3)
                  }
                  textAnchor="middle"
                  className={cn(
                    'fill-foreground font-medium',
                    lines.length > 1 ? 'text-[8px]' : 'text-[10px]',
                  )}
                >
                  {line}
                </text>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
