import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { LogicGate } from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import type { Bit, FlipFlopCircuit } from '../types'
import {
  createInitialSimState,
  evaluateSequential,
  SeqSimError,
  type GateResolver,
} from '../lib/seq-sim'

const MAX_SLOTS = 32

type Props = {
  circuit: FlipFlopCircuit
  gates: LogicGate[]
  className?: string
}

function resolveGateFactory(gates: LogicGate[]): GateResolver {
  const byId = new Map(gates.map((g) => [g.id, g]))
  const byKey = new Map<string, LogicGate>()
  for (const g of gates) {
    if (g.builtinKey) byKey.set(g.builtinKey, g)
  }
  return (node) => {
    if (node.ref.builtinKey) return byKey.get(node.ref.builtinKey)
    if (node.ref.gateId) return byId.get(node.ref.gateId)
    return undefined
  }
}

function defaultSlot(circuit: FlipFlopCircuit): Record<string, Bit> {
  const slot: Record<string, Bit> = {}
  for (const p of circuit.inputs) {
    // Active-low async default high
    slot[p.id] = p.name.includes('nPRE') || p.name.includes('nCLR') ? 1 : 0
  }
  return slot
}

/** Build a simple clocked stimulus: alternate CLK, hold other inputs from base. */
function buildClockStimulus(
  circuit: FlipFlopCircuit,
  base: Record<string, Bit>,
  cycles: number,
): Record<string, Bit>[] {
  const clkPin = circuit.inputs.find(
    (p) => p.name === 'CLK' || p.name.endsWith('CLK') || p.name === 'EN',
  )
  const slots: Record<string, Bit>[] = []
  for (let i = 0; i < cycles * 2 && slots.length < MAX_SLOTS; i += 1) {
    const slot = { ...base }
    if (clkPin) slot[clkPin.id] = (i % 2 === 0 ? 0 : 1) as Bit
    slots.push(slot)
  }
  return slots
}

export function TimingDiagram({ circuit, gates, className }: Props) {
  const { t } = useTranslation()
  const [cycles, setCycles] = useState(8)
  const [base, setBase] = useState(() => defaultSlot(circuit))
  const [runKey, setRunKey] = useState(0)

  const resolveGate = useMemo(() => resolveGateFactory(gates), [gates])

  const result = useMemo(() => {
    void runKey
    try {
      const slots = buildClockStimulus(circuit, base, cycles)
      let sim = createInitialSimState(circuit)
      const samples: { inputs: Record<string, Bit>; outputs: Record<string, Bit> }[] =
        []
      const warnings: string[] = []
      for (const slot of slots) {
        const r = evaluateSequential(circuit, slot, sim, resolveGate)
        samples.push({ inputs: slot, outputs: r.outputs })
        warnings.push(...r.warnings)
        sim = { ffState: r.ffState, prevClk: r.prevClk }
      }
      return { ok: true as const, samples, warnings }
    } catch (err) {
      return {
        ok: false as const,
        message:
          err instanceof SeqSimError || err instanceof Error
            ? err.message
            : String(err),
      }
    }
  }, [circuit, base, cycles, resolveGate, runKey])

  const tracks = useMemo(() => {
    if (!result.ok) return []
    const names: { id: string; label: string; role: 'in' | 'out' }[] = [
      ...circuit.inputs.map((p) => ({ id: p.id, label: p.name, role: 'in' as const })),
      ...circuit.outputs.map((p) => ({
        id: p.id,
        label: p.name,
        role: 'out' as const,
      })),
    ]
    return names.map((track) => {
      const bits: Bit[] = result.samples.map((s) =>
        track.role === 'in'
          ? (s.inputs[track.id] ?? 0)
          : (s.outputs[track.id] ?? 0),
      )
      return { ...track, bits }
    })
  }, [result, circuit])

  const toggleBase = (pinId: string) => {
    setBase((prev) => ({ ...prev, [pinId]: prev[pinId] === 1 ? 0 : 1 }))
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {t('flipflops.timingCycles')}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={cycles <= 2}
          onClick={() => setCycles((c) => Math.max(2, c - 2))}
        >
          −
        </Button>
        <span className="font-mono text-sm">{cycles}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={cycles >= MAX_SLOTS / 2}
          onClick={() => setCycles((c) => Math.min(MAX_SLOTS / 2, c + 2))}
        >
          +
        </Button>
        <Button type="button" size="sm" onClick={() => setRunKey((k) => k + 1)}>
          {t('flipflops.timingRun')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">
          {t('flipflops.timingBaseInputs')}
        </span>
        {circuit.inputs
          .filter((p) => p.name !== 'CLK' && !p.name.endsWith('CLK') && p.name !== 'EN')
          .map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant="outline"
              className="font-mono"
              onClick={() => toggleBase(p.id)}
            >
              {p.name}={base[p.id] ?? 0}
            </Button>
          ))}
      </div>

      {!result.ok ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('flipflops.simError', { message: result.message })}
        </div>
      ) : (
        <>
          {result.warnings.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              {[...new Set(result.warnings)].join(' · ')}
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-lg border bg-card p-3">
            <div className="min-w-[480px] space-y-2">
              {tracks.map((track) => (
                <div key={track.id} className="flex items-center gap-2">
                  <div className="w-14 shrink-0 font-mono text-[10px] text-muted-foreground">
                    {track.label}
                  </div>
                  <svg
                    viewBox={`0 0 ${track.bits.length * 20} 28`}
                    className="h-7 w-full"
                    preserveAspectRatio="none"
                  >
                    <path
                      d={wavePath(track.bits)}
                      fill="none"
                      stroke={track.role === 'in' ? '#f59e0b' : '#10b981'}
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function wavePath(bits: Bit[]): string {
  if (bits.length === 0) return ''
  const w = 20
  const yHigh = 6
  const yLow = 22
  let d = `M 0 ${bits[0] === 1 ? yHigh : yLow}`
  for (let i = 0; i < bits.length; i += 1) {
    const y = bits[i] === 1 ? yHigh : yLow
    const x0 = i * w
    const x1 = (i + 1) * w
    if (i > 0 && bits[i] !== bits[i - 1]) {
      d += ` L ${x0} ${bits[i - 1] === 1 ? yHigh : yLow} L ${x0} ${y}`
    }
    d += ` L ${x1} ${y}`
  }
  return d
}
