// The manifest's panels, the pages they open, and the views those pages show.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(root, 'orca-plugin.json'), 'utf8'))
const panels = Object.fromEntries(manifest.contributes.panels.map((p) => [p.id, p]))
const text = (path) => readFileSync(join(root, path), 'utf8')

test('the plugin has a Tasks panel and an Agents tools panel, both HTML pages inside the plugin', () => {
  assert.deepEqual(Object.keys(panels).sort(), ['agents-tools', 'tasks'])
  for (const panel of Object.values(panels)) {
    assert.equal(panel.ui, 'html')
    assert.ok(existsSync(join(root, panel.entry)), panel.entry)
    assert.doesNotMatch(panel.entry, /[?#]/, 'a panel entry cannot carry a query or hash')
  }
  assert.equal(panels.tasks.entry, 'dashboard-web/index.html')
})

test('each panel opens the view it is named for, and the page has those views', () => {
  const page = text('dashboard-web/index.html'), boot = text('dashboard-web/js/orca-panel.js')
  const launcher = text(panels['agents-tools'].entry)
  assert.match(launcher, /window\.__orcaView = 'tk-agents-tools'/)
  assert.match(launcher, /fetch\('index\.html'\)/)
  assert.doesNotMatch(launcher, /location\.replace|location\.href|location\.assign/, 'navigating away would lose window.orca')
  assert.match(boot, /window\.__orcaView/)
  assert.ok(existsSync(join(root, 'dashboard-web/index.html')))
  for (const id of ['tk-theo-repo', 'tk-agents-tools']) {
    assert.match(page, new RegExp(`id="${id}"`), id + ' is a view of the page')
    assert.ok(boot.includes(`'${id}'`), id + ' is a view the panel boot knows')
  }
  // Without a view name (the Tasks panel) the first view, Tasks, is shown.
  assert.match(boot, /VIEWS\[0\]/)
  assert.match(boot, /const VIEWS = \['tk-theo-repo', 'tk-agents-tools'\]/)
})

test('the Agents tools view hosts the charts the panel is for', () => {
  const page = text('dashboard-web/index.html')
  const view = page.slice(page.indexOf('id="tk-agents-tools"'), page.indexOf('id="tk-cli-tools"'))
  for (const chart of ['c-skills', 'c-search-agent', 'c-search-role', 'c-search-wt', 'c-rtk-cmd']) assert.ok(view.includes(`id="${chart}"`), chart)
})
