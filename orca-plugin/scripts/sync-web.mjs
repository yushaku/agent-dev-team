// Builds web/ from dashboard/web so the panel runs the dashboard's own render code, not a fork.
//   node scripts/sync-web.mjs          write web/ and delete generated files the dashboard no longer has
//   node scripts/sync-web.mjs --check  exit 1 when web/ differs from what dashboard/web produces
// web/panel.js, panel.css and source.js are the plugin's own and are never touched.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const SRC = join(here, '..', '..', 'dashboard', 'web')
export const OUT = join(here, '..', 'web')
const ENTRY = 'js/dash.js' // the module the panel boots
const GENERATED_DIRS = ['css', 'js']

/**
 * Never follow a link: a symlinked source or destination could make the sync read from, write to or delete
 * files outside the two trees. `rel` is checked component by component with lstat, and so is the root itself.
 */
function plain(root, rel = '') {
  let at = root
  for (const part of ['', ...rel.split(/[\\/]/).filter(Boolean)]) {
    at = part ? join(at, part) : at
    let info
    try { info = lstatSync(at) } catch (error) { if (error.code === 'ENOENT') return at; throw error }
    if (info.isSymbolicLink()) throw new Error(`${at} is a symbolic link; the sync never follows links (replace it with a real file or directory)`)
  }
  return at
}
const readSource = (src, file) => readFileSync(plain(src, file), 'utf8')

/** Code without block comments and whole-line comments, so a commented-out import is not a dependency. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const IMPORTS = [
  /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']/gm, // import x from "m" / export * from "m" (lists may span lines)
  /^\s*import\s*["']([^"']+)["']/gm, // import "m"
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g // import("m")
]

/**
 * ENTRY plus every module it imports, transitively, plus the stylesheet. Imports must be relative and land
 * inside js/ of the dashboard tree: that is what is copied, scanned for stale files and loadable after the copy
 * (a root-relative "/js/x.js" would resolve against Orca's frame origin, not the plugin).
 */
export function sources(src = SRC) {
  const seen = new Set(), queue = [ENTRY]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const text = code(readSource(src, file))
    for (const pattern of IMPORTS) {
      for (const [, spec] of text.matchAll(pattern)) {
        if (!spec.startsWith('./') && !spec.startsWith('../')) throw new Error(`${file} imports "${spec}": only relative imports inside js/ are supported by the panel`)
        const target = relative(src, resolve(src, dirname(file), spec))
        if (!target.startsWith('js' + sep) || target.split(sep).includes('..')) throw new Error(`${file} imports "${spec}", which resolves outside dashboard/web/js`)
        if (!existsSync(plain(src, target))) throw new Error(`${file} imports "${spec}", which is not in dashboard/web`)
        queue.push(target.split(sep).join('/'))
      }
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
  let html = readSource(src, 'index.html')
  html = swap(html, '<meta name="color-scheme" content="dark">', '<meta name="color-scheme" content="dark light">')
  html = swap(html, '<link rel="stylesheet" href="/css/app.css">', '<link rel="stylesheet" href="css/app.css">\n<link rel="stylesheet" href="panel.css">')
  const bar = html.match(/<header class="topbar">[\s\S]*?<\/header>\n?/)
  if (!bar) throw new Error('dashboard/web/index.html has no <header class="topbar">')
  html = html.replace(bar[0], '')
  return swap(html, '<script type="module" src="/js/main.js"></script>', '<script type="module" src="panel.js"></script>')
}

export function build(src = SRC) {
  const files = new Map(sources(src).map((f) => [f, readSource(src, f)]))
  files.set('panel.html', panelHtml(src))
  return files
}

function listed(out, dir = out) {
  if (!existsSync(plain(dir, ''))) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name)
    if (entry.isSymbolicLink()) plain(p, '') // throws, naming the link
    return entry.isDirectory() ? listed(out, p) : [relative(out, p)]
  })
}

/** Differences between what build() makes and what is on disk: missing, changed, stale. */
export function drift({ src = SRC, out = OUT } = {}) {
  const want = build(src), problems = []
  for (const [f, text] of want) {
    const p = plain(out, f)
    if (!existsSync(p)) problems.push(`missing ${f}`)
    else if (readFileSync(p, 'utf8') !== text) problems.push(`changed ${f}`)
  }
  for (const d of GENERATED_DIRS) for (const f of listed(out, join(out, d))) if (!want.has(f)) problems.push(`stale ${f}`)
  return problems
}

/** Writes every generated file and removes stale ones (and directories they leave empty). */
export function sync({ src = SRC, out = OUT } = {}) {
  const want = build(src)
  plain(out) // the output root itself
  for (const [f, text] of want) {
    plain(out, f) // refuses a link anywhere on the way before anything is created or written
    mkdirSync(dirname(join(out, f)), { recursive: true })
    writeFileSync(plain(out, f), text)
  }
  for (const d of GENERATED_DIRS) {
    for (const f of listed(out, join(out, d))) if (!want.has(f)) rmSync(plain(out, f))
    pruneEmpty(join(out, d), out)
  }
}
function pruneEmpty(dir, out) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) pruneEmpty(join(dir, entry.name), out)
  if (!readdirSync(dir).length) rmSync(plain(out, relative(out, dir)), { recursive: true })
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
