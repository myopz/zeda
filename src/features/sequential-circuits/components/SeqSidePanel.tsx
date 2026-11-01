import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ComboCircuit } from '@/features/combo-circuits/types'
import type { LogicGate } from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import type { SequentialCircuit, PinDrive } from '../types'
import { SeqMetaPanel } from './SeqMetaPanel'
import { SeqModulePalette } from './SeqModulePalette'

const TAB_KEY = 'zeda.sequential.sideTab'

type SideTab = 'meta' | 'palette'

type Props = {
  circuit: SequentialCircuit
  gates: LogicGate[]
  /** Other sequential circuits for nested palette items. */
  circuits?: SequentialCircuit[]
  /** Combo logic circuits from /clc. */
  comboCircuits?: ComboCircuit[]
  groupOptions?: string[]
  readOnly?: boolean
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onChange: (next: SequentialCircuit) => void
  onAddPin: (kind: 'in' | 'out') => void
  onRemovePin: (kind: 'in' | 'out', pinId: string) => void
  onMovePin: (kind: 'in' | 'out', pinId: string, dir: -1 | 1) => void
  onRenamePin: (kind: 'in' | 'out', pinId: string, name: string) => void
  onSetPinDrive: (pinId: string, drive: PinDrive) => void
  className?: string
}

function readTab(): SideTab {
  try {
    const v = localStorage.getItem(TAB_KEY)
    return v === 'palette' ? 'palette' : 'meta'
  } catch {
    return 'meta'
  }
}

export function SeqSidePanel({
  circuit,
  gates,
  circuits = [],
  comboCircuits = [],
  groupOptions = [],
  readOnly,
  collapsed = false,
  onCollapsedChange,
  onChange,
  onAddPin,
  onRemovePin,
  onMovePin,
  onRenamePin,
  onSetPinDrive,
  className,
}: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SideTab>(readTab)

  if (collapsed) {
    return (
      <div className={cn('flex h-full flex-col items-center border-r bg-card py-2', className)}>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('sequential.sideExpand')}
          onClick={() => onCollapsedChange?.(false)}
        >
          <PanelLeftOpen className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        const next = v === 'palette' ? 'palette' : 'meta'
        setTab(next)
        localStorage.setItem(TAB_KEY, next)
      }}
      className={cn('flex h-full min-h-0 w-[240px] flex-col gap-0 border-r bg-card', className)}
    >
      <div className="flex shrink-0 items-center gap-1 border-b px-1.5 py-1.5">
        <TabsList className="h-8 min-w-0 flex-1">
          <TabsTrigger value="meta" className="flex-1 px-2 text-xs">
            {t('sequential.meta')}
          </TabsTrigger>
          <TabsTrigger value="palette" className="flex-1 px-2 text-xs">
            {t('sequential.palette')}
          </TabsTrigger>
        </TabsList>
        {onCollapsedChange ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label={t('sequential.sideCollapse')}
            onClick={() => onCollapsedChange(true)}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        ) : null}
      </div>

      <TabsContent
        value="meta"
        className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
      >
        <SeqMetaPanel
          circuit={circuit}
          groupOptions={groupOptions}
          readOnly={readOnly}
          embedded
          onChange={onChange}
          onAddPin={onAddPin}
          onRemovePin={onRemovePin}
          onMovePin={onMovePin}
          onRenamePin={onRenamePin}
          onSetPinDrive={onSetPinDrive}
          className="h-full"
        />
      </TabsContent>
      <TabsContent
        value="palette"
        className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
      >
        <SeqModulePalette
          gates={gates}
          circuits={circuits}
          comboCircuits={comboCircuits}
          excludeCircuitId={circuit.id}
          embedded
          className="h-full"
        />
      </TabsContent>
    </Tabs>
  )
}
