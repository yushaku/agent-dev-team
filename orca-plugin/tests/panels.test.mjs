import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(root, 'orca-plugin.json'), 'utf8'))
const text = path => readFileSync(join(root, path), 'utf8')

test('the dashboard uses one HTML panel inside the plugin', () => {
  assert.equal(manifest.contributes.panels.length, 1)
  const [panel] = manifest.contributes.panels
  assert.equal(panel.id, 'tasks')
  assert.equal(panel.ui, 'html')
  assert.equal(panel.entry, 'dashboard-web/index.html')
  assert.ok(existsSync(join(root, panel.entry)))
})

test('the panel exposes Overview, Tasks and Agents tools', () => {
  const page = text('dashboard-web/index.html')
  const boot = text('dashboard-web/js/orca-panel.js')
  for (const id of ['tk-tong-quan', 'tk-theo-repo', 'tk-agents-tools']) {
    assert.ok(page.includes(`id="${id}"`))
    assert.ok(boot.includes(`'${id}'`))
  }
})

test('Agents tools keeps three charts with one selectable search view', () => {
  const page = text('dashboard-web/index.html')
  const view = page.slice(page.indexOf('id="tk-agents-tools"'), page.indexOf('id="tk-cli-tools"'))
  for (const id of ['c-skills', 'c-search-agent', 'c-rtk-cmd']) assert.ok(view.includes(`id="${id}"`))
  assert.equal((view.match(/class="chart"/g) || []).length, 3)
})
