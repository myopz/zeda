import { Binary, ChevronDown, ChevronUp, Clock, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type SVGProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
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
  seqGroupLabel,
  isPresetSeqGroup,
  PRESET_SEQ_GROUPS,
  sortSeqGroups,
} from '../lib/groups'
import { PIN_DRIVES, resolvePinDrive } from '../lib/pin-drive'
import {
  DEFAULT_SEQ_GROUP,
  type CircuitPin,
  type SequentialCircuit,
  type PinDrive,
} from '../types'

const CUSTOM_SENTINEL = '__custom__'

type Props = {
  circuit: SequentialCircuit
  /** Existing custom group keys (presets are always listed) */
  groupOptions?: string[]
  readOnly?: boolean
  /** Content-only mode for tab host (no chrome / collapse) */
  embedded?: boolean
  onChange: (next: SequentialCircuit) => void
  onAddPin: (kind: 'in' | 'out') => void
  onRemovePin: (kind: 'in' | 'out', pinId: string) => void
  onMovePin: (kind: 'in' | 'out', pinId: string, dir: -1 | 1) => void
  onRenamePin: (kind: 'in' | 'out', pinId: string, name: string) => void
  onSetPinDrive: (pinId: string, drive: PinDrive) => void
  className?: string
}

const DRIVE_ABBR: Record<PinDrive, string> = {
  signal: 'DATA',
  clk: 'CLK',
  vcc: 'VCC',
  gnd: 'GND',
}

function driveToneClass(drive: PinDrive) {
  if (drive === 'clk') return 'text-amber-600 dark:text-amber-400'
  if (drive === 'vcc') return 'text-rose-600 dark:text-rose-400'
  if (drive === 'gnd') return 'text-sky-600 dark:text-sky-400'
  return 'text-muted-foreground'
}

/** IEC / schematic VCC (power rail): bar + vertical stem. */
function VccSymbol({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M3 3.5h10" />
      <path d="M8 3.5v9" />
    </svg>
  )
}

/** IEC / schematic earth ground: three descending bars. */
function GndSymbol({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M8 2.5v5" />
      <path d="M3 7.5h10" />
      <path d="M4.5 10h7" />
      <path d="M6 12.5h4" />
    </svg>
  )
}

function DriveGlyph({
  drive,
  className,
}: {
  drive: PinDrive
  className?: string
}) {
  if (drive === 'vcc') return <VccSymbol className={className} />
  if (drive === 'gnd') return <GndSymbol className={className} />
  if (drive === 'clk') return <Clock className={className} aria-hidden />
  return <Binary className={className} aria-hidden />
}

function PinRow({
  pin,
  index,
  total,
  readOnly,
  showDrive,
  onRename,
  onDrive,
  onMove,
  onRemove,
}: {
  pin: CircuitPin
  index: number
  total: number
  readOnly?: boolean
  showDrive?: boolean
  onRename: (name: string) => void
  onDrive?: (drive: PinDrive) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const drive = resolvePinDrive(pin)

  return (
    <div className="flex items-center gap-0.5">
      <div className="flex shrink-0 flex-col">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5"
          disabled={readOnly || index === 0}
          aria-label={t('sequential.pinMoveUp')}
          onClick={() => onMove(-1)}
        >
          <ChevronUp className="size-3" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5"
          disabled={readOnly || index >= total - 1}
          aria-label={t('sequential.pinMoveDown')}
          onClick={() => onMove(1)}
        >
          <ChevronDown className="size-3" />
        </Button>
      </div>
      <Input
        value={pin.name}
        disabled={readOnly}
        className="h-7 min-w-0 flex-1 px-2 font-mono text-xs"
        onChange={(e) => onRename(e.target.value)}
      />
      {showDrive ? (
        <Select
          value={drive}
          disabled={readOnly}
          onValueChange={(v) => onDrive?.(v as PinDrive)}
        >
          <SelectTrigger
            className={cn(
              'size-7 shrink-0 justify-center gap-0 px-0 [&>svg:last-child]:hidden',
              driveToneClass(drive),
            )}
            aria-label={t(`sequential.pinDrive.${drive}`)}
            title={`${DRIVE_ABBR[drive]} · ${t(`sequential.pinDrive.${drive}`)}`}
          >
            <DriveGlyph drive={drive} className="size-3.5" />
          </SelectTrigger>
          <SelectContent className="min-w-[12rem]">
            {PIN_DRIVES.map((d) => (
              <SelectItem key={d} value={d}>
                <span className="inline-flex items-center gap-2 text-xs">
                  <DriveGlyph
                    drive={d}
                    className={cn('size-3.5 shrink-0', driveToneClass(d))}
                  />
                  <span
                    className={cn(
                      'w-9 font-mono font-semibold',
                      driveToneClass(d),
                    )}
                  >
                    {DRIVE_ABBR[d]}
                  </span>
                  <span className="text-muted-foreground">
                    {t(`sequential.pinDrive.${d}`)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
        disabled={readOnly}
        aria-label={t('sequential.pinRemove')}
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

export function SeqMetaPanel({
  circuit,
  groupOptions = [],
  readOnly,
  embedded,
  onChange,
  onAddPin,
  onRemovePin,
  onMovePin,
  onRenamePin,
  onSetPinDrive,
  className,
}: Props) {
  const { t } = useTranslation()
  const currentGroup = circuit.group || DEFAULT_SEQ_GROUP

  const customGroups = useMemo(() => {
    const extras = new Set<string>()
    for (const g of groupOptions) {
      if (g && !isPresetSeqGroup(g)) extras.add(g)
    }
    if (!isPresetSeqGroup(currentGroup)) extras.add(currentGroup)
    return sortSeqGroups(extras, t)
  }, [currentGroup, groupOptions, t])

  const listedKeys = useMemo(
    () => new Set<string>([...PRESET_SEQ_GROUPS, ...customGroups]),
    [customGroups],
  )

  /** True while editing a free-form name via the extra input. */
  const [customEditing, setCustomEditing] = useState(
    () => !listedKeys.has(currentGroup),
  )
  const [customDraft, setCustomDraft] = useState(() =>
    isPresetSeqGroup(currentGroup) ? '' : currentGroup,
  )

  const selectValue = customEditing
    ? CUSTOM_SENTINEL
    : listedKeys.has(currentGroup)
      ? currentGroup
      : CUSTOM_SENTINEL

  const setGroup = (group: string) => {
    onChange({
      ...circuit,
      group: group.trim() || DEFAULT_SEQ_GROUP,
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
          <Label htmlFor="ckt-name">{t('sequential.name')}</Label>
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
          <Label htmlFor="ckt-group">{t('sequential.group')}</Label>
          <Select
            value={selectValue}
            disabled={readOnly}
            onValueChange={(value) => {
              if (value === CUSTOM_SENTINEL) {
                setCustomEditing(true)
                setCustomDraft(
                  isPresetSeqGroup(currentGroup) ? '' : currentGroup,
                )
                return
              }
              setCustomEditing(false)
              setCustomDraft('')
              setGroup(value)
            }}
          >
            <SelectTrigger id="ckt-group" className="w-full">
              <SelectValue placeholder={seqGroupLabel(DEFAULT_SEQ_GROUP, t)} />
            </SelectTrigger>
            <SelectContent>
              {PRESET_SEQ_GROUPS.map((key) => (
                <SelectItem key={key} value={key}>
                  {seqGroupLabel(key, t)}
                </SelectItem>
              ))}
              {customGroups.map((key) => (
                <SelectItem key={`custom-${key}`} value={key}>
                  {seqGroupLabel(key, t)}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_SENTINEL}>
                {t('sequential.groupCustom')}
              </SelectItem>
            </SelectContent>
          </Select>
          {customEditing || selectValue === CUSTOM_SENTINEL ? (
            <Input
              value={customDraft}
              disabled={readOnly}
              placeholder={t('sequential.groupCustomPlaceholder')}
              onChange={(e) => {
                const v = e.target.value
                setCustomDraft(v)
                setCustomEditing(true)
                if (v.trim()) setGroup(v.trim())
              }}
            />
          ) : null}
          <p className="text-[11px] text-muted-foreground">{t('sequential.groupHint')}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ckt-desc">{t('sequential.description')}</Label>
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
          <div className="text-sm font-medium">{t('sequential.pins')}</div>
          <p className="text-[11px] text-muted-foreground">{t('sequential.pinDriveHint')}</p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">{t('sequential.inputs')}</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                disabled={readOnly}
                onClick={() => onAddPin('in')}
              >
                <Plus className="size-3.5" />
                {t('sequential.pinAdd')}
              </Button>
            </div>
            {circuit.inputs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t('sequential.pinEmpty')}</p>
            ) : (
              circuit.inputs.map((pin, i) => (
                <PinRow
                  key={pin.id}
                  pin={pin}
                  index={i}
                  total={circuit.inputs.length}
                  readOnly={readOnly}
                  showDrive
                  onRename={(name) => onRenamePin('in', pin.id, name)}
                  onDrive={(drive) => onSetPinDrive(pin.id, drive)}
                  onMove={(dir) => onMovePin('in', pin.id, dir)}
                  onRemove={() => onRemovePin('in', pin.id)}
                />
              ))
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">{t('sequential.outputs')}</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                disabled={readOnly}
                onClick={() => onAddPin('out')}
              >
                <Plus className="size-3.5" />
                {t('sequential.pinAdd')}
              </Button>
            </div>
            {circuit.outputs.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t('sequential.pinEmpty')}</p>
            ) : (
              circuit.outputs.map((pin, i) => (
                <PinRow
                  key={pin.id}
                  pin={pin}
                  index={i}
                  total={circuit.outputs.length}
                  readOnly={readOnly}
                  onRename={(name) => onRenamePin('out', pin.id, name)}
                  onMove={(dir) => onMovePin('out', pin.id, dir)}
                  onRemove={() => onRemovePin('out', pin.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
