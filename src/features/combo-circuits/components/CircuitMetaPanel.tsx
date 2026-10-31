import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { CircuitPin, ComboCircuit } from '../types'

type Props = {
  circuit: ComboCircuit
  readOnly?: boolean
  /** Content-only mode for tab host (no chrome / collapse) */
  embedded?: boolean
  onChange: (next: ComboCircuit) => void
  onInputCountChange: (count: number) => void
  onOutputCountChange: (count: number) => void
  onRenamePin: (kind: 'in' | 'out', pinId: string, name: string) => void
  className?: string
}

export function CircuitMetaPanel({
  circuit,
  readOnly,
  embedded,
  onChange,
  onInputCountChange,
  onOutputCountChange,
  onRenamePin,
  className,
}: Props) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        !embedded && 'w-[220px] border-r bg-card',
        className,
      )}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div className="space-y-1.5">
          <Label htmlFor="ckt-name">{t('circuits.name')}</Label>
          <Input
            id="ckt-name"
            value={circuit.name}
            disabled={readOnly}
            onChange={(e) =>
              onChange({ ...circuit, name: e.target.value, updatedAt: Date.now() })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ckt-desc">{t('circuits.description')}</Label>
          <Textarea
            id="ckt-desc"
            value={circuit.description ?? ''}
            disabled={readOnly}
            rows={3}
            onChange={(e) =>
              onChange({
                ...circuit,
                description: e.target.value,
                updatedAt: Date.now(),
              })
            }
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="text-sm font-medium">{t('circuits.pins')}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>{t('circuits.inputCount')}</Label>
              <Input
                type="number"
                min={1}
                value={circuit.inputs.length}
                disabled={readOnly}
                onChange={(e) => onInputCountChange(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('circuits.outputCount')}</Label>
              <Input
                type="number"
                min={1}
                value={circuit.outputs.length}
                disabled={readOnly}
                onChange={(e) => onOutputCountChange(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{t('circuits.inputs')}</div>
            {circuit.inputs.map((pin: CircuitPin) => (
              <Input
                key={pin.id}
                value={pin.name}
                disabled={readOnly}
                className="font-mono"
                onChange={(e) => onRenamePin('in', pin.id, e.target.value)}
              />
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{t('circuits.outputs')}</div>
            {circuit.outputs.map((pin: CircuitPin) => (
              <Input
                key={pin.id}
                value={pin.name}
                disabled={readOnly}
                className="font-mono"
                onChange={(e) => onRenamePin('out', pin.id, e.target.value)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
