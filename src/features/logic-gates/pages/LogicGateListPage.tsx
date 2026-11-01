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
import { GateSymbol } from '../components/GateSymbol'
import {
  createGate,
  deleteGate,
  duplicateGate,
  exportGates,
  importGates,
  listGates,
} from '../db/repository'
import type { LogicGate } from '../types'

const PAGE_SIZES = [10, 25, 50, 100] as const
const PAGE_SIZE_KEY = 'zeda.gates.pageSize.v2'

function readStoredPageSize(): number {
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 10
}

export function LogicGateListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const [gates, setGates] = useState<LogicGate[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'card'>('list')
  const [pageSize, setPageSize] = useState(readStoredPageSize)
  const pageParam = Number(searchParams.get('page'))
  const page =
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.trunc(pageParam) : 1
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<LogicGate | null>(null)
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
    navigate(`/lgc/${id}`, { state: { fromList: listReturnPath } })
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listGates()
      setGates(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setGates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return gates
    return gates.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q),
    )
  }, [gates, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  // Keep URL page while loading so returning from detail (?page=N) is not
  // clamped to 1 against an empty list.
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
      for (const g of pageItems) {
        if (checked) next.add(g.id)
        else next.delete(g.id)
      }
      return next
    })
  }

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2500)
  }

  const onCreate = async () => {
    const gate = await createGate(t('gates.newGateName'))
    navigate(`/lgc/${gate.id}`, { state: { fromList: listReturnPath } })
  }

  const onCopy = async (id: string) => {
    await duplicateGate(id, t('gates.copySuffix'))
    flash(t('gates.copied'))
    await reload()
  }

  const onDelete = async () => {
    if (!deleteTarget) return
    await deleteGate(deleteTarget.id)
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
      flash(t('gates.noSelection'))
      return
    }
    const payload = await exportGates(
      mode === 'selected' ? [...selected] : undefined,
    )
    downloadJson(payload, `zeda-gates-${Date.now()}.json`)
  }

  const onImportFile = async (file: File) => {
    const text = await file.text()
    const count = await importGates(JSON.parse(text) as unknown)
    flash(t('gates.imported', { count }))
    await reload()
  }

  const formatTime = (ts: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(ts)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('gates.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('gates.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void onCreate()}>
            <Plus /> {t('gates.create')}
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
            <Download /> {t('gates.exportSelected')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void onExport('all')}>
            <Download /> {t('gates.exportAll')}
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
            <ListIcon /> {t('gates.listView')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === 'card' ? 'secondary' : 'ghost'}
            onClick={() => setView('card')}
          >
            <LayoutGrid /> {t('gates.cardView')}
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
                        pageItems.every((g) => selected.has(g.id))
                      }
                      onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">{t('gates.symbol')}</th>
                  <th className="px-3 py-2 text-left">{t('gates.name')}</th>
                  <th className="px-3 py-2 text-left">{t('gates.type')}</th>
                  <th className="px-3 py-2 text-left">{t('gates.inputs')}</th>
                  <th className="px-3 py-2 text-left">{t('gates.outputs')}</th>
                  <th className="px-3 py-2 text-left">{t('gates.updatedAt')}</th>
                  <th className="px-3 py-2 text-left">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((gate) => (
                  <tr
                    key={gate.id}
                    className="cursor-pointer border-t hover:bg-muted/40"
                    onClick={() => openDetail(gate.id)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(gate.id)}
                        onCheckedChange={(v) => toggleSelect(gate.id, v === true)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <GateSymbol gate={gate} width={72} height={48} />
                    </td>
                    <td className="px-3 py-2 font-medium">{gate.name}</td>
                    <td className="px-3 py-2">
                      <Badge variant={gate.kind === 'builtin' ? 'secondary' : 'outline'}>
                        {gate.kind === 'builtin' ? t('gates.builtin') : t('gates.custom')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{gate.inputs.length}</td>
                    <td className="px-3 py-2">{gate.outputs.length}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatTime(gate.updatedAt)}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => void onCopy(gate.id)}
                          aria-label={t('common.copy')}
                        >
                          <Copy />
                        </Button>
                        {gate.kind !== 'builtin' && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteTarget(gate)}
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
            {pageItems.map((gate) => (
              <Link
                key={gate.id}
                to={`/lgc/${gate.id}`}
                state={{ fromList: listReturnPath }}
                className={cn(
                  'rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30',
                  selected.has(gate.id) && 'border-primary/50 bg-muted/20',
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div
                    className="pt-0.5"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                  >
                    <Checkbox
                      checked={selected.has(gate.id)}
                      onCheckedChange={(v) => toggleSelect(gate.id, v === true)}
                      aria-label={gate.name}
                    />
                  </div>
                  <GateSymbol gate={gate} width={96} height={64} className="min-w-0 flex-1" />
                  <Badge variant={gate.kind === 'builtin' ? 'secondary' : 'outline'}>
                    {gate.kind === 'builtin' ? t('gates.builtin') : t('gates.custom')}
                  </Badge>
                </div>
                <div className="font-medium">{gate.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('gates.inputs')}: {gate.inputs.length} · {t('gates.outputs')}:{' '}
                  {gate.outputs.length}
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
                    onClick={() => void onCopy(gate.id)}
                  >
                    <Copy /> {t('common.copy')}
                  </Button>
                  {gate.kind !== 'builtin' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteTarget(gate)}
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
          {t('gates.total', { count: filtered.length })}
          {selected.size > 0 ? ` · ${t('common.selected', { count: selected.size })}` : ''}
        </div>
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

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.delete')}</DialogTitle>
            <DialogDescription>
              {t('gates.deleteConfirm', { name: deleteTarget?.name ?? '' })}
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
