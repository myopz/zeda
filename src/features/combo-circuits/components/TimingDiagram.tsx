import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TimingWave } from '@/components/timing-wave'
import { Button } from '@/components/ui/button'
import type { LogicGate } from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import type { Bit, ComboCircuit } from '../types'
import { evaluateCircuit, NetlistError } from '../lib/netlist'
import { makeGateResolver } from '../lib/truth-table'

const MAX_SLOTS = 32

type Props = {
  circuit: ComboCircuit
  gates: LogicGate[]
  circuits?: ComboCircuit[]
  className?: string
}

function defaultSlot(circuit: ComboCircuit): Record<string, Bit> {
  const slot: Record<string, Bit> = {}
  for (const p of circuit.inputs) slot[p.id] = 0
  return slot
}

/** Hold base inputs; toggle one drive pin across half-cycles. */
function buildToggleStimulus(
  base: Record<string, Bit>,
  drivePinId: string | undefined,
  halfCycles: number,
): Record<string, Bit>[] {
  const slots: Record<string, Bit>[] = []
  const n = Math.min(halfCycles, MAX_SLOTS)
  for (let i = 0; i < n; i += 1) {
    const slot = { ...base }
    if (drivePinId) slot[drivePinId] = (i % 2 === 0 ? 0 : 1) as Bit
    slots.push(slot)
  }
  return slots
}

export function TimingDiagram({
  circuit,
  gates,
  circuits = [],
  className,
}: Props) {
  const { t } = useTranslation()
  const [steps, setSteps] = useState(8)
  const [base, setBase] = useState(() => defaultSlot(circuit))
  const [drivePinId, setDrivePinId] = useState(
    () => circuit.inputs[0]?.id ?? '',
  )

  useEffect(() => {
    setBase(defaultSlot(circuit))
    setDrivePinId(circuit.inputs[0]?.id ?? '')
  }, [circuit.id])

  const resolveGate = useMemo(() => makeGateResolver(gates), [gates])
  const resolveCircuit = useMemo(() => {
    const map = new Map(circuits.map((c) => [c.id, c]))
    map.set(circuit.id, circuit)
    return (id: string) => map.get(id)
  }, [circuits, circuit])

  const result = useMemo(() => {
    try {
      const slots = buildToggleStimulus(base, drivePinId || undefined, steps)
      const samples: { inputs: Record<string, Bit>; outputs: Record<string, Bit> }[] =
        []
      for (const slot of slots) {
        const r = evaluateCircuit(circuit, slot, resolveGate, resolveCircuit)
        samples.push({ inputs: slot, outputs: r.outputs })
      }
      return { ok: true as const, samples }
    } catch (err) {
      return {
        ok: false as const,
        message:
          err instanceof NetlistError || err instanceof Error
            ? err.message
            : String(err),
      }
    }
  }, [circuit, base, drivePinId, steps, resolveGate, resolveCircuit])

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
          {t('circuits.timingSteps')}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={steps <= 2}
          onClick={() => setSteps((c) => Math.max(2, c - 2))}
        >
          −
        </Button>
        <span className="font-mono text-sm">{steps}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={steps >= MAX_SLOTS}
          onClick={() => setSteps((c) => Math.min(MAX_SLOTS, c + 2))}
        >
          +
        </Button>
      </div>

      {circuit.inputs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('circuits.timingDrivePin')}
          </span>
          {circuit.inputs.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={drivePinId === p.id ? 'default' : 'outline'}
              className="font-mono"
              onClick={() => setDrivePinId(p.id)}
            >
              {p.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">
          {t('circuits.timingBaseInputs')}
        </span>
        {circuit.inputs
          .filter((p) => p.id !== drivePinId)
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
          {t('circuits.simError', { message: result.message })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card p-3">
          <div className="min-w-[480px] space-y-2">
            {tracks.map((track) => (
              <div key={track.id} className="flex items-center gap-2">
                <div className="w-14 shrink-0 font-mono text-[10px] text-muted-foreground">
                  {track.label}
                </div>
                <TimingWave bits={track.bits} role={track.role} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
