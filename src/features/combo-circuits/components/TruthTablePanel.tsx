import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LogicGate } from '@/features/logic-gates/types'
import { cn } from '@/lib/utils'
import type { ComboCircuit } from '../types'
import { NetlistError } from '../lib/netlist'
import {
  buildTruthTablePage,
  TRUTH_TABLE_MAX_INPUTS,
} from '../lib/truth-table'

const PAGE_SIZES = [10, 25, 50, 100] as const
const PAGE_SIZE_KEY = 'zeda.circuits.truthTable.pageSize'

function readStoredPageSize(): number {
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 10
}

type Props = {
  circuit: ComboCircuit | null | undefined
  gates: LogicGate[]
  circuits?: ComboCircuit[]
  className?: string
}

export function TruthTablePanel({
  circuit,
  gates,
  circuits = [],
  className,
}: Props) {
  const { t } = useTranslation()
  const [pageSize, setPageSize] = useState(readStoredPageSize)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [circuit?.id, pageSize])

  const resolveCircuit = useMemo(() => {
    const map = new Map(circuits.map((c) => [c.id, c]))
    if (circuit) map.set(circuit.id, circuit)
    return (id: string) => map.get(id)
  }, [circuits, circuit])

  const table = useMemo(() => {
    if (!circuit) return null
    try {
      return {
        ok: true as const,
        page: buildTruthTablePage(
          circuit,
          gates,
          page,
          pageSize,
          resolveCircuit,
        ),
      }
    } catch (err) {
      return {
        ok: false as const,
        message:
          err instanceof NetlistError || err instanceof Error
            ? err.message
            : String(err),
      }
    }
  }, [circuit, gates, page, pageSize, resolveCircuit])

  if (!circuit) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        {t('circuits.funcTableUnavailable')}
      </p>
    )
  }

  if (!table) return null

  if (!table.ok) {
    return (
      <div
        className={cn(
          'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive',
          className,
        )}
      >
        {t('circuits.simError', { message: table.message })}
      </div>
    )
  }

  const data = table.page
  if (data.truncated) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        {t('circuits.funcTableTooManyInputs', { max: TRUTH_TABLE_MAX_INPUTS })}
      </p>
    )
  }

  if (data.totalRows === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        {t('circuits.funcTableUnavailable')}
      </p>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <table className="w-full min-w-[360px] border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              {data.columns.map((c) => (
                <th key={c} className="px-2 py-1.5 text-left font-mono text-xs">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} className="border-t">
                {row.cells.map((cell, j) => (
                  <td key={j} className="px-2 py-1 font-mono text-xs">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {t('circuits.total', { count: data.totalRows })}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('circuits.pageSize')}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const next = Number(v)
                setPageSize(next)
                localStorage.setItem(PAGE_SIZE_KEY, String(next))
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </Button>
            <span>
              {t('circuits.page', { page: data.page, total: data.totalPages })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={data.page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
