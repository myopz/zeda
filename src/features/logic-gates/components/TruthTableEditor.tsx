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
import { cn } from '@/lib/utils'
import {
  SAFE_ROW_COUNT_BITS,
  buildTruthTablePage,
  totalTruthRowsBigInt,
  type GateEvalModel,
} from '../lib/bool-engine'
import type { GatePin } from '../types'

const PAGE_SIZES = [10, 25, 50, 100] as const
const PAGE_SIZE_KEY = 'zeda.gates.truthTable.pageSize.v2'

function readStoredPageSize(): number {
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 10
}

type Props = {
  inputs: GatePin[]
  outputs: GatePin[]
  formulas: Record<string, string>
}

export function TruthTableEditor({ inputs, outputs, formulas }: Props) {
  const { t } = useTranslation()
  const [pageSize, setPageSize] = useState(readStoredPageSize)
  const [page, setPage] = useState(1)

  const model: GateEvalModel = useMemo(
    () => ({ inputs, outputs, formulas }),
    [inputs, outputs, formulas],
  )

  const totalRows = totalTruthRowsBigInt(inputs.length)
  const totalPagesBig =
    (totalRows + BigInt(pageSize) - 1n) / BigInt(pageSize)
  const totalPages =
    totalPagesBig > BigInt(Number.MAX_SAFE_INTEGER)
      ? Number.MAX_SAFE_INTEGER
      : Math.max(1, Number(totalPagesBig))
  const safePage = Math.min(page, totalPages)
  const pageStart = BigInt(safePage - 1) * BigInt(pageSize)
  const pageRows = useMemo(
    () => buildTruthTablePage(model, pageStart, pageSize),
    [model, pageStart, pageSize],
  )

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  useEffect(() => {
    setPage(1)
  }, [inputs.length])

  const totalLabel =
    inputs.length > SAFE_ROW_COUNT_BITS
      ? t('gates.truthTableRowsPow', { n: inputs.length })
      : t('gates.total', { count: Number(totalRows) })

  return (
    <div className="space-y-2">
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
            {pageRows.map((row) => (
              <tr key={row.rowIndex.toString()} className="odd:bg-background even:bg-muted/20">
                {inputs.map((pin) => (
                  <td key={pin.id} className="px-3 py-1.5 font-mono">
                    {row.cells[pin.id]}
                  </td>
                ))}
                {outputs.map((pin) => {
                  const bit = row.cells[pin.id] ?? 0
                  return (
                    <td
                      key={pin.id}
                      className={cn(
                        'border-l px-3 py-1.5 font-mono',
                        bit ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {bit}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">{totalLabel}</div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('gates.pageSize')}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const next = Number(v)
                setPageSize(next)
                localStorage.setItem(PAGE_SIZE_KEY, String(next))
                setPage(1)
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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </Button>
            <span className="text-sm">
              {t('gates.page', { page: safePage, total: totalPages })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
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
