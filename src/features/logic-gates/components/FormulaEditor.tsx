import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { GatePin } from '../types'

type Props = {
  outputs: GatePin[]
  formulas: Record<string, string>
  readOnly?: boolean
  error?: string | null
  onChange?: (outputId: string, formula: string) => void
}

export function FormulaEditor({
  outputs,
  formulas,
  readOnly,
  error,
  onChange,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      {outputs.map((out) => (
        <div key={out.id} className="space-y-1.5">
          <Label htmlFor={`formula-${out.id}`}>
            {t('gates.formula')} · {out.name}
          </Label>
          <Textarea
            id={`formula-${out.id}`}
            value={formulas[out.id] ?? ''}
            readOnly={readOnly}
            disabled={readOnly}
            className="font-mono"
            rows={2}
            onChange={(e) => onChange?.(out.id, e.target.value)}
          />
        </div>
      ))}
      {error ? (
        <p className="text-sm text-destructive">
          {t('gates.formulaError', { message: error })}
        </p>
      ) : null}
    </div>
  )
}
