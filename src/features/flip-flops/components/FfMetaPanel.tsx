import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DraftNumberInput } from '@/components/ui/draft-number-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  ffGroupLabel,
  isPresetFfGroup,
  PRESET_FF_GROUPS,
  sortFfGroups,
} from '../lib/groups'
import {
  DEFAULT_FF_GROUP,
  type CircuitPin,
  type FlipFlopCircuit,
} from '../types'

const CUSTOM_SENTINEL = '__custom__'

type Props = {
  circuit: FlipFlopCircuit
  /** Existing custom group keys (presets are always listed) */
  groupOptions?: string[]
  readOnly?: boolean
  /** Content-only mode for tab host (no chrome / collapse) */
  embedded?: boolean
  onChange: (next: FlipFlopCircuit) => void
  onInputCountChange: (count: number) => void
  onOutputCountChange: (count: number) => void
  onRenamePin: (kind: 'in' | 'out', pinId: string, name: string) => void
  className?: string
}

export function FfMetaPanel({
  circuit,
  groupOptions = [],
  readOnly,
  embedded,
  onChange,
  onInputCountChange,
  onOutputCountChange,
  onRenamePin,
  className,
}: Props) {
  const { t } = useTranslation()
  const currentGroup = circuit.group || DEFAULT_FF_GROUP

  const customGroups = useMemo(() => {
    const extras = new Set<string>()
    for (const g of groupOptions) {
      if (g && !isPresetFfGroup(g)) extras.add(g)
    }
    if (!isPresetFfGroup(currentGroup)) extras.add(currentGroup)
    return sortFfGroups(extras, t)
  }, [currentGroup, groupOptions, t])

  const listedKeys = useMemo(
    () => new Set<string>([...PRESET_FF_GROUPS, ...customGroups]),
    [customGroups],
  )

  /** True while editing a free-form name via the extra input. */
  const [customEditing, setCustomEditing] = useState(
    () => !listedKeys.has(currentGroup),
  )
  const [customDraft, setCustomDraft] = useState(() =>
    isPresetFfGroup(currentGroup) ? '' : currentGroup,
  )

  const selectValue = customEditing
    ? CUSTOM_SENTINEL
    : listedKeys.has(currentGroup)
      ? currentGroup
      : CUSTOM_SENTINEL

  const setGroup = (group: string) => {
    onChange({
      ...circuit,
      group: group.trim() || DEFAULT_FF_GROUP,
      updatedAt: Date.now(),
    })
  }

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
          <Label htmlFor="ckt-name">{t('flipflops.name')}</Label>
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
          <Label htmlFor="ckt-group">{t('flipflops.group')}</Label>
          <Select
            value={selectValue}
            disabled={readOnly}
            onValueChange={(value) => {
              if (value === CUSTOM_SENTINEL) {
                setCustomEditing(true)
                setCustomDraft(
                  isPresetFfGroup(currentGroup) ? '' : currentGroup,
                )
                return
              }
              setCustomEditing(false)
              setCustomDraft('')
              setGroup(value)
            }}
          >
            <SelectTrigger id="ckt-group" className="w-full">
              <SelectValue placeholder={ffGroupLabel(DEFAULT_FF_GROUP, t)} />
            </SelectTrigger>
            <SelectContent>
              {PRESET_FF_GROUPS.map((key) => (
                <SelectItem key={key} value={key}>
                  {ffGroupLabel(key, t)}
                </SelectItem>
              ))}
              {customGroups.map((key) => (
                <SelectItem key={`custom-${key}`} value={key}>
                  {ffGroupLabel(key, t)}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_SENTINEL}>
                {t('flipflops.groupCustom')}
              </SelectItem>
            </SelectContent>
          </Select>
          {customEditing || selectValue === CUSTOM_SENTINEL ? (
            <Input
              value={customDraft}
              disabled={readOnly}
              placeholder={t('flipflops.groupCustomPlaceholder')}
              onChange={(e) => {
                const v = e.target.value
                setCustomDraft(v)
                setCustomEditing(true)
                if (v.trim()) setGroup(v.trim())
              }}
            />
          ) : null}
          <p className="text-[11px] text-muted-foreground">{t('flipflops.groupHint')}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ckt-desc">{t('flipflops.description')}</Label>
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
          <div className="text-sm font-medium">{t('flipflops.pins')}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>{t('flipflops.inputCount')}</Label>
              <DraftNumberInput
                value={circuit.inputs.length}
                disabled={readOnly}
                onCommit={onInputCountChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('flipflops.outputCount')}</Label>
              <DraftNumberInput
                value={circuit.outputs.length}
                disabled={readOnly}
                onCommit={onOutputCountChange}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{t('flipflops.inputs')}</div>
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
            <div className="text-xs text-muted-foreground">{t('flipflops.outputs')}</div>
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
