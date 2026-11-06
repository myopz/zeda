import { Copy, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  createProgram,
  deletePrograms,
  duplicateProgram,
  listPrograms,
} from '../db/repository'
import { createBlankProgram } from '../db/seed'
import type { CpuProgram } from '../types'

export function CpuListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<CpuProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listPrograms())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.description ?? '').toLowerCase().includes(needle),
    )
  }, [rows, q])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)

  async function onCreate() {
    const p = createBlankProgram(t('cpu.newProgramName'))
    await createProgram(p)
    navigate(`/cpu/${p.id}`)
  }

  async function onDelete() {
    const ids = [...selected].filter((id) => {
      const r = rows.find((x) => x.id === id)
      return r && r.kind !== 'builtin'
    })
    if (!ids.length) return
    if (!confirm(t('cpu.deleteConfirm', { name: String(ids.length) }))) return
    try {
      await deletePrograms(ids)
      setSelected(new Set())
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onCopy(id: string) {
    const p = await duplicateProgram(id, t('cpu.copySuffix'))
    await reload()
    navigate(`/cpu/${p.id}`)
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('cpu.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('cpu.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void onCreate()}>
            <Plus className="size-4" />
            {t('cpu.create')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!selected.size}
            onClick={() => void onDelete()}
          >
            <Trash2 className="size-4" />
            {t('common.delete')}
          </Button>
        </div>
      </div>

      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setPage(1)
        }}
        placeholder={t('common.search')}
        className="max-w-sm"
      />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr className="border-b text-left">
              <th className="w-10 p-2" />
              <th className="p-2">{t('cpu.name')}</th>
              <th className="p-2">{t('cpu.description')}</th>
              <th className="p-2">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="p-4 text-muted-foreground">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-muted-foreground">
                  {t('common.empty')}
                </td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/40">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    disabled={r.kind === 'builtin'}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(r.id)
                        else next.delete(r.id)
                        return next
                      })
                    }}
                  />
                </td>
                <td className="p-2">
                  <Link
                    to={`/cpu/${r.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span
                    className={cn(
                      'ml-2 rounded px-1.5 py-0.5 text-xs',
                      r.kind === 'builtin'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {r.kind === 'builtin' ? t('cpu.builtin') : t('cpu.custom')}
                  </span>
                </td>
                <td className="p-2 text-muted-foreground">{r.description}</td>
                <td className="p-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void onCopy(r.id)}
                  >
                    <Copy className="size-4" />
                    {t('common.copy')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {t('cpu.total', { count: filtered.length })}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            {t('cpu.pageSize')}
            <select
              className="rounded border bg-background px-2 py-1"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </Button>
          <span>
            {t('cpu.page', { page, total: totalPages })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </Button>
        </div>
      </div>
    </div>
  )
}
