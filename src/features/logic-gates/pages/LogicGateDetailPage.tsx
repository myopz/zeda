import { ArrowLeft, Redo2, Save, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { createId } from '@/lib/utils'
import { FormulaEditor } from '../components/FormulaEditor'
import { GateSymbol } from '../components/GateSymbol'
import { SimCanvas } from '../components/SimCanvas'
import { TruthTableEditor } from '../components/TruthTableEditor'
import { getGate, listGates, updateGate } from '../db/repository'
import { FormulaError, defaultPinName, parseFormula } from '../lib/bool-engine'
import {
  gateGroupLabel,
  isPresetGateGroup,
  PRESET_GATE_GROUPS,
  sortGateGroups,
} from '../lib/groups'
import { useHistoryState } from '../lib/history'
import {
  DEFAULT_GATE_GROUP,
  type GatePin,
  type LogicGate,
} from '../types'

const CUSTOM_GROUP_SENTINEL = '__custom__'

type Draft = LogicGate

/** First formula parse error across outputs, or null if all parse. */
function firstFormulaError(gate: LogicGate): string | null {
  for (const out of gate.outputs) {
    const formula = gate.formulas[out.id] ?? ''
    try {
      parseFormula(formula)
    } catch (err) {
      return err instanceof FormulaError ? err.message : String(err)
    }
  }
  return null
}

function renamePins(count: number, kind: 'in' | 'out', prev: GatePin[]): GatePin[] {
  const next: GatePin[] = []
  for (let i = 0; i < count; i += 1) {
    next.push(prev[i] ?? { id: createId('pin'), name: defaultPinName(i, kind) })
  }
  return next
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renameInFormulas(
  formulas: Record<string, string>,
  from: string,
  to: string,
): Record<string, string> {
  if (from === to) return formulas
  const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g')
  const next: Record<string, string> = {}
  for (const [id, src] of Object.entries(formulas)) {
    next[id] = src.replace(re, to)
  }
  return next
}

export function LogicGateDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const location = useLocation()
  const backTo =
    (location.state as { fromList?: string } | null)?.fromList || '/lgc'

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [groupOptions, setGroupOptions] = useState<string[]>([])
  const history = useHistoryState<Draft | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!id) return
      setLoading(true)
      const [gate, all] = await Promise.all([getGate(id), listGates()])
      if (cancelled) return
      if (!gate) {
        setNotFound(true)
        setLoading(false)
        return
      }
      history.reset(structuredClone(gate))
      setFormulaError(firstFormulaError(gate))
      setGroupOptions([...new Set(all.map((g) => g.group || DEFAULT_GATE_GROUP))])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per id
  }, [id])

  const gate = history.state
  const readOnly = gate?.kind === 'builtin'
  const currentGroup = gate?.group || DEFAULT_GATE_GROUP

  const customGroups = useMemo(() => {
    const extras = new Set<string>()
    for (const g of groupOptions) {
      if (g && !isPresetGateGroup(g)) extras.add(g)
    }
    if (!isPresetGateGroup(currentGroup)) extras.add(currentGroup)
    return sortGateGroups(extras, t)
  }, [currentGroup, groupOptions, t])

  const listedGroupKeys = useMemo(
    () => new Set<string>([...PRESET_GATE_GROUPS, ...customGroups]),
    [customGroups],
  )

  const [customGroupEditing, setCustomGroupEditing] = useState(false)
  const [customGroupDraft, setCustomGroupDraft] = useState('')

  useEffect(() => {
    if (!gate) return
    const g = gate.group || DEFAULT_GATE_GROUP
    const listed = new Set<string>([...PRESET_GATE_GROUPS, ...groupOptions])
    const isListed = listed.has(g) || isPresetGateGroup(g)
    setCustomGroupEditing(!isListed)
    setCustomGroupDraft(isPresetGateGroup(g) ? '' : g)
  }, [gate?.id, gate?.group, groupOptions])

  const groupSelectValue = customGroupEditing
    ? CUSTOM_GROUP_SENTINEL
    : listedGroupKeys.has(currentGroup)
      ? currentGroup
      : CUSTOM_GROUP_SENTINEL

  const commit = (next: Draft) => {
    history.set(next)
    setFormulaError(null)
  }

  const setGroup = (group: string) => {
    if (!gate || readOnly) return
    commit({
      ...gate,
      group: group.trim() || DEFAULT_GATE_GROUP,
      updatedAt: Date.now(),
    })
  }

  const onFormulaChange = (outputId: string, formula: string) => {
    if (!gate || readOnly) return
    const formulas = { ...gate.formulas, [outputId]: formula }
    try {
      parseFormula(formula)
      commit({
        ...gate,
        formulas,
        updatedAt: Date.now(),
      })
      setFormulaError(null)
    } catch (err) {
      history.set({ ...gate, formulas }, false)
      setFormulaError(err instanceof FormulaError ? err.message : String(err))
    }
  }

  const onInputCountChange = (count: number) => {
    if (!gate || readOnly || !Number.isFinite(count)) return
    const n = Math.max(1, Math.trunc(count))
    const inputs = renamePins(n, 'in', gate.inputs)
    commit({ ...gate, inputs, updatedAt: Date.now() })
  }

  const onOutputCountChange = (count: number) => {
    if (!gate || readOnly || !Number.isFinite(count)) return
    const n = Math.max(1, Math.trunc(count))
    const outputs = renamePins(n, 'out', gate.outputs)
    const formulas = { ...gate.formulas }
    for (const out of outputs) {
      if (!(out.id in formulas)) formulas[out.id] = '0'
    }
    for (const outId of Object.keys(formulas)) {
      if (!outputs.some((o) => o.id === outId)) delete formulas[outId]
    }
    commit({ ...gate, outputs, formulas, updatedAt: Date.now() })
  }

  const onRenamePin = (kind: 'in' | 'out', pinId: string, name: string) => {
    if (!gate || readOnly) return
    const clean = name.trim() || 'X'
    if (kind === 'in') {
      const prev = gate.inputs.find((p) => p.id === pinId)
      const inputs = gate.inputs.map((p) => (p.id === pinId ? { ...p, name: clean } : p))
      const formulas = prev
        ? renameInFormulas(gate.formulas, prev.name, clean)
        : gate.formulas
      commit({ ...gate, inputs, formulas, updatedAt: Date.now() })
    } else {
      const outputs = gate.outputs.map((p) => (p.id === pinId ? { ...p, name: clean } : p))
      commit({ ...gate, outputs, updatedAt: Date.now() })
    }
  }

  const onSave = async () => {
    if (!gate || readOnly) return
    await updateGate(gate)
    history.reset(structuredClone(gate))
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 2000)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
  }

  if (notFound || !gate) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('common.empty')}</p>
        <Button asChild variant="outline">
          <Link to={backTo}>
            <ArrowLeft /> {t('common.back')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="outline" size="icon" className="mt-0.5 shrink-0">
            <Link to={backTo} aria-label={t('common.back')}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {t('gates.detail')}
              </h1>
              <Badge variant={gate.kind === 'builtin' ? 'secondary' : 'outline'}>
                {gate.kind === 'builtin' ? t('gates.builtin') : t('gates.custom')}
              </Badge>
            </div>
            {readOnly ? (
              <p className="text-sm text-muted-foreground">{t('gates.builtinReadonly')}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!history.canUndo || readOnly}
            onClick={history.undo}
          >
            <Undo2 /> {t('common.undo')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!history.canRedo || readOnly}
            onClick={history.redo}
          >
            <Redo2 /> {t('common.redo')}
          </Button>
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => void onSave()}>
              <Save /> {t('common.save')}
            </Button>
          )}
        </div>
      </div>

      {savedFlash ? (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          {t('gates.saved')}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <section className="space-y-4 rounded-lg border bg-card p-4">
          <div className="text-sm font-medium">{t('gates.meta')}</div>
          <div className="flex justify-center rounded-md bg-muted/40 p-3">
            <GateSymbol gate={gate} width={160} height={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gate-name">{t('gates.name')}</Label>
            <Input
              id="gate-name"
              value={gate.name}
              disabled={readOnly}
              onChange={(e) =>
                commit({ ...gate, name: e.target.value, updatedAt: Date.now() })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gate-group">{t('gates.group')}</Label>
            <Select
              value={groupSelectValue}
              disabled={readOnly}
              onValueChange={(value) => {
                if (value === CUSTOM_GROUP_SENTINEL) {
                  setCustomGroupEditing(true)
                  setCustomGroupDraft(
                    isPresetGateGroup(currentGroup) ? '' : currentGroup,
                  )
                  return
                }
                setCustomGroupEditing(false)
                setCustomGroupDraft('')
                setGroup(value)
              }}
            >
              <SelectTrigger id="gate-group" className="w-full">
                <SelectValue
                  placeholder={gateGroupLabel(DEFAULT_GATE_GROUP, t)}
                />
              </SelectTrigger>
              <SelectContent>
                {PRESET_GATE_GROUPS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {gateGroupLabel(key, t)}
                  </SelectItem>
                ))}
                {customGroups.map((key) => (
                  <SelectItem key={`custom-${key}`} value={key}>
                    {gateGroupLabel(key, t)}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_GROUP_SENTINEL}>
                  {t('gates.groupCustom')}
                </SelectItem>
              </SelectContent>
            </Select>
            {customGroupEditing || groupSelectValue === CUSTOM_GROUP_SENTINEL ? (
              <Input
                value={customGroupDraft}
                disabled={readOnly}
                placeholder={t('gates.groupCustomPlaceholder')}
                onChange={(e) => {
                  const v = e.target.value
                  setCustomGroupDraft(v)
                  setCustomGroupEditing(true)
                  if (v.trim()) setGroup(v.trim())
                }}
              />
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {t('gates.groupHint')}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gate-desc">{t('gates.description')}</Label>
            <Textarea
              id="gate-desc"
              value={gate.description ?? ''}
              disabled={readOnly}
              rows={3}
              onChange={(e) =>
                commit({
                  ...gate,
                  description: e.target.value,
                  updatedAt: Date.now(),
                })
              }
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-medium">{t('gates.pins')}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{t('gates.inputCount')}</Label>
                <DraftNumberInput
                  value={gate.inputs.length}
                  disabled={readOnly}
                  onCommit={onInputCountChange}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('gates.outputCount')}</Label>
                <DraftNumberInput
                  value={gate.outputs.length}
                  disabled={readOnly}
                  onCommit={onOutputCountChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">{t('gates.inputs')}</div>
              {gate.inputs.map((pin) => (
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
              <div className="text-xs text-muted-foreground">{t('gates.outputs')}</div>
              {gate.outputs.map((pin) => (
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
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 text-sm font-medium">{t('gates.design')}</div>
            <div className="grid gap-4 xl:grid-cols-2">
              <FormulaEditor
                outputs={gate.outputs}
                formulas={gate.formulas}
                readOnly={readOnly}
                error={formulaError}
                onChange={onFormulaChange}
              />
              <div className="space-y-2">
                <div className="text-sm font-medium">{t('gates.truthTable')}</div>
                <TruthTableEditor
                  inputs={gate.inputs}
                  outputs={gate.outputs}
                  formulas={gate.formulas}
                />
              </div>
            </div>
          </div>

          <SimCanvas gate={gate} />
        </section>
      </div>
    </div>
  )
}
