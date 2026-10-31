import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'

/**
 * Vite `base: '/zeda/'` emits asset URLs under /zeda/..., but files are written to dist/assets.
 * Cloudflare Workers Assets publish dist at the site root, so move runtime files under dist/zeda/.
 * Keep dist/index.html at root for SPA not_found_handling on routes like /zeda/lgc.
 */
const dist = path.resolve('dist')
const nested = path.join(dist, 'zeda')

mkdirSync(nested, { recursive: true })

const keepAtRoot = new Set([
  'index.html',
  'zeda',
  'wrangler.json',
  'wrangler.jsonc',
  '.assetsignore',
  '.wrangler',
])

for (const name of readdirSync(dist)) {
  if (keepAtRoot.has(name)) continue
  const from = path.join(dist, name)
  const to = path.join(nested, name)
  if (existsSync(to)) rmSync(to, { recursive: true, force: true })
  renameSync(from, to)
}

cpSync(path.join(dist, 'index.html'), path.join(nested, 'index.html'))

if (!existsSync(path.join(nested, 'assets'))) {
  console.error('prepare-cf-assets: missing dist/zeda/assets after move')
  process.exit(1)
}

console.log('prepare-cf-assets: static files are under /zeda/*')
