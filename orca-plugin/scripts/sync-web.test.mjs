import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SRC, drift, sources, sync } from './sync-web.mjs'

const scratch = () => {
  const root = mkdtempSync(join(tmpdir(), 'sync-web-'))
  const src = join(root, 'src'), out = join(root, 'out')
  cpSync(SRC, src, { recursive: true })
  return { root, src, out }
}

test('the generated set follows dash.js imports, including new shared modules', () => {
  const { root, src, out } = scratch()
  try {
    const before = sources(src)
    assert.ok(before.includes('js/lib/charts.js') && before.includes('js/tabs/runs.js'))
    assert.ok(!before.includes('js/md.js'), 'not imported by dash.js, so not copied')
    writeFileSync(join(src, 'js/lib/extra.js'), 'export const x = 1\n')
    writeFileSync(join(src, 'js/tabs/skills.js'), readFileSync(join(src, 'js/tabs/skills.js'), 'utf8') + '\nimport { x } from "../lib/extra.js"; void x\n')
    assert.ok(sources(src).includes('js/lib/extra.js'))
    sync({ src, out })
    assert.ok(existsSync(join(out, 'js/lib/extra.js')))
    assert.deepEqual(drift({ src, out }), [])
  } finally { rmSync(root, { recursive: true }) }
})

test('sync repairs what check reports: a removed source tab leaves no stale copy behind', () => {
  const { root, src, out } = scratch()
  try {
    sync({ src, out })
    mkdirSync(join(out, 'js/old'), { recursive: true })
    writeFileSync(join(out, 'js/old/gone.js'), 'x')
    writeFileSync(join(out, 'js/tabs/removed.js'), 'x')
    writeFileSync(join(out, 'js/dash.js'), 'tampered')
    assert.deepEqual(drift({ src, out }).sort(), ['changed js/dash.js', 'stale js/old/gone.js', 'stale js/tabs/removed.js'])
    sync({ src, out })
    assert.deepEqual(drift({ src, out }), [])
    assert.ok(!existsSync(join(out, 'js/old')), 'empty directories go too')
  } finally { rmSync(root, { recursive: true }) }
})
