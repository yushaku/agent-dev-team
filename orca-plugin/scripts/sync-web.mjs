// Builds web/ from dashboard/web so the panel runs the dashboard's own render code, not a fork.
//   node scripts/sync-web.mjs          write web/ and delete generated files the dashboard no longer has
//   node scripts/sync-web.mjs --check  exit 1 when web/ differs from what dashboard/web produces
// web/panel.js, panel.css and source.js are the plugin's own and are never touched.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const SRC = join(here, '..', '..', 'dashboard', 'web')
export const OUT = join(here, '..', 'web')
const ENTRY = 'js/dash.js' // the module the panel boots
const GENERATED_DIRS = ['css', 'js']

/** ENTRY plus every module it imports, transitively ("./x.js" relative or "/js/x.js" absolute), plus the stylesheet. */
export function sources(src = SRC) {
  const seen = new Set(), queue = [ENTRY]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(join(src, file), 'utf8')
    for (const [, spec] of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+\.js)["']/g)) {
      const target = spec.startsWith('/') ? spec.slice(1) : relative(src, resolve(src, dirname(file), spec))
      if (!existsSync(join(src, target))) throw new Error(`${file} imports ${spec}, which is not in dashboard/web`)
      queue.push(target)
    }
  }
  return ['css/app.css', ...[...seen].sort()]
}

function swap(html, from, to) {
  if (!html.includes(from)) throw new Error(`dashboard/web/index.html no longer contains: ${from.slice(0, 70)}`)
  return html.replace(from, to)
}

/** The page: index.html minus the top bar and its script, plus the panel's own files. */
function panelHtml(src) {
  let html = readFileSync(join(src, 'index.html'), 'utf8')
  html = swap(html, '<meta name="color-scheme" content="dark">', '<meta name="color-scheme" content="dark light">')
  html = swap(html, '<link rel="stylesheet" href="/css/app.css">', '<link rel="stylesheet" href="css/app.css">\n<link rel="stylesheet" href="panel.css">')
  const bar = html.match(/<header class="topbar">[\s\S]*?<\/header>\n?/)
  if (!bar) throw new Error('dashboard/web/index.html has no <header class="topbar">')
  html = html.replace(bar[0], '')
  return swap(html, '<script type="module" src="/js/main.js"></script>', '<script type="module" src="panel.js"></script>')
}

export function build(src = SRC) {
  const files = new Map(sources(src).map((f) => [f, readFileSync(join(src, f), 'utf8')]))
  files.set('panel.html', panelHtml(src))
  return files
}

function listed(out, dir = out) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? listed(out, p) : [relative(out, p)]
  })
}

/** Differences between what build() makes and what is on disk: missing, changed, stale. */
export function drift({ src = SRC, out = OUT } = {}) {
  const want = build(src), problems = []
  for (const [f, text] of want) {
    const p = join(out, f)
    if (!existsSync(p)) problems.push(`missing ${f}`)
    else if (readFileSync(p, 'utf8') !== text) problems.push(`changed ${f}`)
  }
  for (const d of GENERATED_DIRS) for (const f of listed(out, join(out, d))) if (!want.has(f)) problems.push(`stale ${f}`)
  return problems
}

/** Writes every generated file and removes stale ones (and directories they leave empty). */
export function sync({ src = SRC, out = OUT } = {}) {
  const want = build(src)
  for (const [f, text] of want) {
    const p = join(out, f)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, text)
  }
  for (const d of GENERATED_DIRS) {
    for (const f of listed(out, join(out, d))) if (!want.has(f)) rmSync(join(out, f))
    pruneEmpty(join(out, d))
  }
}
function pruneEmpty(dir) {
  if (!existsSync(dir)) return
  for (const n of readdirSync(dir)) if (statSync(join(dir, n)).isDirectory()) pruneEmpty(join(dir, n))
  if (!readdirSync(dir).length && dir !== join(OUT)) rmSync(dir, { recursive: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const problems = drift()
    if (problems.length) {
      console.error('orca-plugin/web is out of sync with dashboard/web:\n  ' + problems.join('\n  ') + '\nRun: node orca-plugin/scripts/sync-web.mjs')
      process.exit(1)
    }
    console.log('orca-plugin/web matches dashboard/web')
  } else {
    sync()
    console.log('wrote orca-plugin/web from dashboard/web')
  }
}
