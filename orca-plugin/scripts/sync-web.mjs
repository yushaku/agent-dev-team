// Generates the parts of the plugin that come from the repository, so the plugin folder is self-contained:
//   web/           the Tasks panel: the dashboard's own render code (dash.js and what it imports), css, panel.html
//   ledger/        a copy of ledger/*.ts (the worker imports it; no ../../ledger at run time)
//   dashboard-web/ the full dashboard web bundle the API serves on 4747/4748 (index.html, js, css, vendor)
//   node scripts/sync-web.mjs          write all three and delete generated files the sources no longer have
//   node scripts/sync-web.mjs --check  exit 1 when any of them differs from its source
// web/panel.js, panel.css and source.js are the plugin's own and are never touched.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
/** Everything read or written must sit under this directory, and no component below it may be a link. */
export const REPO = join(here, '..', '..')
export const SRC = join(REPO, 'dashboard', 'web')
export const OUT = join(here, '..', 'web')
export const LEDGER_SRC = join(REPO, 'ledger')
export const LEDGER_OUT = join(here, '..', 'ledger')
export const BUNDLE_OUT = join(here, '..', 'dashboard-web')
const ENTRY = 'js/dash.js' // the module the panel boots
const GENERATED_DIRS = ['css', 'js']

/** Path components split with the platform separator; `.` and empty parts go, and a parent part is an error. */
function parts(path) {
  const out = []
  for (const part of path.split(sep)) {
    if (part === '..') throw new Error(`${path}: parent components (..) are not allowed`)
    if (part && part !== '.') out.push(part)
  }
  return out
}
const native = (key) => key.split('/').join(sep) // keys of the file maps are written with "/"

/**
 * Never follow a link: a symlinked source or destination could make the sync read from, write to or delete
 * files outside the trees. Validation starts at the trusted `boundary` and walks every component down through
 * `root` and `rel` with lstat, so a link in a parent directory of the root is caught as well as one inside it.
 * Returns the path, or the first missing path on the way (nothing exists below it).
 */
export function plain(root, rel = '', boundary = REPO) {
  if (root.split(sep).includes('..')) throw new Error(`${root}: parent components (..) are not allowed in a root`)
  const base = resolve(boundary), target = resolve(root)
  const inside = relative(base, target)
  if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) throw new Error(`${target} is outside the trusted boundary ${base}`)
  const all = [...parts(inside), ...parts(rel)]
  let at = base
  for (const part of all) {
    at = join(at, part)
    let info
    try { info = lstatSync(at) } catch (error) { if (error.code === 'ENOENT') break; throw error }
    if (info.isSymbolicLink()) throw new Error(`${at} is a symbolic link; the sync never follows links (replace it with a real file or directory)`)
  }
  return join(base, ...all)
}
const readSource = (src, file, o) => readFileSync(plain(src, native(file), o.boundary), 'utf8')
const readBytes = (src, file, o) => readFileSync(plain(src, native(file), o.boundary))

/** Code without block comments and whole-line comments, so a commented-out import is not a dependency. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const IMPORTS = [
  /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']/gm, // import x from "m" / export * from "m" (lists may span lines)
  /^\s*import\s*["']([^"']+)["']/gm, // import "m"
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g // import("m")
]
const opts = (o = {}) => ({ src: SRC, out: OUT, boundary: REPO, ...o })

/**
 * ENTRY plus every module it imports, transitively, plus the stylesheet. Imports must be relative and land
 * inside js/ of the dashboard tree: that is what is copied, scanned for stale files and loadable after the copy
 * (a root-relative "/js/x.js" would resolve against Orca's frame origin, not the plugin).
 */
export function sources(src = SRC, boundary = REPO) {
  const o = { boundary }
  const seen = new Set(), queue = [ENTRY]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const text = code(readSource(src, file, o))
    for (const pattern of IMPORTS) {
      for (const [, spec] of text.matchAll(pattern)) {
        if (!spec.startsWith('./') && !spec.startsWith('../')) throw new Error(`${file} imports "${spec}": only relative imports inside js/ are supported by the panel`)
        const target = relative(src, resolve(src, dirname(file), spec))
        if (!target.startsWith('js' + sep) || target.split(sep).includes('..')) throw new Error(`${file} imports "${spec}", which resolves outside dashboard/web/js`)
        if (!existsSync(plain(src, target, boundary))) throw new Error(`${file} imports "${spec}", which is not in dashboard/web`)
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
function panelHtml(o) {
  let html = readSource(o.src, 'index.html', o)
  html = swap(html, '<meta name="color-scheme" content="dark">', '<meta name="color-scheme" content="dark light">')
  html = swap(html, '<link rel="stylesheet" href="/css/app.css">', '<link rel="stylesheet" href="css/app.css">\n<link rel="stylesheet" href="panel.css">')
  const bar = html.match(/<header class="topbar">[\s\S]*?<\/header>\n?/)
  if (!bar) throw new Error('dashboard/web/index.html has no <header class="topbar">')
  html = html.replace(bar[0], '')
  return swap(html, '<script type="module" src="/js/main.js"></script>', '<script type="module" src="panel.js"></script>')
}

/** Every regular file under `dir` (relative, "/"-separated), never following a link. */
function walk(dir, boundary, base = dir) {
  const safe = plain(dir, '', boundary) // validated; this is the path that is read, not the raw argument
  if (!existsSync(safe)) return []
  return readdirSync(safe, { withFileTypes: true }).flatMap((entry) => {
    const path = join(safe, entry.name)
    if (entry.isSymbolicLink()) plain(path, '', boundary) // throws, naming the link
    return entry.isDirectory() ? walk(path, boundary, base) : [relative(base, path).split(sep).join('/')]
  })
}

/** What the sources must contain before anything is written or pruned: a missing tree must not look like an empty one. */
function requireInputs(o) {
  const ledgerSrc = o.ledgerSrc ?? LEDGER_SRC
  const need = [[o.src, 'index.html'], [o.src, ENTRY], [o.src, 'css/app.css'], [ledgerSrc, 'ingest.ts'], [ledgerSrc, 'http.ts'], [ledgerSrc, 'api.ts'], [ledgerSrc, 'lock.ts']]
  const missing = need.filter(([root, file]) => !existsSync(plain(root, native(file), o.boundary))).map(([root, file]) => join(root, native(file)))
  if (missing.length) throw new Error(`the sources are incomplete, nothing was written or removed. Missing:\n  ${missing.join('\n  ')}`)
}

/** The three generated trees: { out, files: Map(rel -> text), scanned: where stale files are looked for }. */
function targets(o) {
  requireInputs(o)
  const web = new Map(sources(o.src, o.boundary).map((f) => [f, readSource(o.src, f, o)]))
  web.set('panel.html', panelHtml(o))
  const ledgerSrc = o.ledgerSrc ?? LEDGER_SRC
  const ledger = new Map(
    walk(ledgerSrc, o.boundary).filter((f) => !f.includes('/') && f.endsWith('.ts')).map((f) => [f, readBytes(ledgerSrc, f, o)])
  )
  const bundle = new Map(walk(o.src, o.boundary).map((f) => [f, readBytes(o.src, f, o)])) // straight copies are bytes, never decoded
  return [
    { name: 'web', out: o.out, files: web, scanned: GENERATED_DIRS },
    { name: 'ledger', out: o.ledgerOut ?? LEDGER_OUT, files: ledger, scanned: [''] },
    { name: 'dashboard-web', out: o.bundleOut ?? BUNDLE_OUT, files: bundle, scanned: [''] }
  ]
}

/** The panel's files (web/) as a Map, for tests of the import rules. */
export function build(src = SRC) { return targets(opts({ src })) [0].files }

function stale(t, o) {
  const found = []
  for (const dir of t.scanned) for (const f of walk(join(t.out, dir), o.boundary, t.out)) if (!t.files.has(f)) found.push(f)
  return found
}

/** Differences between what the sources produce and what is on disk: missing, changed, stale. */
export function drift(options) {
  const o = opts(options), problems = []
  for (const t of targets(o)) {
    const label = t.name === 'web' ? '' : t.name + '/'
    for (const [f, text] of t.files) {
      const p = plain(t.out, native(f), o.boundary)
      if (!existsSync(p)) problems.push(`missing ${label}${f}`)
      else if (Buffer.compare(readFileSync(p), Buffer.from(text)) !== 0) problems.push(`changed ${label}${f}`)
    }
    for (const f of stale(t, o)) problems.push(`stale ${label}${f}`)
  }
  return problems
}

/** Writes every generated file and removes stale ones (and directories they leave empty). */
export function sync(options) {
  const o = opts(options)
  for (const t of targets(o)) {
    plain(t.out, '', o.boundary) // the output root itself, and every parent of it
    for (const [f, text] of t.files) {
      plain(t.out, native(f), o.boundary) // refuses a link anywhere on the way before anything is created or written
      mkdirSync(dirname(join(t.out, native(f))), { recursive: true })
      writeFileSync(plain(t.out, native(f), o.boundary), text)
    }
    for (const f of stale(t, o)) rmSync(plain(t.out, native(f), o.boundary))
    for (const dir of t.scanned) pruneEmpty(join(t.out, dir), t.out, o.boundary, true)
  }
}
function pruneEmpty(dir, out, boundary, top = false) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) pruneEmpty(join(dir, entry.name), out, boundary)
  if (!readdirSync(dir).length && !(top && dir === out)) rmSync(plain(out, relative(out, dir), boundary), { recursive: true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const problems = drift()
    if (problems.length) {
      console.error('orca-plugin is out of sync with the repository:\n  ' + problems.join('\n  ') + '\nRun: node orca-plugin/scripts/sync-web.mjs')
      process.exit(1)
    }
    console.log('orca-plugin/web, ledger and dashboard-web match the repository')
  } else {
    sync()
    console.log('wrote orca-plugin/web, ledger and dashboard-web from the repository')
  }
}
