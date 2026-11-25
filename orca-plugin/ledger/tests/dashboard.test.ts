import './team-env.ts'; // first, and bare: a named import that nothing uses is dropped by some TypeScript transforms
import { golden } from './golden.ts';
import { type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { hostname, tmpdir, type as osType } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, get } from 'node:http';
import { once } from 'node:events';
import { Store } from '../store.ts';
import { files, ingestFile } from '../files.ts';
import { projections, PARSER_VERSION } from '../derived.ts';
import { parseFile, parseHermes } from '../session.ts';
import { build } from '../dashboard.ts';
import { GitMetrics } from '../git-metrics.ts';
import { summary, markdown, runDetail } from '../insights.ts';
import { createApi } from '../api.ts';
import { discover } from '../commands.ts';
import { skillDoc } from '../metadata.ts';

const web = resolve(import.meta.dirname, '../../dashboard-web'),
  fixtures = join(import.meta.dirname, 'fixtures/branch-switch');
function scratch(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'api-golden-'));
  const store = new Store(root);
  t.after(() => {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, store };
}
test('archived sessions and snapshots match Python across branch changes, appends, deletion and parser rebuild', (t) => {
  const { root, store } = scratch(t),
    refresh = projections(store),
    files: string[] = [];
  for (const agent of ['claude', 'codex']) {
    const path = join(root, agent + '.jsonl'),
      bytes = readFileSync(join(fixtures, agent + '_branch_switch.jsonl'));
    writeFileSync(path, bytes);
    files.push(path);
    ingestFile(store, agent, path);
    refresh();
    const expected = golden('session-' + agent, root);
    const row = store.db.prepare("select data from dashboard_sessions where json_extract(data,'$.agent')=?").get(agent);
    assert.ok(row);
    assert.deepEqual(JSON.parse(String(row.data)), expected);
  }
  const now = Date.parse('2026-11-13T23:59:59Z') / 1000;
  const expected = golden<unknown[]>('build-branch-switch', root);
  const actual = build(store, 7, now);
  // build_ms is wall-clock time, so it is dropped before comparing; the typed field itself is not optional.
  Reflect.deleteProperty(actual, 'build_ms');
  // `agents` (Orca's installed-agent labels) is new since the Python golden files and empty here.
  assert.deepEqual(actual.agents, []);
  Reflect.deleteProperty(actual, 'agents');
  assert.ok(actual.sources.length >= 6, 'the source list is new since the Python golden files');
  Reflect.deleteProperty(actual, 'sources');
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected[0]);
  const result = summary(actual, new URLSearchParams());
  assert.deepEqual(JSON.parse(JSON.stringify(result)), expected[1]);
  assert.equal(markdown(result), expected[2]);
  appendFileSync(files[1], '{"type":"token_usage_record","payload":{"usage":{"input_tokens":19}}}\n');
  ingestFile(store, 'codex', files[1]);
  unlinkSync(files[0]);
  unlinkSync(files[1]);
  refresh();
  const all = () => store.db.prepare('SELECT data FROM dashboard_sessions WHERE version=? ORDER BY source').all(PARSER_VERSION);
  const before = all();
  assert.equal(before.length, 2);
  assert.equal(JSON.parse(String(before[1].data)).calls.at(-1)[3], 19);
  store.db.exec('UPDATE dashboard_cursor SET version=0; UPDATE dashboard_sessions SET version=0');
  refresh();
  assert.deepEqual(all(), before);
});
test('Copilot sidecar, JCode and Hermes use the Python parser contract', (t) => {
  const { root } = scratch(t);
  for (const [agent, name, doc] of [
    [
      'jcode',
      'session.json',
      JSON.stringify({
        id: 'j',
        messages: [{ role: 'assistant', timestamp: '2026-11-13T10:00:00Z', token_usage: { input_tokens: 6 } }],
      }),
    ],
    [
      'copilot',
      'events.jsonl',
      JSON.stringify({
        type: 'session.usage_record',
        timestamp: '2026-11-13T00:00:01Z',
        data: { usage: { inputTokens: 12, cacheReadTokens: 4, initiator: 'user', cost: 1 } },
      }) + '\n',
    ],
  ]) {
    const path = join(root, name);
    writeFileSync(path, doc);
    writeFileSync(join(root, 'workspace.yaml'), 'id: test\nclient_name: golden\n');
    assert.deepEqual(parseFile(agent, path, doc, { id: 'test', client_name: 'golden' }), golden('parse-' + agent, root));
  }
  const expected = golden<[...Parameters<typeof parseHermes>, unknown]>('hermes-contract', root);
  assert.deepEqual(parseHermes(expected[0], expected[1]), expected[2]);
});
test('HTTP handler serves the web bundle and local endpoints', async (t) => {
  const { store, root } = scratch(t);
  const api = createApi(store),
    server = createServer(api);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await api.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  for (const path of ['/', '/js/main.js', '/vendor/marked.min.js'])
    assert.deepEqual(Buffer.from(await (await fetch(base + path)).arrayBuffer()), readFileSync(join(web, path === '/' ? 'index.html' : path)));
  assert.equal(
    await new Promise((done) =>
      get(base + '/api/data', { headers: { Host: 'example.com' } }, (r) => {
        r.resume();
        done(r.statusCode);
      }),
    ),
    403,
  );
  assert.equal((await fetch(base + '/api/team/skill?name=..')).status, 400);
  assert.equal((await fetch(base + '/api/agent/run?id=unknown')).status, 404);
  assert.equal((await (await fetch(base + '/api/data?days=200')).json()).days, 90);
  const p = join(root, 'bin');
  mkdirSync(p);
  writeFileSync(join(p, 'hello'), 'test', { mode: 0o755 });
  const cli = discover(p),
    old = golden<ReturnType<typeof discover>>('cli-discover', root);
  // Host metadata describes the machine that runs the test, not the one that recorded the golden file: the contract
  // is that it names this machine, so assert that and then compare the rest.
  assert.equal(cli.machine, hostname());
  assert.equal(cli.system, osType());
  assert.equal(typeof cli.generated_at, 'number');
  cli.generated_at = old.generated_at;
  cli.machine = old.machine;
  cli.system = old.system;
  assert.deepEqual(JSON.parse(JSON.stringify(cli)), old);
  const name = 'team-builder';
  const doc = skillDoc(name);
  assert.deepEqual(doc, golden('skill-doc-team-builder', root));
});
test('archived Orca requests and agent run match Python JSON and Markdown', (t) => {
  const { root, store } = scratch(t);
  const date = '2026-11-13T00:00:00Z',
    now = Date.parse(date) / 1000 + 600;
  const calls = {
    'run-list': { runs: [{ id: 'run_a', created_at: date, objective: 'sample' }] },
    'task-list': {
      tasks: [
        {
          id: 'task_a',
          task_title: 'builder: fix test',
          status: 'completed',
          created_at: date,
          spec: 'Measurement: {"kind":"fix","round":2,"cause":"defect"}',
        },
      ],
    },
    'worker-list': { workers: [{ dispatchId: 'd', taskId: 'task_a', agentTerminalHandle: 'term' }] },
    'worker-show': {
      dispatch: { taskId: 'task_a', dispatchedAt: date, status: 'completed' },
      worker: {
        worktreeId: 'root::/sample/repo',
        startOptions: { launch: { effective: { agent: 'codex', model: 'test' } } },
      },
    },
    'gate-list': {
      gates: [
        {
          id: 'g',
          task_id: 'task_a',
          question: 'Ready?',
          status: 'resolved',
          resolution: 'approve',
          created_at: date,
          resolved_at: date,
        },
      ],
    },
    inbox: {
      messages: [{ id: 'm', from_handle: 'dispatch:d', to_handle: 'run:run_a', created_at: date, body: 'sent' }],
    },
  };
  for (const [cmd, data] of Object.entries(calls)) {
    const args = cmd === 'run-list' ? ['--page', '0'] : cmd === 'worker-show' ? ['--dispatch', 'd'] : ['--run', 'run_a'];
    store.record(store.source('orca', JSON.stringify([cmd, ...args])), 1, 'result', Buffer.from(JSON.stringify(data)));
  }
  const fixture = join(root, 'orca.json');
  writeFileSync(fixture, JSON.stringify(calls));
  const expected = golden<unknown[]>('orca-runs-run-detail', root);
  projections(store)();
  const data = build(store, 7, now);
  assert.deepEqual(JSON.parse(JSON.stringify(data.orca.runs)), expected[0]);
  const r = runDetail(data, 'run_a');
  assert.deepEqual(JSON.parse(JSON.stringify(r)), expected[1]);
  assert.ok(r);
  assert.equal(markdown(r), expected[2]);
});

test('SQLite row corrections update only the affected session and RTK commands match Python', (t) => {
  const { store, root } = scratch(t),
    refresh = projections(store);
  const source = store.source('hermes', 'removed.db'),
    rtk = store.source('rtk', 'removed-rtk.db');
  const put = (id: number, item: string, row: unknown) => store.record(id, 1, item, Buffer.from(JSON.stringify(row)));
  for (const id of ['a', 'b']) put(source, 'sessions/' + id, { id, started_at: 100, input_tokens: 5 });
  put(source, 'messages/1', { session_id: 'a', role: 'user', content: 'before', timestamp: 101, active: 1 });
  const expected = golden<[unknown[], unknown]>('rtk-commands', root);
  expected[0].forEach((r, i) => put(rtk, 'commands/' + i, r));
  refresh();
  assert.deepEqual(JSON.parse(JSON.stringify(build(store, 14, 120).rtk)), expected[1]);
  store.db.exec(
    "CREATE TEMP TRIGGER untouched BEFORE INSERT ON dashboard_sessions WHEN NEW.sid='b' BEGIN SELECT RAISE(ABORT,'unrelated session replayed');END;",
  );
  put(source, 'messages/1', { session_id: 'a', role: 'user', content: 'after', timestamp: 101, active: 1 });
  refresh();
  const corrected = store.db.prepare("SELECT data FROM dashboard_sessions WHERE sid='a'").get();
  assert.ok(corrected);
  assert.equal(JSON.parse(String(corrected.data)).preview, 'after');
});

test('feature defect history matches Python across merge, fix, and a cached rebuild', async (t) => {
  const { root, store } = scratch(t),
    repo = join(root, 'repo');
  mkdirSync(repo);
  function git(...args: string[]) {
    // Fixed identity and dates make the commit ids reproducible, so the frozen Python answer stays valid.
    const when = '2026-11-01T00:00:00+0000';
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: when,
        GIT_COMMITTER_DATE: when,
        GIT_AUTHOR_NAME: 'A',
        GIT_AUTHOR_EMAIL: 'a@example.test',
        GIT_COMMITTER_NAME: 'A',
        GIT_COMMITTER_EMAIL: 'a@example.test',
      },
    }).trim();
  }
  git('init', '--object-format=sha1', '-b', 'main');
  git('config', 'user.name', 'A');
  git('config', 'user.email', 'a@example.test');
  const content = join(repo, 'file');
  writeFileSync(content, 'first\n');
  git('add', 'file');
  git('commit', '-m', 'initial');
  git('checkout', '-b', 'feat/test');
  appendFileSync(content, 'wrong\n');
  git('commit', '-am', 'feat: sample');
  git('checkout', 'main');
  git('merge', '--no-ff', 'feat/test', '-m', "Merge branch 'feat/test'");
  writeFileSync(content, 'first\ncorrect\n');
  git('commit', '-am', 'fix: sample');
  const path = join(root, 'session.jsonl'),
    timestamp = new Date().toISOString(),
    cwd = repo;
  writeFileSync(
    path,
    [
      { type: 'session_meta', timestamp, payload: { id: 's', cwd, git: { branch: 'feat/test' } } },
      { type: 'token_usage_record', timestamp, payload: { usage: { input_tokens: 9 } } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
  );
  ingestFile(store, 'codex', path);
  projections(store)();
  const expected = golden('repo-defects', root);
  const gitMetrics = new GitMetrics(store.db);
  try {
    gitMetrics.warm();
    await t.waitFor(() => assert.equal(gitMetrics.lookup(repo).metrics.loading, false), { timeout: 5000 });
  } finally {
    gitMetrics.close();
  }
  for (let i = 0; i < 2; i++) assert.deepEqual(JSON.parse(JSON.stringify(build(store, 7).features.repositories.repo)), expected);
  assert.equal(store.db.prepare('SELECT count(*) n FROM dashboard_git').get()?.n, 1);
});

test('Copilot rows carry the same fields as other agents and sidecar metadata survives deletion', (t) => {
  const { root, store } = scratch(t),
    dir = join(root, 'copilot');
  for (const session of ['empty', 'active', '.hidden']) mkdirSync(join(dir, session), { recursive: true });
  const event = {
    type: 'session.usage_record',
    timestamp: new Date().toISOString(),
    data: { usage: { inputTokens: 10 } },
  };
  writeFileSync(join(dir, 'active', 'events.jsonl'), JSON.stringify(event) + '\n');
  writeFileSync(join(dir, 'active', 'workspace.yaml'), 'id: archived\ncwd: /repo\nclient_name: test\n');
  for (const path of files(dir, 'copilot', (_, e) => {
    throw e;
  }))
    ingestFile(store, 'copilot', path);
  rmSync(dir, { recursive: true });
  projections(store)();
  const data = build(store, 7);
  assert.equal('copilot_dirs' in data, false, 'Copilot has no snapshot field of its own');
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessions[0].id, 'archived');
  assert.equal(data.sessions[0].originator, 'test');
  const row = data.sessions[0] as unknown as Record<string, unknown>;
  assert.equal('prem' in row || 'snapshot' in row, false, 'no premium-request fields on a row');
  assert.ok(
    Object.values(data.sessions[0].days).every((v) => v.length === 4),
    'day buckets are [fin, cr, cw, out]',
  );
  assert.equal(data.sessions[0].fin, 10, 'token fields are unchanged');
});

test('query worker follows appended history without HTTP requests', async (t) => {
  const { root, store } = scratch(t);
  const path = join(root, 'background.jsonl');
  const line = '{"type":"token_usage_record","payload":{"usage":{"input_tokens":17}}}\n';
  writeFileSync(path, line);
  ingestFile(store, 'codex', path);
  const api = createApi(store);
  async function waitForCalls(count: number) {
    const until = Date.now() + 10000;
    while (Date.now() < until) {
      if (store.db.prepare("SELECT 1 FROM sqlite_schema WHERE name='dashboard_sessions'").get()) {
        const row = store.db.prepare('SELECT data FROM dashboard_sessions WHERE version=?').get(PARSER_VERSION);
        if (row && JSON.parse(String(row.data)).calls.length === count) return;
      }
      await new Promise((done) => setTimeout(done, 25));
    }
    assert.fail('background ingest cursor did not advance');
  }
  try {
    await waitForCalls(1);
    appendFileSync(path, line);
    ingestFile(store, 'codex', path);
    await waitForCalls(2);
  } finally {
    await api.close();
  }
});
