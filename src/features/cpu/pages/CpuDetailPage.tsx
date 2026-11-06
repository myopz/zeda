import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DatapathCanvas } from '../components/DatapathCanvas'
import { assemble, formatAssembleErrors } from '../lib/assembler'
import {
  createDatapathState,
  loadDatapathMemory,
  resetDatapath,
  stepDatapath,
  type DatapathState,
} from '../lib/datapath-sim'
import {
  createCpuState,
  loadMemory,
  resetCpu,
  stepCpu,
  type CpuState,
} from '../lib/cpu-runtime'
import { OP_TO_MNEMONIC, TEACHING_MEM_SIZE, decodeByte0 } from '../lib/isa'
import {
  duplicateProgram,
  getProgram,
  updateProgram,
} from '../db/repository'
import type { CpuProgram } from '../types'

function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0')
}

function memDumpTeaching(mem: Uint8Array, focus: number): string {
  const lines: string[] = []
  for (let r = 0; r < TEACHING_MEM_SIZE; r += 8) {
    const bytes = Array.from({ length: 8 }, (_, i) => {
      const addr = r + i
      if (addr >= TEACHING_MEM_SIZE) return '  '
      return hex2(mem[addr]!)
    })
    const mark = focus >= r && focus < r + 8 ? '◀' : ' '
    lines.push(`${hex2(r)}: ${bytes.join(' ')} ${mark}`)
  }
  return lines.join('\n')
}

/** Compare teaching datapath vs behavior runtime on shared architectural state. */
function compareStates(dp: DatapathState, cpu: CpuState): string | null {
  if (dp.pc !== cpu.pc) return `PC mismatch: datapath=0x${hex2(dp.pc)} runtime=0x${hex2(cpu.pc)}`
  if (dp.ir !== cpu.ir) return `IR mismatch: datapath=0x${hex2(dp.ir)} runtime=0x${hex2(cpu.ir)}`
  if (dp.imm !== cpu.imm) return `IMM mismatch: datapath=0x${hex2(dp.imm)} runtime=0x${hex2(cpu.imm)}`
  if (dp.phase !== cpu.phase) {
    return `phase mismatch: datapath=${dp.phase} runtime=${cpu.phase}`
  }
  if (dp.z !== cpu.z || dp.c !== cpu.c) {
    return `flags mismatch: datapath Z=${dp.z} C=${dp.c} runtime Z=${cpu.z} C=${cpu.c}`
  }
  for (let i = 0; i < 8; i += 1) {
    if (dp.regs[i] !== cpu.regs[i]) {
      return `R${i} mismatch: datapath=0x${hex2(dp.regs[i]!)} runtime=0x${hex2(cpu.regs[i]!)}`
    }
  }
  for (let i = 0; i < TEACHING_MEM_SIZE; i += 1) {
    if (dp.mem[i] !== cpu.mem[i]) {
      return `Mem[0x${hex2(i)}] mismatch: datapath=0x${hex2(dp.mem[i]!)} runtime=0x${hex2(cpu.mem[i]!)}`
    }
  }
  return null
}

export function CpuDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [program, setProgram] = useState<CpuProgram | null>(null)
  const [source, setSource] = useState('')
  const [dp, setDp] = useState<DatapathState>(() => createDatapathState())
  const [cpu, setCpu] = useState<CpuState>(() => createCpuState())
  const dpRef = useRef(dp)
  const cpuRef = useRef(cpu)
  dpRef.current = dp
  cpuRef.current = cpu
  const [compareOn, setCompareOn] = useState(true)
  const compareOnRef = useRef(compareOn)
  compareOnRef.current = compareOn
  const [machineHex, setMachineHex] = useState<string>('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const runTimer = useRef<number | null>(null)

  const commitSim = useCallback((nextDp: DatapathState, nextCpu: CpuState) => {
    dpRef.current = nextDp
    cpuRef.current = nextCpu
    setDp(nextDp)
    setCpu(nextCpu)
  }, [])

  const load = useCallback(async () => {
    if (!id) return
    const p = await getProgram(id)
    if (!p) {
      navigate('/cpu')
      return
    }
    setProgram(p)
    setSource(p.source)
    commitSim(createDatapathState(), createCpuState())
    setMachineHex('')
    setStatus(null)
    setError(null)
  }, [id, navigate, commitSim])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      if (runTimer.current != null) window.clearInterval(runTimer.current)
    }
  }, [])

  const readonly = program?.kind === 'builtin'

  async function onSave() {
    if (!program || readonly) return
    const next = await updateProgram({ ...program, source })
    setProgram(next)
    setStatus(t('cpu.saved'))
  }

  async function onCopy() {
    if (!program) return
    const p = await duplicateProgram(program.id, t('cpu.copySuffix'))
    navigate(`/cpu/${p.id}`)
  }

  function onAssemble() {
    setError(null)
    const result = assemble(source)
    if (!result.ok) {
      setError(t('cpu.asmError', { message: formatAssembleErrors(result.errors) }))
      setMachineHex('')
      return
    }
    const hex = Array.from(result.bytes)
      .map((b, i) => (i % 16 === 0 ? `\n${hex2(i)}: ` : ' ') + hex2(b))
      .join('')
      .trim()
    setMachineHex(hex)
    setStatus(t('cpu.assembledOk', { bytes: result.highWater }))
    return result
  }

  function onLoad() {
    setError(null)
    const result = assemble(source)
    if (!result.ok) {
      setError(t('cpu.asmError', { message: formatAssembleErrors(result.errors) }))
      return
    }
    const hex = Array.from(result.bytes)
      .map((b, i) => (i % 16 === 0 ? `\n${hex2(i)}: ` : ' ') + hex2(b))
      .join('')
      .trim()
    setMachineHex(hex)
    try {
      const nextDp = loadDatapathMemory(
        createDatapathState(),
        result.bytes,
        result.highWater,
      )
      const nextCpu = resetCpu(loadMemory(createCpuState(), result.bytes, 0), true)
      commitSim(nextDp, nextCpu)
      setStatus(t('cpu.loadedOk', { addr: '00' }))
    } catch (err) {
      setError(
        t('cpu.loadTeachingError', {
          message: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  function stopRun() {
    setRunning(false)
    if (runTimer.current != null) {
      window.clearInterval(runTimer.current)
      runTimer.current = null
    }
  }

  function onReset() {
    const nextDp = resetDatapath(dpRef.current, true)
    const nextCpu = resetCpu(cpuRef.current, true)
    commitSim(nextDp, nextCpu)
    setError(null)
    stopRun()
  }

  /** Pure step — no React setState; safe to call from interval / Strict Mode. */
  function advanceOnce(curDp: DatapathState, curCpu: CpuState, doCompare: boolean): {
    dp: DatapathState
    cpu: CpuState
    error?: string
  } {
    const r = stepDatapath(curDp)
    if (r.error) return { dp: r.state, cpu: curCpu, error: r.error }
    let nextCpu = curCpu
    if (doCompare) {
      const cr = stepCpu(curCpu)
      if (cr.error) {
        return {
          dp: r.state,
          cpu: cr.state,
          error: `runtime: ${cr.error}`,
        }
      }
      nextCpu = cr.state
      const mismatch = compareStates(r.state, nextCpu)
      if (mismatch) {
        return { dp: r.state, cpu: nextCpu, error: t('cpu.compareMismatch', { message: mismatch }) }
      }
    }
    return { dp: r.state, cpu: nextCpu }
  }

  function onStep() {
    setError(null)
    const r = advanceOnce(dpRef.current, cpuRef.current, compareOnRef.current)
    commitSim(r.dp, r.cpu)
    if (r.error) setError(t('cpu.runtimeError', { message: r.error }))
  }

  function onRun() {
    if (running) {
      stopRun()
      return
    }
    setRunning(true)
    setError(null)
    runTimer.current = window.setInterval(() => {
      const curDp = dpRef.current
      if (curDp.halted || curDp.phase === 'HALTED') {
        stopRun()
        return
      }
      // Advance via refs only — never inside setState updaters (Strict Mode double-invoke).
      const r = advanceOnce(curDp, cpuRef.current, compareOnRef.current)
      commitSim(r.dp, r.cpu)
      if (r.error) {
        setError(t('cpu.runtimeError', { message: r.error }))
        stopRun()
        return
      }
      if (r.dp.halted || r.dp.phase === 'HALTED') stopRun()
    }, 50)
  }

  function onRunToHalt() {
    setError(null)
    let curDp = dpRef.current
    let curCpu = cpuRef.current
    for (let i = 0; i < 50_000; i += 1) {
      if (curDp.halted || curDp.phase === 'HALTED') break
      const r = advanceOnce(curDp, curCpu, compareOnRef.current)
      curDp = r.dp
      curCpu = r.cpu
      if (r.error) {
        setError(t('cpu.runtimeError', { message: r.error }))
        break
      }
    }
    commitSim(curDp, curCpu)
  }

  if (!program) {
    return (
      <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>
    )
  }

  const { opcode } = decodeByte0(dp.ir)
  const mnem = OP_TO_MNEMONIC[opcode] ?? `?${opcode.toString(16)}`
  const sig = dp.signals

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/cpu" className="text-sm text-muted-foreground hover:underline">
            ← {t('cpu.title')}
          </Link>
          <h1 className="text-xl font-semibold">{program.name}</h1>
          {readonly && (
            <p className="text-xs text-muted-foreground">{t('cpu.builtinReadonly')}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {readonly ? (
            <Button type="button" variant="outline" onClick={() => void onCopy()}>
              {t('cpu.copyAsCustom')}
            </Button>
          ) : (
            <Button type="button" onClick={() => void onSave()}>
              {t('common.save')}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="circuit" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="circuit">{t('cpu.tabCircuit')}</TabsTrigger>
          <TabsTrigger value="asm">{t('cpu.tabAsm')}</TabsTrigger>
        </TabsList>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onAssemble}>
            {t('cpu.assemble')}
          </Button>
          <Button type="button" onClick={onLoad}>
            {t('cpu.load')}
          </Button>
          <Button type="button" variant="outline" onClick={onReset}>
            {t('cpu.reset')}
          </Button>
          <Button type="button" variant="outline" onClick={onStep}>
            {t('cpu.step')}
          </Button>
          <Button type="button" variant="outline" onClick={onRun}>
            {running ? t('cpu.stop') : t('cpu.run')}
          </Button>
          <Button type="button" variant="ghost" onClick={onRunToHalt}>
            Run→HALT
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={compareOn}
              onChange={(e) => setCompareOn(e.target.checked)}
            />
            {t('cpu.compareRuntime')}
          </label>
        </div>

        {status && <p className="text-sm text-muted-foreground">{status}</p>}
        {error && (
          <pre className="whitespace-pre-wrap rounded border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
            {error}
          </pre>
        )}

        <TabsContent value="circuit" className="mt-2 flex min-h-0 flex-1 flex-col gap-2 data-[state=inactive]:hidden">
          <div className="flex flex-wrap gap-3 rounded border px-3 py-2 font-mono text-xs">
            <span>
              {t('cpu.phase')}={dp.phase}
            </span>
            <span>
              {t('cpu.pc')}=0x{hex2(dp.pc)}
            </span>
            <span>
              {t('cpu.ir')}=0x{hex2(dp.ir)} ({mnem})
            </span>
            <span>IMM=0x{hex2(dp.imm)}</span>
            <span>cycle={dp.cycle}</span>
            <span>
              {t('cpu.halted')}={dp.halted ? '1' : '0'}
            </span>
            <span className="text-muted-foreground">
              ctl: pcInc={sig.pcInc ? 1 : 0} pcLoad={sig.pcLoad ? 1 : 0} irLoad=
              {sig.irLoad ? 1 : 0} rfWe={sig.rfWe ? 1 : 0} memWe={sig.memWe ? 1 : 0}{' '}
              memRead={sig.memRead ? 1 : 0}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t('cpu.datapathHint')}</p>
          <DatapathCanvas state={dp} className="min-h-0 flex-1" />
        </TabsContent>

        <TabsContent value="asm" className="mt-2 grid min-h-0 flex-1 gap-3 data-[state=inactive]:hidden lg:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="text-sm font-medium">{t('cpu.asm')}</div>
            <Textarea
              className="min-h-[280px] flex-1 font-mono text-sm"
              value={source}
              readOnly={readonly}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t('cpu.asmPlaceholder')}
            />
            <div className="text-sm font-medium">{t('cpu.machineCode')}</div>
            <pre className="max-h-40 overflow-auto rounded border bg-muted/40 p-2 font-mono text-xs">
              {machineHex || t('cpu.noMachineCode')}
            </pre>
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-auto">
            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium">{t('cpu.control')}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">{t('cpu.pc')}</dt>
                  <dd>0x{hex2(dp.pc)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('cpu.ir')}</dt>
                  <dd>
                    0x{hex2(dp.ir)} ({mnem})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">IMM</dt>
                  <dd>0x{hex2(dp.imm)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('cpu.phase')}</dt>
                  <dd>{dp.phase}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">cycle</dt>
                  <dd>{dp.cycle}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('cpu.halted')}</dt>
                  <dd>{dp.halted ? '1' : '0'}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium">{t('cpu.flags')}</div>
              <div className="font-mono text-sm">
                Z={dp.z} C={dp.c}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium">{t('cpu.registers')}</div>
              <div className="grid grid-cols-4 gap-2 font-mono text-sm">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i}>
                    R{i}=0x{hex2(dp.regs[i]!)}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium">
                {t('cpu.memory')} (16×8)
              </div>
              <pre className="overflow-auto font-mono text-xs leading-relaxed">
                {memDumpTeaching(dp.mem, dp.pc)}
              </pre>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
