import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(root, 'scripts/smoke-cpu-datapath-run.ts')
const r = spawnSync('pnpm', ['dlx', 'vite-node', runner], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
