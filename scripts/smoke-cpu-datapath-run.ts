import { assemble } from '../src/features/cpu/lib/assembler'
import {
  createDatapathState,
  loadDatapathMemory,
  runDatapath,
  stepDatapath,
} from '../src/features/cpu/lib/datapath-sim'
import {
  createCpuState,
  loadMemory,
  resetCpu,
  stepCpu,
} from '../src/features/cpu/lib/cpu-runtime'
import { TEACHING_MEM_SIZE } from '../src/features/cpu/lib/isa'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const demoAdd = `
LOADI R0, 3
LOADI R1, 5
ADD R0, R1
STORE R0, 0x0E
HALT
`

const tooBig = `
ORG 0x10
DB 0x01
ORG 0x00
HALT
`

const asm = assemble(demoAdd)
assert(asm.ok, 'assemble demo_add')
assert(asm.highWater <= TEACHING_MEM_SIZE, `highWater ${asm.highWater}`)

let dp = loadDatapathMemory(createDatapathState(), asm.bytes, asm.highWater)
let cpu = resetCpu(loadMemory(createCpuState(), asm.bytes, 0), true)

// Step through FETCH0: IR should become LOADI opcode byte
{
  const r = stepDatapath(dp)
  assert(!r.error, r.error ?? '')
  dp = r.state
  const cr = stepCpu(cpu)
  assert(!cr.error, cr.error ?? '')
  cpu = cr.state
  assert(dp.phase === 'FETCH1', `phase=${dp.phase}`)
  assert(dp.ir === cpu.ir, 'IR after FETCH0')
  assert(dp.pc === cpu.pc, 'PC after FETCH0')
  console.log('ok FETCH0 IR=0x' + dp.ir.toString(16))
}

const run = runDatapath(dp, 50_000)
assert(!run.error, run.error ?? '')
assert(run.state.halted, 'should halt')
assert(run.state.regs[0] === 8, `R0=${run.state.regs[0]} expected 8`)
assert(run.state.mem[0x0e] === 8, `mem[0x0E]=${run.state.mem[0x0e]}`)
console.log('ok EXEC/WB STORE R0=8 mem[0x0E]=8')

const big = assemble(tooBig)
assert(big.ok, 'assemble tooBig')
let threw = false
try {
  loadDatapathMemory(createDatapathState(), big.bytes, big.highWater)
} catch (e) {
  threw = true
  console.log('ok load reject:', (e as Error).message)
}
assert(threw, 'expected load to reject >16')

console.log('smoke-cpu-datapath: PASS')
