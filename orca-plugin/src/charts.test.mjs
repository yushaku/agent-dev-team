import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.document = { querySelector: () => null, addEventListener() {} }
globalThis.window = { addEventListener() {} }
const { hBars } = await import('../dashboard-web/js/lib/charts.js')

test('dashboard agent series contain only the four supported agents', async () => {
  const { AG, AGENTS, COL, zeroAg, agentLegend } = await import('../dashboard-web/js/lib/charts.js')
  assert.deepEqual(AGENTS, ['claude', 'codex', 'copilot', 'hermes'])
  assert.deepEqual(Object.keys(AG), AGENTS)
  assert.deepEqual(Object.keys(zeroAg()), AGENTS)
  assert.equal(COL.jcode, undefined)
  assert.equal(
    agentLegend().some((x) => x.name === 'jcode'),
    false,
  )
})

const rows = [1000, 10, 0].map((v) => ({
  label: 'orchestrator / long worktree name',
  segs: [{ v, color: 'var(--blue)', name: 'Codegraph' }],
  right: [{ t: String(v) }, { t: 'codegraph 100%' }],
}))

test('narrow bars keep labels, marks and multiple values inside the chart', () => {
  const svg = hBars({ W: 288, rows })
  for (const rect of svg.matchAll(/<rect x="([\d.]+)"[^>]*width="([\d.]+)"/g)) {
    assert.ok(Number(rect[1]) >= 0)
    assert.ok(Number(rect[1]) + Number(rect[2]) <= 288)
  }
  assert.equal([...svg.matchAll(/<rect /g)].length, 2, 'zero has no stub')
  assert.equal([...svg.matchAll(/x="288"[^>]*text-anchor="end"/g)].length, 3)
  assert.match(svg, />orchestrator \/ long worktree name<\/text>/)
  assert.match(svg, /height="204"/)
})

test('desktop values share a fixed right edge regardless of bar length', () => {
  const svg = hBars({ W: 900, rows })
  assert.equal([...svg.matchAll(/x="900"[^>]*text-anchor="end"/g)].length, 3)
  assert.doesNotMatch(svg, /NaN|Infinity/)
  assert.doesNotMatch(hBars({ W: 900, rows: [] }), /NaN|Infinity/)
})

test('token patterns use distinct IDs per chart and matching legend marks', async () => {
  const { svg, swatch, COL } = await import('../dashboard-web/js/lib/charts.js')
  const plot = svg(100, 20, 'Token', `<rect width="100" height="20" style="fill:${COL.cr}"/>`)
  const key = swatch(COL.cr)
  const plotId = /<pattern id="([^"]+)"/.exec(plot)[1]
  const keyId = /<pattern id="([^"]+)"/.exec(key)[1]
  assert.notEqual(plotId, keyId)
  assert.ok(plot.includes(`url(#${plotId})`))
  assert.ok(key.includes(`url(#${keyId})`))
  assert.match(plot, /fill:var\(--p-cr\)/)
  assert.match(key, /aria-hidden="true"/)
  for (const type of ['cw', 'out']) {
    assert.match(svg(100, 20, type, `<rect style="fill:${COL[type]}"/>`), /<pattern/)
  }
  assert.doesNotMatch(swatch(COL.claude), /<pattern/)
})

test('work colours stay attached to Run IDs across agents, order and filters', async () => {
  const { state } = await import('../dashboard-web/js/lib/charts.js')
  const { renderRepos } = await import('../dashboard-web/js/tabs/repos.js')
  const chart = { clientWidth: 900, innerHTML: '' }
  document.querySelector = (selector) => (selector === '#c-tree' ? chart : null)
  state.data = {
    orca: {
      runs: [
        { id: 'run-a', repo: 'teams' },
        { id: 'run-b', repo: 'teams' },
      ],
    },
  }
  const sessions = ['run-a', 'run-b'].map((run_id, i) => ({ run_id, repo: 'teams', total: 100 + i, calls: 1, end: 1, agent: 'claude' }))
  const colours = () => new Map([...chart.innerHTML.matchAll(/<rect[^>]*style="fill:([^;]+);[^>]*data-f="(runF:[^"]+)"/g)].map((m) => [m[2], m[1]]))
  renderRepos(sessions)
  const before = colours()
  assert.equal(before.size, 2)
  assert.notEqual(before.get('runF:run-a'), before.get('runF:run-b'))
  renderRepos([...sessions].reverse().map((s) => ({ ...s, agent: 'codex', total: 50 })))
  assert.deepEqual(colours(), before)
  renderRepos(sessions.slice(0, 1))
  assert.equal(colours().get('runF:run-a'), before.get('runF:run-a'))
  assert.doesNotMatch(chart.innerHTML, /class="legend"|Toàn Claude|Toàn Codex/)
})
