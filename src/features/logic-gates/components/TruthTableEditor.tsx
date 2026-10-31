import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { Bit, GatePin } from '../types'

type Props = {
  inputs: GatePin[]
  outputs: GatePin[]
  rows: Record<string, Bit>[]
  readOnly?: boolean
  onToggleOutput?: (rowIndex: number, outputId: string) => void
}

export function TruthTableEditor({
  inputs,
  outputs,
  rows,
  readOnly,
  onToggleOutput,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-muted/60">
          <tr>
            {inputs.map((pin) => (
              <th key={pin.id} className="border-b px-3 py-2 text-left font-medium">
                {pin.name}
              </th>
            ))}
            {outputs.map((pin) => (
              <th
                key={pin.id}
                className="border-b border-l px-3 py-2 text-left font-medium text-primary"
              >
                {pin.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="odd:bg-background even:bg-muted/20">
              {inputs.map((pin) => (
                <td key={pin.id} className="px-3 py-1.5 font-mono">
                  {row[pin.id]}
                </td>
              ))}
              {outputs.map((pin) => {
                const bit = row[pin.id] ?? 0
                return (
                  <td key={pin.id} className="border-l px-2 py-1">
                    <button
                      type="button"
                      disabled={readOnly}
                      title={t('gates.toggleBit')}
                      onClick={() => onToggleOutput?.(ri, pin.id)}
                      className={cn(
                        'inline-flex h-7 w-10 items-center justify-center rounded font-mono text-sm',
                        bit
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground',
                        !readOnly && 'hover:ring-2 hover:ring-ring',
                        readOnly && 'cursor-default',
                      )}
                    >
                      {bit}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
