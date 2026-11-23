import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { LEDGER_SRC, SRC, drift, plain, sources, sync } from './sync-web.mjs'

const scratch = () => {
  const root = mkdtempSync(join(tmpdir(), 'sync-web-'))
  const src = join(root, 'src'), out = join(root, 'out'), ledgerSrc = join(root, 'ledger-src')
  cpSync(SRC, src, { recursive: true })
  mkdirSync(ledgerSrc)
  for (const f of ['ingest.ts', 'lock.ts', 'http.ts', 'api.ts']) cpSync(join(LEDGER_SRC, f), join(ledgerSrc, f))
  const o = { src, out, boundary: root, ledgerSrc, ledgerOut: join(root, 'ledger-out'), bundleOut: join(root, 'bundle-out') }
  return { root, src, out, o }
}

test('the generated set follows dash.js imports, including new shared modules', () => {
  const { root, src, out, o } = scratch()
  try {
    const before = sources(src, root)
    assert.ok(before.includes('js/lib/charts.js') && before.includes('js/tabs/runs.js'))
    assert.ok(!before.includes('js/md.js'), 'not imported by dash.js, so not copied')
    writeFileSync(join(src, 'js/lib/extra.js'), 'export const x = 1\n')
    writeFileSync(join(src, 'js/tabs/skills.js'), readFileSync(join(src, 'js/tabs/skills.js'), 'utf8') + '\nimport { x } from "../lib/extra.js"; void x\n')
    assert.ok(sources(src, root).includes('js/lib/extra.js'))
    sync(o)
    assert.ok(existsSync(join(out, 'js/lib/extra.js')))
    assert.deepEqual(drift(o), [])
  } finally { rmSync(root, { recursive: true }) }
})

test('sync repairs what check reports: a removed source tab leaves no stale copy behind', () => {
  const { root, src, out, o } = scratch()
  try {
    sync(o)
    mkdirSync(join(out, 'js/old'), { recursive: true })
    writeFileSync(join(out, 'js/old/gone.js'), 'x')
    writeFileSync(join(out, 'js/tabs/removed.js'), 'x')
    writeFileSync(join(out, 'js/dash.js'), 'tampered')
    assert.deepEqual(drift(o).sort(), ['changed js/dash.js', 'stale js/old/gone.js', 'stale js/tabs/removed.js'])
    sync(o)
    assert.deepEqual(drift(o), [])
    assert.ok(!existsSync(join(out, 'js/old')), 'empty directories go too')
  } finally { rmSync(root, { recursive: true }) }
})

test('a commented-out import is not a dependency, so removing its file still syncs and prunes the old copy', () => {
  const { root, src, out, o } = scratch()
  try {
    writeFileSync(join(src, 'js/lib/extra.js'), 'export const x = 1\n')
    const skills = join(src, 'js/tabs/skills.js')
    const original = readFileSync(skills, 'utf8')
    writeFileSync(skills, original + '\nimport { x } from "../lib/extra.js"; void x\n')
    sync(o)
    assert.ok(existsSync(join(out, 'js/lib/extra.js')))
    writeFileSync(skills, original + '\n// import { x } from "../lib/extra.js"\n/* import { y } from "../lib/gone.js" */\n')
    rmSync(join(src, 'js/lib/extra.js'))
    sync(o)
    assert.ok(!existsSync(join(out, 'js/lib/extra.js')), 'the stale copy is pruned')
    assert.deepEqual(drift(o), [])
  } finally { rmSync(root, { recursive: true }) }
})

test('imports that would leave js/ or could not load from the panel are refused with a clear error', () => {
  const { root, src, o } = scratch()
  try {
    const skills = join(src, 'js/tabs/skills.js')
    const original = readFileSync(skills, 'utf8')
    for (const [line, message] of [
      ['import "../../css/helper.js"', /resolves outside dashboard\/web\/js/],
      ['import "../../../elsewhere.js"', /resolves outside dashboard\/web\/js/],
      ['import { q } from "/js/lib/charts.js"', /only relative imports inside js\//],
      ['import marked from "marked"', /only relative imports inside js\//],
      ['const m = await import("../../md.js")', /resolves outside dashboard\/web\/js/],
    ]) {
      writeFileSync(skills, original + '\n' + line + '\n')
      assert.throws(() => sources(src, root), message, line)
    }
  } finally { rmSync(root, { recursive: true }) }
})

import { lstatSync, readdirSync, symlinkSync } from 'node:fs'

test('a symlinked output directory is refused, and its target is left intact', () => {
  const { root, src, out, o } = scratch()
  try {
    sync(o)
    const outside = join(root, 'precious')
    mkdirSync(join(outside, 'tabs'), { recursive: true })
    writeFileSync(join(outside, 'keep.txt'), 'mine')
    writeFileSync(join(outside, 'tabs', 'stale.js'), 'would be pruned as stale')
    rmSync(join(out, 'js'), { recursive: true })
    symlinkSync(outside, join(out, 'js'))
    assert.throws(() => sync(o), /symbolic link/)
    assert.throws(() => drift(o), /symbolic link/)
    assert.deepEqual(readdirSync(outside).sort(), ['keep.txt', 'tabs'])
    assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'mine')
    assert.equal(readFileSync(join(outside, 'tabs', 'stale.js'), 'utf8'), 'would be pruned as stale')
    assert.ok(lstatSync(join(out, 'js')).isSymbolicLink(), 'the link itself is not replaced either')
  } finally { rmSync(root, { recursive: true }) }
})

test('a symlinked file or directory inside the output, and a symlinked output root, are refused', () => {
  const { root, src, out, o } = scratch()
  try {
    sync(o)
    const outside = join(root, 'precious')
    mkdirSync(outside)
    writeFileSync(join(outside, 'target.js'), 'original')
    rmSync(join(out, 'js/dash.js'))
    symlinkSync(join(outside, 'target.js'), join(out, 'js/dash.js'))
    assert.throws(() => sync(o), /symbolic link/)
    assert.equal(readFileSync(join(outside, 'target.js'), 'utf8'), 'original', 'nothing was written through the link')
    const linkedRoot = join(root, 'linked-out')
    symlinkSync(out, linkedRoot)
    assert.throws(() => sync({ ...o, out: linkedRoot }), /symbolic link/)
  } finally { rmSync(root, { recursive: true }) }
})

test('a symlinked source file or directory is refused', () => {
  const { root, src, out, o } = scratch()
  try {
    const outside = join(root, 'elsewhere.js')
    writeFileSync(outside, 'export const z = 1\n')
    rmSync(join(src, 'js/tabs/tokens.js'))
    symlinkSync(outside, join(src, 'js/tabs/tokens.js'))
    assert.throws(() => sync(o), /symbolic link/)
  } finally { rmSync(root, { recursive: true }) }
})

test('ledger/ and dashboard-web/ are generated, drift is reported for them, and stale files are pruned', () => {
  const { root, o } = scratch()
  try {
    sync(o)
    assert.ok(existsSync(join(o.ledgerOut, 'ingest.ts')) && existsSync(join(o.ledgerOut, 'lock.ts')))
    assert.ok(existsSync(join(o.bundleOut, 'index.html')) && existsSync(join(o.bundleOut, 'vendor/marked.min.js')) && existsSync(join(o.bundleOut, 'js/main.js')))
    assert.equal(existsSync(join(o.ledgerOut, 'tests')), false, 'tests are not shipped')
    writeFileSync(join(o.ledgerOut, 'lock.ts'), 'tampered')
    writeFileSync(join(o.ledgerOut, 'old.ts'), 'x')
    writeFileSync(join(o.bundleOut, 'js/gone.js'), 'x')
    assert.deepEqual(drift(o).sort(), ['changed ledger/lock.ts', 'stale dashboard-web/js/gone.js', 'stale ledger/old.ts'])
    sync(o)
    assert.deepEqual(drift(o), [])
  } finally { rmSync(root, { recursive: true }) }
})

test('a link in a parent directory of an output root is refused, from the trusted boundary down', () => {
  const { root, o } = scratch()
  try {
    const real = join(root, 'real'), outside = join(root, 'outside')
    mkdirSync(join(real, 'deeper'), { recursive: true })
    mkdirSync(outside)
    writeFileSync(join(outside, 'keep.txt'), 'mine')
    symlinkSync(real, join(root, 'linked'))
    // out = <boundary>/linked/deeper/out: the link is two levels above the root being written.
    assert.throws(() => sync({ ...o, out: join(root, 'linked', 'deeper', 'out') }), /symbolic link/)
    assert.deepEqual(readdirSync(join(real, 'deeper')), [], 'nothing was created through the link')
    // The same for a link above the source tree.
    symlinkSync(o.src, join(root, 'src-link'))
    assert.throws(() => sync({ ...o, src: join(root, 'src-link') }), /symbolic link/)
    assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'mine')
  } finally { rmSync(root, { recursive: true }) }
})

test('roots outside the boundary and parent components are refused', () => {
  const { root, o } = scratch()
  try {
    assert.throws(() => sync({ ...o, out: join(tmpdir(), 'elsewhere-out') }), /outside the trusted boundary/)
    assert.throws(() => sync({ ...o, out: join(root, 'a', '..', '..', 'escape') }), /outside the trusted boundary|parent components/)
    assert.throws(() => drift({ ...o, bundleOut: root + '/out/../../x' }), /outside the trusted boundary|parent components/)
  } finally { rmSync(root, { recursive: true }) }
})

test('a symlinked generated ledger directory is refused and its target kept', () => {
  const { root, o } = scratch()
  try {
    const outside = join(root, 'precious')
    mkdirSync(outside)
    writeFileSync(join(outside, 'stale.ts'), 'must survive')
    symlinkSync(outside, o.ledgerOut)
    assert.throws(() => sync(o), /symbolic link/)
    assert.equal(readFileSync(join(outside, 'stale.ts'), 'utf8'), 'must survive')
    assert.deepEqual(readdirSync(outside), ['stale.ts'])
  } finally { rmSync(root, { recursive: true }) }
})

test('plain() splits with the platform separator and refuses parent components', () => {
  const { root } = scratch()
  try {
    assert.throws(() => plain(root, ['a', '..', 'b'].join(sep), root), /parent components/)
    assert.throws(() => plain(root, '..' + sep + 'x', root), /parent components/)
    assert.equal(plain(root, ['a', 'b'].join(sep), root), join(root, 'a', 'b'), 'a missing tail is fine; it is returned whole')
    assert.equal(plain(root, '.' + sep + 'a' + sep + sep + 'b', root), join(root, 'a', 'b'))
  } finally { rmSync(root, { recursive: true }) }
})

test('missing source trees are an error, not an empty tree: nothing is written or pruned', () => {
  const { root, o } = scratch()
  try {
    sync(o)
    const before = readdirSync(o.ledgerOut).sort()
    assert.ok(before.length >= 4)
    rmSync(o.ledgerSrc, { recursive: true }) // the canonical ledger directory is gone
    assert.throws(() => sync(o), /sources are incomplete[\s\S]*ingest\.ts/)
    assert.throws(() => drift(o), /sources are incomplete/)
    assert.deepEqual(readdirSync(o.ledgerOut).sort(), before, 'the packaged ledger modules were not deleted')
    // The same when only the entry module of the web sources is missing.
    const { root: root2, o: o2 } = scratch()
    try {
      sync(o2)
      rmSync(join(o2.src, 'js/dash.js'))
      assert.throws(() => sync(o2), /sources are incomplete[\s\S]*dash\.js/)
      assert.ok(existsSync(join(o2.out, 'js/dash.js')), 'the generated entry module was not pruned')
    } finally { rmSync(root2, { recursive: true }) }
  } finally { rmSync(root, { recursive: true }) }
})

test('a custom root containing parent components is rejected before anything is read, and the validated path is what is walked', () => {
  const { root, o } = scratch()
  try {
    const viaParent = join(root, 'src', 'js', '..') // join() would hide the ..; build the raw string
    const raw = root + '/src/js/../'.replace(/\//g, sep)
    assert.throws(() => sync({ ...o, src: raw + '.' }), /parent components/)
    assert.throws(() => drift({ ...o, ledgerSrc: root + sep + 'ledger-src' + sep + '..' + sep + 'ledger-src' }), /parent components/)
    assert.throws(() => plain(root, '', root) && plain(root + sep + 'a' + sep + '..' + sep + 'b', '', root), /parent components/)
    void viaParent
  } finally { rmSync(root, { recursive: true }) }
})

test('straight copies are byte for byte: a binary asset in the bundle survives the sync and drift sees a change in it', () => {
  const { root, o } = scratch()
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0xc3, 0x28, 0x80, 0x0a])
    mkdirSync(join(o.src, 'img'))
    writeFileSync(join(o.src, 'img/logo.png'), bytes)
    sync(o)
    assert.equal(Buffer.compare(readFileSync(join(o.bundleOut, 'img/logo.png')), bytes), 0, 'not decoded as UTF-8')
    assert.deepEqual(drift(o), [])
    writeFileSync(join(o.bundleOut, 'img/logo.png'), Buffer.from([0x89, 0x50]))
    assert.deepEqual(drift(o), ['changed dashboard-web/img/logo.png'])
  } finally { rmSync(root, { recursive: true }) }
})
