import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { evaluateOutputs } from '../lib/bool-engine'
import type { Bit, LogicGate } from '../types'
import { GateSymbol } from './GateSymbol'

type Props = {
  gate: LogicGate
  className?: string
}

export function SimCanvas({ gate, className }: Props) {
  const { t } = useTranslation()
  const pinKey = gate.inputs.map((p) => p.id).join(',')

  const initial = useMemo(() => {
    const map: Record<string, Bit> = {}
    for (const pin of gate.inputs) map[pin.id] = 0
    return map
  }, [pinKey, gate.inputs])

  const [inputs, setInputs] = useState<Record<string, Bit>>(initial)

  useEffect(() => {
    setInputs(initial)
  }, [initial])

  const outputs = evaluateOutputs(gate, inputs)

  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="mb-3 text-sm font-medium">{t('gates.simulation')}</div>
      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-2">
          {gate.inputs.map((pin) => (
            <div key={pin.id} className="flex items-center gap-2">
              <span className="w-8 font-mono text-sm">{pin.name}</span>
              <Button
                type="button"
                size="sm"
                variant={inputs[pin.id] ? 'default' : 'outline'}
                onClick={() =>
                  setInputs((prev) => ({
                    ...prev,
                    [pin.id]: prev[pin.id] === 1 ? 0 : 1,
                  }))
                }
              >
                {inputs[pin.id] === 1 ? t('gates.high') : t('gates.low')} · {inputs[pin.id]}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-1 items-center justify-center rounded-md bg-muted/40 p-4">
          <div className="relative">
            <GateSymbol gate={gate} width={180} height={120} />
            <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-around py-6 pl-1">
              {gate.inputs.map((pin) => (
                <span
                  key={pin.id}
                  className={cn(
                    'size-2.5 rounded-full',
                    inputs[pin.id] ? 'bg-emerald-500' : 'bg-zinc-400',
                  )}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-around py-6 pr-1">
              {gate.outputs.map((pin) => (
                <span
                  key={pin.id}
                  className={cn(
                    'size-2.5 rounded-full',
                    outputs[pin.id] ? 'bg-amber-400' : 'bg-zinc-400',
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {gate.outputs.map((pin) => (
            <div key={pin.id} className="flex items-center gap-2">
              <span className="w-8 font-mono text-sm">{pin.name}</span>
              <div
                className={cn(
                  'inline-flex h-8 min-w-16 items-center justify-center rounded-md border px-3 font-mono text-sm',
                  outputs[pin.id]
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {outputs[pin.id] === 1 ? t('gates.high') : t('gates.low')} · {outputs[pin.id]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
