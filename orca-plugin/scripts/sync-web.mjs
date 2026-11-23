// Builds web/ from dashboard/web so the panel runs the dashboard's own render code, not a fork.
//   node scripts/sync-web.mjs          write web/
//   node scripts/sync-web.mjs --check  exit 1 when web/ differs from what dashboard/web produces
// web/panel.js and web/panel.css are the plugin's own and are never touched.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..', '..', 'dashboard', 'web')
const OUT = join(here, '..', 'web')

/** Dashboard files copied byte for byte: everything dash.js imports, plus the stylesheet. */
const COPY = ['css/app.css', 'js/dash.js', 'js/lib/charts.js', ...tabs()]
function tabs() {
  return readdirSync(join(SRC, 'js', 'tabs')).filter((f) => f.endsWith('.js')).map((f) => `js/tabs/${f}`)
}

function swap(html, from, to) {
  if (!html.includes(from)) throw new Error(`dashboard/web/index.html no longer contains: ${from.slice(0, 70)}`)
  return html.replace(from, to)
}

/** The page: index.html minus the top bar and its script, plus the panel's own files. */
function panelHtml() {
  let html = readFileSync(join(SRC, 'index.html'), 'utf8')
  html = swap(html, '<meta name="color-scheme" content="dark">', '<meta name="color-scheme" content="dark light">')
  html = swap(html, '<link rel="stylesheet" href="/css/app.css">', '<link rel="stylesheet" href="css/app.css">\n<link rel="stylesheet" href="panel.css">')
  const bar = html.match(/<header class="topbar">[\s\S]*?<\/header>\n?/)
  if (!bar) throw new Error('dashboard/web/index.html has no <header class="topbar">')
  html = html.replace(bar[0], '')
  html = swap(html, '<script type="module" src="/js/main.js"></script>', '<script type="module" src="panel.js"></script>')
  return html
}

export function build() {
  const files = new Map(COPY.map((f) => [f, readFileSync(join(SRC, f), 'utf8')]))
  files.set('panel.html', panelHtml())
  return files
}

const GENERATED_DIRS = ['css', 'js']
function listed(dir, base = dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? listed(p, base) : [relative(OUT, p)]
  })
}

/** Differences between what build() makes and what is on disk (missing, changed, stale). */
export function drift() {
  const want = build(), problems = []
  for (const [f, text] of want) {
    const p = join(OUT, f)
    if (!existsSync(p)) problems.push(`missing ${f}`)
    else if (readFileSync(p, 'utf8') !== text) problems.push(`changed ${f}`)
  }
  for (const d of GENERATED_DIRS) for (const f of listed(join(OUT, d))) if (!want.has(f)) problems.push(`stale ${f}`)
  return problems
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
    for (const [f, text] of build()) {
      const p = join(OUT, f)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, text)
    }
    console.log('wrote orca-plugin/web from dashboard/web')
  }
}
