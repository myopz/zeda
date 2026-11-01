import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { buildStateDiagram } from '../lib/state-diagram'

type Props = {
  moduleKey: string | undefined
  className?: string
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
        {t('flipflops.stateDiagramUnavailable')}
      </p>
    )
  }

  const positions: Record<string, { x: number; y: number }> = {
    q0: { x: 80, y: 100 },
    q1: { x: 280, y: 100 },
  }

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
        viewBox="0 0 400 200"
        className="h-48 w-full max-w-lg rounded-lg border bg-card"
        role="img"
        aria-label={t('flipflops.stateDiagram')}
      >
        {diagram.edges.map((e) => {
          const from = positions[e.from] ?? { x: 0, y: 0 }
          const to = positions[e.to] ?? { x: 0, y: 0 }
          const self = e.from === e.to
          if (self) {
            const x = from.x
            const y = from.y
            return (
              <g key={e.id}>
                <path
                  d={`M ${x - 18} ${y - 22} C ${x - 50} ${y - 70}, ${x + 50} ${y - 70}, ${x + 18} ${y - 22}`}
                  fill="none"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeWidth={1.5}
                  markerEnd="url(#ff-arrow)"
                />
                <text
                  x={x}
                  y={y - 78}
                  textAnchor="middle"
                  className="fill-foreground text-[9px]"
                >
                  {e.label}
                </text>
              </g>
            )
          }
          const midX = (from.x + to.x) / 2
          const midY = (from.y + to.y) / 2 - (e.from === 'q0' ? 28 : -28)
          return (
            <g key={e.id}>
              <path
                d={`M ${from.x + 28} ${from.y} Q ${midX} ${midY}, ${to.x - 28} ${to.y}`}
                fill="none"
                stroke="currentColor"
                className="text-muted-foreground"
                strokeWidth={1.5}
                markerEnd="url(#ff-arrow)"
              />
              <text
                x={midX}
                y={midY - 4}
                textAnchor="middle"
                className="fill-foreground text-[9px]"
              >
                {e.label}
              </text>
            </g>
          )
        })}
        <defs>
          <marker
            id="ff-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        {diagram.nodes.map((n) => {
          const p = positions[n.id] ?? { x: 0, y: 0 }
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={28}
                className="fill-card stroke-foreground"
                strokeWidth={1.5}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                className="fill-foreground text-xs font-medium"
              >
                {n.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
