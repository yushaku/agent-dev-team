import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.document = { querySelector: () => null, addEventListener() {} }
globalThis.window = { addEventListener() {} }
const { hBars } = await import('../dashboard-web/js/lib/charts.js')

test('dashboard agent series come from the data, unknown agents included', async () => {
  const { AG, AGENTS, COL, zeroAg, agentLegend, setAgents, state } = await import('../dashboard-web/js/lib/charts.js')
  setAgents({
    sessions: [{ agent: 'codex' }, { agent: 'jcode' }, { agent: 'claude' }],
    orca: {
      runs: [
        {
          tokens: { sessions: 3, pi: 5 },
          window_tokens: { pi: 1 },
          orchestrator_by_agent: {},
          orchestrator_activity: [{ agent: 'opencode' }],
          fix_tokens_by_cause: {},
          tasks: [{ agent: 'claude', tokens: { jcode: 1 } }],
        },
      ],
    },
  })
  assert.deepEqual(AGENTS, ['claude', 'codex', 'jcode', 'opencode', 'pi'], 'legacy order first, reserved key skipped')
  assert.deepEqual(Object.keys(zeroAg()), AGENTS)
  assert.equal(AG.jcode, 'jcode')
  assert.equal(AG.claude, 'claude', 'no labels from Orca: the raw id')
  setAgents({
    sessions: [{ agent: 'claude' }, { agent: 'pi' }],
    agents: [
      { id: 'claude', name: 'Claude Code' },
      { id: 'pi', name: 'Pi' },
      { id: 'idle', name: 'Idle' },
    ],
  })
  assert.equal(AG.claude, 'Claude Code')
  assert.equal(AG.pi, 'Pi')
  assert.deepEqual(AGENTS, ['claude', 'pi'], 'an installed agent without usage is not an agent in the charts')
  setAgents({ sessions: [{ agent: 'claude' }, { agent: 'pi' }], agents: 'broken' })
  assert.equal(AG.pi, 'pi', 'labels follow the snapshot; none means raw ids')
  assert.equal(COL.claude, 'var(--claude)')
  assert.equal(COL.jcode, COL.jcode, 'stable')
  assert.match(COL.jcode, /^(hsl|light-dark)\(/)
  assert.notEqual(COL.jcode, COL.pi)
  assert.ok(agentLegend().some((x) => x.name === 'pi'))
  state.agent = 'gone'
  setAgents({ sessions: [{ agent: 'jcode' }] })
  assert.equal(state.agent, '', 'saved filter for an absent agent is dropped')
  state.agent = 'jcode'
  setAgents({ sessions: [{ agent: 'jcode' }] })
  assert.equal(state.agent, 'jcode', 'saved filter for a present new agent is kept')
  state.agent = ''
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

test('a non-legacy agent colour depends only on its id, whatever else is loaded', async () => {
  const { COL, agentColour, setAgents, state } = await import('../dashboard-web/js/lib/charts.js')
  const orcaIds =
    'claude-agent-teams codebuddy qoder qoder-cn qwen-code gemini antigravity opencode opencode2 pi mimo-code droid grok devin omp prime-agent cursor kimi muse zcode dsh jcode kiro'.split(
      ' ',
    )
  state.agent = ''
  for (const id of orcaIds) {
    setAgents({ sessions: [{ agent: id }] })
    const alone = COL[id]
    assert.equal(alone, agentColour(id))
    // every other id joins, in any order: nothing moves
    setAgents({ sessions: [...orcaIds].reverse().map((agent) => ({ agent })) })
    assert.equal(COL[id], alone, id + ' keeps its colour when the population changes')
    setAgents({ sessions: [{ agent: 'qoder' }, { agent: 'claude-agent-teams' }, { agent: id }] })
    assert.equal(COL[id], alone)
  }
  const colours = new Set(orcaIds.map((id) => agentColour(id)))
  assert.ok(colours.size >= 15, 'the hash spreads 23 Orca ids over many swatches (' + colours.size + ')')
})

/** Independent WCAG contrast, reading the chart backgrounds out of the stylesheets rather than from the code under test. */
function backgrounds() {
  const css = (f) => readFileSync(join(import.meta.dirname, '../dashboard-web/css', f), 'utf8')
  const token = (text, name) => new RegExp('--' + name + ':\\s*(#[0-9a-f]{6})').exec(text)[1]
  const dark = css('app.css'),
    light = css('orca-panel.css').slice(css('orca-panel.css').indexOf('html.light'))
  return { dark: [token(dark, 'mantle'), token(dark, 'base')], light: [token(light, 'mantle'), token(light, 'base')] }
}
const luminance = ([r, g, b]) => {
  const c = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const fromHex = (x) => [1, 3, 5].map((i) => Number.parseInt(x.slice(i, i + 2), 16) / 255)
const fromHsl = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))
}
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

test('every agent swatch keeps 3:1 contrast against the chart backgrounds in both themes, and clears the legacy hues', async () => {
  const { AGENT_SWATCHES, MIN_CONTRAST } = await import('../dashboard-web/js/lib/charts.js')
  const bg = backgrounds()
  assert.equal(MIN_CONTRAST, 3)
  assert.ok(AGENT_SWATCHES.length >= 40)
  assert.equal(new Set(AGENT_SWATCHES).size, AGENT_SWATCHES.length)
  for (const swatch of AGENT_SWATCHES) {
    const m = /^light-dark\(hsl\((\d+) 65% (\d+)%\), hsl\(\d+ 65% (\d+)%\)\)$/.exec(swatch)
    assert.ok(m, swatch)
    const hue = Number(m[1])
    for (const legacy of [20, 100, 220, 272]) assert.ok(Math.min(Math.abs(hue - legacy), 360 - Math.abs(hue - legacy)) > 18, swatch + ' clear of ' + legacy)
    for (const [theme, l] of [
      ['light', Number(m[2])],
      ['dark', Number(m[3])],
    ]) {
      for (const hex of bg[theme]) {
        const c = ratio(luminance(fromHsl(hue, 0.65, l / 100)), luminance(fromHex(hex)))
        assert.ok(c >= 3, `${swatch} on ${hex} (${theme}) is ${c.toFixed(2)}:1`)
      }
    }
  }
})

test('chart agents come from observed usage and activity, not from a task that merely names an agent', async () => {
  const { AGENTS, setAgents, agentLegend, state } = await import('../dashboard-web/js/lib/charts.js')
  state.agent = ''
  setAgents({
    sessions: [{ agent: 'claude' }],
    orca: {
      runs: [
        {
          tokens: { sessions: 1, claude: 5, pi: 0 },
          tasks: [
            { agent: 'pi', tokens: {} },
            { agent: 'codex', tokens: { codex: 0 } },
          ],
          orchestrator_by_agent: { opencode: 0 },
        },
      ],
    },
  })
  assert.deepEqual(AGENTS, ['claude'])
  assert.deepEqual(
    agentLegend().map((l) => l.f),
    ['agent:claude'],
  )
  setAgents({
    sessions: [{ agent: 'claude' }],
    orca: { runs: [{ tasks: [{ agent: 'pi', tokens: { pi: 3 } }], orchestrator_activity: [{ agent: 'opencode' }] }] },
  })
  assert.deepEqual(AGENTS, ['claude', 'opencode', 'pi'])
})

test('the web bundle has no agent-name check or premium-request field outside the legacy colour map', () => {
  const root = join(import.meta.dirname, '../dashboard-web/js')
  const files = [
    ...readdirSync(root),
    ...readdirSync(join(root, 'tabs')).map((f) => 'tabs/' + f),
    ...readdirSync(join(root, 'lib')).map((f) => 'lib/' + f),
  ].filter((f) => f.endsWith('.js'))
  const hits = []
  const allowed = /LEGACY_AGENTS =|^\s*(claude|codex|copilot|hermes): "var\(--|^\s*(\/\/|\/\*)/ // the legacy colour map, and comments
  for (const f of files) {
    readFileSync(join(root, f), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/\b(claude|codex|copilot|hermes|jcode)\b|\bprem\b|premium|accountingSnapshot/i.test(line) && !allowed.test(line)) hits.push(`${f}:${i + 1}`)
      })
  }
  assert.deepEqual(hits, [])
})

test('where light-dark() is unsupported an agent colour is the plain dark half; where supported it is the pair', async () => {
  const url = new URL('../dashboard-web/js/lib/charts.js', import.meta.url).href
  const keep = globalThis.CSS
  try {
    globalThis.CSS = { supports: (_, value) => value.startsWith('light-dark(') }
    const modern = await import(url + '?modern')
    globalThis.CSS = { supports: () => false }
    const legacy = await import(url + '?legacy')
    const pair = modern.agentColour('pi')
    const plain = legacy.agentColour('pi')
    assert.match(pair, /^light-dark\(hsl\(\d+ 65% \d+%\), hsl\(\d+ 65% \d+%\)\)$/)
    assert.match(plain, /^hsl\(\d+ 65% \d+%\)$/, 'a colour every browser parses')
    assert.equal(pair.endsWith(', ' + plain + ')'), true, 'the fallback is the dark half of the same swatch')
    assert.equal(legacy.COL.pi, plain)
    assert.equal(legacy.COL.claude, 'var(--claude)', 'legacy colours are untouched')
  } finally {
    globalThis.CSS = keep
  }
})
