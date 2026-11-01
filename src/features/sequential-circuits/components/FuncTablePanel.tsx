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
import { buildFuncTablePage } from '../lib/func-table'

const PAGE_SIZES = [10, 25, 50, 100] as const
const PAGE_SIZE_KEY = 'zeda.sequential.funcTable.pageSize'

function readStoredPageSize(): number {
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 10
}

type Props = {
  moduleKey: string | undefined
  className?: string
}

export function FuncTablePanel({ moduleKey, className }: Props) {
  const { t } = useTranslation()
  const [pageSize, setPageSize] = useState(readStoredPageSize)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [moduleKey, pageSize])

  const table = useMemo(() => {
    if (!moduleKey) return null
    return buildFuncTablePage(moduleKey, page, pageSize)
  }, [moduleKey, page, pageSize])

  if (!moduleKey || !table) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        {t('sequential.funcTableUnavailable')}
      </p>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      {table.equations.length > 0 ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
          {table.equations.map((eq) => (
            <div key={eq}>{eq}</div>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              {table.columns.map((c) => (
                <th key={c} className="px-2 py-1.5 text-left font-mono text-xs">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  'border-t',
                  row.forbidden && 'bg-destructive/10 text-destructive',
                )}
              >
                {row.cells.map((cell, j) => (
                  <td key={j} className="px-2 py-1 font-mono text-xs">
                    {String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {t('sequential.total', { count: table.totalRows })}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('sequential.pageSize')}</span>
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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={table.page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </Button>
            <span>
              {t('sequential.page', { page: table.page, total: table.totalPages })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={table.page >= table.totalPages}
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
