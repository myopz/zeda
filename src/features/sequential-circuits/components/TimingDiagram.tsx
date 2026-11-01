import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TimingWave } from '@/components/timing-wave'
import { Button } from '@/components/ui/button'
import type { ComboCircuit } from '@/features/combo-circuits/types'
import type { LogicGate } from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import type { Bit, SequentialCircuit } from '../types'
import {
  applyFixedInputDrives,
  defaultBitForPin,
  isClockDrive,
  isFixedDrive,
  resolvePinDrive,
} from '../lib/pin-drive'
import {
  applyPresentStateBits,
  listPresentStateOutputs,
} from '../lib/present-state'
import {
  createInitialSeqSimState,
  evaluateSequentialCircuit,
  SeqSimError,
  type GateResolver,
} from '../lib/seq-sim'

const MAX_SLOTS = 32

type Props = {
  circuit: SequentialCircuit
  gates: LogicGate[]
  circuits?: SequentialCircuit[]
  comboCircuits?: ComboCircuit[]
  className?: string
}

function defaultPresentBits(circuit: SequentialCircuit): Record<string, Bit> {
  const next: Record<string, Bit> = {}
  for (const p of listPresentStateOutputs(circuit)) next[p.id] = 0
  return next
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

function defaultSlot(circuit: SequentialCircuit): Record<string, Bit> {
  const slot: Record<string, Bit> = {}
  for (const p of circuit.inputs) {
    slot[p.id] = defaultBitForPin(p)
  }
  return applyFixedInputDrives(circuit.inputs, slot)
}

/**
 * Build stimulus from pin drives:
 * - clk: alternate 0/1 each half-cycle
 * - vcc / gnd: constant 1 / 0
 * - signal: hold base level
 */
function buildDriveStimulus(
  circuit: SequentialCircuit,
  base: Record<string, Bit>,
  cycles: number,
): Record<string, Bit>[] {
  const clkPins = circuit.inputs.filter((p) => isClockDrive(resolvePinDrive(p)))
  const slots: Record<string, Bit>[] = []
  for (let i = 0; i < cycles * 2 && slots.length < MAX_SLOTS; i += 1) {
    const slot = applyFixedInputDrives(circuit.inputs, { ...base })
    const phase = (i % 2 === 0 ? 0 : 1) as Bit
    for (const clk of clkPins) {
      slot[clk.id] = phase
    }
    slots.push(slot)
  }
  return slots
}

export function TimingDiagram({
  circuit,
  gates,
  circuits = [],
  comboCircuits = [],
  className,
}: Props) {
  const { t } = useTranslation()
  const [cycles, setCycles] = useState(8)
  const [base, setBase] = useState(() => defaultSlot(circuit))
  const [presentBits, setPresentBits] = useState(() =>
    defaultPresentBits(circuit),
  )

  const presentPins = useMemo(
    () => listPresentStateOutputs(circuit),
    [circuit],
  )

  useEffect(() => {
    setBase(defaultSlot(circuit))
    setPresentBits(defaultPresentBits(circuit))
  }, [circuit.id, circuit.inputs, circuit.outputs, circuit.nodes, circuit.wires])

  const resolveGate = useMemo(() => resolveGateFactory(gates), [gates])

  const result = useMemo(() => {
    try {
      const slots = buildDriveStimulus(circuit, base, cycles)
      const resolveCircuit = (cid: string) => circuits.find((c) => c.id === cid)
      const resolveCombo = (cid: string) =>
        comboCircuits.find((c) => c.id === cid)
      let sim = applyPresentStateBits(
        circuit,
        createInitialSeqSimState(circuit, resolveCircuit),
        presentBits,
      )
      const samples: { inputs: Record<string, Bit>; outputs: Record<string, Bit> }[] =
        []
      const warnings: string[] = []
      for (const slot of slots) {
        const r = evaluateSequentialCircuit(
          circuit,
          slot,
          sim,
          resolveGate,
          resolveCircuit,
          resolveCombo,
        )
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
  }, [
    circuit,
    base,
    presentBits,
    cycles,
    resolveGate,
    circuits,
    comboCircuits,
  ])

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
    setBase((prev) =>
      applyFixedInputDrives(circuit.inputs, {
        ...prev,
        [pinId]: prev[pinId] === 1 ? 0 : 1,
      }),
    )
  }

  const togglePresent = (pinId: string) => {
    setPresentBits((prev) => ({
      ...prev,
      [pinId]: prev[pinId] === 1 ? 0 : 1,
    }))
  }

  const stimPins = circuit.inputs.filter((p) => {
    const d = resolvePinDrive(p)
    return !isClockDrive(d) && !isFixedDrive(d)
  })

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {t('sequential.timingCycles')}
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
      </div>

      {stimPins.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">
            {t('sequential.timingBaseInputs')}
          </span>
          {stimPins.map((p) => (
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
      ) : null}

      {presentPins.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">
            {t('sequential.timingInitialState')}
          </span>
          {presentPins.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant="outline"
              className="font-mono"
              onClick={() => togglePresent(p.id)}
            >
              {p.name}={presentBits[p.id] ?? 0}
            </Button>
          ))}
        </div>
      ) : null}

      {!result.ok ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('sequential.simError', { message: result.message })}
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
                  <TimingWave bits={track.bits} role={track.role} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
