import { ArrowLeft, Redo2, Save, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { createId } from '@/lib/utils'
import { FormulaEditor } from '../components/FormulaEditor'
import { GateSymbol } from '../components/GateSymbol'
import { SimCanvas } from '../components/SimCanvas'
import { TruthTableEditor } from '../components/TruthTableEditor'
import { getGate, updateGate } from '../db/repository'
import {
  applyFormulaToTable,
  FormulaError,
  rebuildFormulasFromTruthTable,
  resizeTruthTable,
  defaultPinName,
} from '../lib/bool-engine'
import { useHistoryState } from '../lib/history'
import type { Bit, GatePin, LogicGate } from '../types'

type Draft = LogicGate

function renamePins(count: number, kind: 'in' | 'out', prev: GatePin[]): GatePin[] {
  const next: GatePin[] = []
  for (let i = 0; i < count; i += 1) {
    next.push(prev[i] ?? { id: createId('pin'), name: defaultPinName(i, kind) })
  }
  return next
}

export function LogicGateDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const history = useHistoryState<Draft | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!id) return
      setLoading(true)
      const gate = await getGate(id)
      if (cancelled) return
      if (!gate) {
        setNotFound(true)
        setLoading(false)
        return
      }
      history.reset(structuredClone(gate))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per id
  }, [id])

  const gate = history.state
  const readOnly = gate?.kind === 'builtin'

  const commit = (next: Draft) => {
    history.set(next)
    setFormulaError(null)
  }

  const onToggleOutput = (rowIndex: number, outputId: string) => {
    if (!gate || readOnly) return
    const truthTable = gate.truthTable.map((row, i) =>
      i === rowIndex
        ? { ...row, [outputId]: (row[outputId] === 1 ? 0 : 1) as Bit }
        : row,
    )
    const formulas = rebuildFormulasFromTruthTable(
      truthTable,
      gate.inputs,
      gate.outputs,
    )
    commit({ ...gate, truthTable, formulas, updatedAt: Date.now() })
  }

  const onFormulaChange = (outputId: string, formula: string) => {
    if (!gate || readOnly) return
    const formulas = { ...gate.formulas, [outputId]: formula }
    try {
      const truthTable = applyFormulaToTable(
        gate.truthTable,
        gate.inputs,
        outputId,
        formula,
      )
      commit({
        ...gate,
        truthTable,
        formulas,
        updatedAt: Date.now(),
      })
      setFormulaError(null)
    } catch (err) {
      // Keep typed formula visible but don't update table
      history.set({ ...gate, formulas }, false)
      setFormulaError(err instanceof FormulaError ? err.message : String(err))
    }
  }

  const onInputCountChange = (count: number) => {
    if (!gate || readOnly) return
    const n = Math.min(6, Math.max(1, count))
    const inputs = renamePins(n, 'in', gate.inputs)
    const truthTable = resizeTruthTable(inputs, gate.outputs, gate.truthTable, gate.inputs)
    const formulas = rebuildFormulasFromTruthTable(truthTable, inputs, gate.outputs)
    commit({ ...gate, inputs, truthTable, formulas, updatedAt: Date.now() })
  }

  const onOutputCountChange = (count: number) => {
    if (!gate || readOnly) return
    const n = Math.min(4, Math.max(1, count))
    const outputs = renamePins(n, 'out', gate.outputs)
    const truthTable = resizeTruthTable(gate.inputs, outputs, gate.truthTable, gate.inputs)
    const formulas = rebuildFormulasFromTruthTable(truthTable, gate.inputs, outputs)
    commit({ ...gate, outputs, truthTable, formulas, updatedAt: Date.now() })
  }

  const onRenamePin = (kind: 'in' | 'out', pinId: string, name: string) => {
    if (!gate || readOnly) return
    const clean = name.trim() || 'X'
    if (kind === 'in') {
      const inputs = gate.inputs.map((p) => (p.id === pinId ? { ...p, name: clean } : p))
      const formulas = rebuildFormulasFromTruthTable(gate.truthTable, inputs, gate.outputs)
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
          <Link to="/lgc">
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
            <Link to="/lgc" aria-label={t('common.back')}>
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
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={gate.inputs.length}
                  disabled={readOnly}
                  onChange={(e) => onInputCountChange(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('gates.outputCount')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={gate.outputs.length}
                  disabled={readOnly}
                  onChange={(e) => onOutputCountChange(Number(e.target.value))}
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
                  rows={gate.truthTable}
                  readOnly={readOnly}
                  onToggleOutput={onToggleOutput}
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
