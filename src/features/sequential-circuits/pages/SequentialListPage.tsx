import {
  Copy,
  Download,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  createSequential,
  deleteSequential,
  duplicateSequential,
  exportSequentials,
  importSequentials,
  listSequentials,
} from '../db/repository'
import { catalogKeyFromSeqId } from '../db/seed'
import type { SequentialCircuit } from '../types'

const PAGE_SIZES = [10, 25, 50, 100] as const
const PAGE_SIZE_KEY = 'zeda.sequential.pageSize'

function readStoredPageSize(): number {
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 10
}

export function SequentialListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const [circuits, setCircuits] = useState<SequentialCircuit[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'card'>('list')
  const [pageSize, setPageSize] = useState(readStoredPageSize)
  const pageParam = Number(searchParams.get('page'))
  const page =
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.trunc(pageParam) : 1
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SequentialCircuit | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setPage = (next: number | ((prev: number) => number)) => {
    const value = typeof next === 'function' ? next(page) : next
    const clamped = Math.max(1, Math.trunc(value))
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (clamped <= 1) params.delete('page')
        else params.set('page', String(clamped))
        return params
      },
      { replace: true },
    )
  }

  const listReturnPath = `${location.pathname}${location.search}`

  const openDetail = (id: string) => {
    navigate(`/seq/${id}`, { state: { fromList: listReturnPath } })
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCircuits(await listSequentials())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCircuits([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return circuits
    return circuits.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.builtinKey?.toLowerCase().includes(q),
    )
  }, [circuits, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  // While loading, keep the URL page so returning from detail (?page=N) is not
  // clamped to 1 against an empty list (totalPages === 1).
  const safePage = loading ? page : Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  useEffect(() => {
    if (loading) return
    if (page !== safePage) setPage(safePage)
  }, [loading, page, safePage])

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSelectAllPage = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of pageItems) {
        if (checked) next.add(c.id)
        else next.delete(c.id)
      }
      return next
    })
  }

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2500)
  }

  const onCreate = async () => {
    const circuit = await createSequential(t('sequential.newCircuitName'))
    navigate(`/seq/${circuit.id}`, { state: { fromList: listReturnPath } })
  }

  const onCopy = async (id: string) => {
    await duplicateSequential(id, t('sequential.copySuffix'))
    flash(t('sequential.copied'))
    await reload()
  }

  const onDelete = async () => {
    if (!deleteTarget) return
    await deleteSequential(deleteTarget.id)
    setDeleteTarget(null)
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(deleteTarget.id)
      return next
    })
    await reload()
  }

  const downloadJson = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const onExport = async (mode: 'selected' | 'all') => {
    if (mode === 'selected' && selected.size === 0) {
      flash(t('sequential.noSelection'))
      return
    }
    const payload = await exportSequentials(
      mode === 'selected' ? [...selected] : undefined,
    )
    downloadJson(payload, `zeda-flipflops-${Date.now()}.json`)
  }

  const onImportFile = async (file: File) => {
    const text = await file.text()
    const count = await importSequentials(JSON.parse(text) as unknown)
    flash(t('sequential.imported', { count }))
    await reload()
  }

  const formatTime = (ts: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(ts)

  const displayName = (c: SequentialCircuit) => {
    const moduleKey =
      c.builtinKey ??
      catalogKeyFromSeqId(c.id) ??
      (c.nodes.length === 1 && c.nodes[0]?.kind === 'ff'
        ? c.nodes[0].moduleKey
        : undefined)
    if (moduleKey) {
      const key = `sequential.modules.${moduleKey}`
      const localized = t(key)
      if (localized !== key) return localized
    }
    return c.name
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('sequential.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('sequential.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void onCreate()}>
            <Plus /> {t('sequential.create')}
          </Button>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> {t('common.import')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onImportFile(file)
              e.target.value = ''
            }}
          />
          <Button type="button" variant="outline" onClick={() => void onExport('selected')}>
            <Download /> {t('sequential.exportSelected')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void onExport('all')}>
            <Download /> {t('sequential.exportAll')}
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
          placeholder={t('common.search')}
          className="sm:max-w-xs"
        />
        <div className="flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={view === 'list' ? 'secondary' : 'ghost'}
            onClick={() => setView('list')}
          >
            <ListIcon /> {t('sequential.listView')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'card' ? 'secondary' : 'ghost'}
            onClick={() => setView('card')}
          >
            <LayoutGrid /> {t('sequential.cardView')}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('common.empty')}</p>
        ) : view === 'list' ? (
          <div className="h-full overflow-auto rounded-lg border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={
                        pageItems.length > 0 &&
                        pageItems.every((c) => selected.has(c.id))
                      }
                      onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">{t('sequential.name')}</th>
                  <th className="px-3 py-2 text-left">{t('sequential.type')}</th>
                  <th className="px-3 py-2 text-left">{t('sequential.inputs')}</th>
                  <th className="px-3 py-2 text-left">{t('sequential.outputs')}</th>
                  <th className="px-3 py-2 text-left">{t('sequential.nodes')}</th>
                  <th className="px-3 py-2 text-left">{t('sequential.updatedAt')}</th>
                  <th className="px-3 py-2 text-left">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((circuit) => (
                  <tr
                    key={circuit.id}
                    className="cursor-pointer border-t hover:bg-muted/40"
                    onClick={() => openDetail(circuit.id)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(circuit.id)}
                        onCheckedChange={(v) => toggleSelect(circuit.id, v === true)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{displayName(circuit)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={circuit.kind === 'builtin' ? 'secondary' : 'outline'}>
                        {circuit.kind === 'builtin'
                          ? t('sequential.builtin')
                          : t('sequential.custom')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{circuit.inputs.length}</td>
                    <td className="px-3 py-2">{circuit.outputs.length}</td>
                    <td className="px-3 py-2">{circuit.nodes.length}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatTime(circuit.updatedAt)}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => void onCopy(circuit.id)}
                          aria-label={t('common.copy')}
                        >
                          <Copy />
                        </Button>
                        {circuit.kind !== 'builtin' && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteTarget(circuit)}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((circuit) => (
              <Link
                key={circuit.id}
                to={`/seq/${circuit.id}`}
                state={{ fromList: listReturnPath }}
                className={cn(
                  'rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30',
                  selected.has(circuit.id) && 'border-primary/50 bg-muted/20',
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div
                    className="pt-0.5"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                  >
                    <Checkbox
                      checked={selected.has(circuit.id)}
                      onCheckedChange={(v) => toggleSelect(circuit.id, v === true)}
                      aria-label={displayName(circuit)}
                    />
                  </div>
                  <div className="min-w-0 flex-1 font-medium">{displayName(circuit)}</div>
                  <Badge variant={circuit.kind === 'builtin' ? 'secondary' : 'outline'}>
                    {circuit.kind === 'builtin'
                      ? t('sequential.builtin')
                      : t('sequential.custom')}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('sequential.inputs')}: {circuit.inputs.length} · {t('sequential.outputs')}:{' '}
                  {circuit.outputs.length} · {t('sequential.nodes')}: {circuit.nodes.length}
                </div>
                <div
                  className="mt-3 flex gap-1"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void onCopy(circuit.id)}
                  >
                    <Copy /> {t('common.copy')}
                  </Button>
                  {circuit.kind !== 'builtin' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteTarget(circuit)}
                    >
                      <Trash2 /> {t('common.delete')}
                    </Button>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {t('sequential.total', { count: filtered.length })}
          {selected.size > 0 ? ` · ${t('common.selected', { count: selected.size })}` : ''}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('sequential.pageSize')}</span>
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
              {t('sequential.page', { page: safePage, total: totalPages })}
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

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.delete')}</DialogTitle>
            <DialogDescription>
              {t('sequential.deleteConfirm', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void onDelete()}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
