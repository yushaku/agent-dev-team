import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, get } from 'node:http';
import { once } from 'node:events';
import { Store } from '../store.ts';
import { files, ingestFile } from '../files.ts';
import { projections, PARSER_VERSION } from '../derived.ts';
import { parseFile, parseHermes } from '../session.ts';
import { build } from '../dashboard.ts';
import { summary, markdown, runDetail } from '../insights.ts';
import { createApi } from '../api.ts';
import { discover } from '../commands.ts';
import { skillDoc } from '../metadata.ts';

const dashboard = resolve(import.meta.dirname, '../../dashboard'),
  fixtures = join(dashboard, 'tests/fixtures');
function python(source: string, args: string[] = [], env = {}) {
  return JSON.parse(
    execFileSync('python3', ['-c', source, ...args], {
      cwd: dashboard,
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', ...env },
    }),
  );
}
function scratch(t) {
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
    files = [];
  for (const agent of ['claude', 'codex']) {
    const path = join(root, agent + '.jsonl'),
      bytes = readFileSync(join(fixtures, agent + '_branch_switch.jsonl'));
    writeFileSync(path, bytes);
    files.push(path);
    ingestFile(store, agent, path);
    refresh();
    const expected = python(
      'import sys,json\nfrom backend.parsers.' +
        agent +
        ' import parse_' +
        agent +
        ' as parse\nprint(json.dumps(parse(sys.argv[1])))',
      [path],
    );
    const row = store.db
      .prepare("select data from dashboard_sessions where json_extract(data,'$.agent')=?")
      .get(agent);
    assert.deepEqual(JSON.parse(String(row.data)), expected);
  }
  const now = Date.parse('2026-11-13T23:59:59Z') / 1000;
  const expected = python(
    `import sys,json
from unittest.mock import patch
from backend import usage, insights
from backend.parsers.codex import parse_codex
from backend.parsers.claude import parse_claude
from backend import orca
orca.orca_state.update(available=False,loaded=False)
with patch('time.time',return_value=float(sys.argv[3])),patch.object(usage.cache,'load_files',return_value=[parse_claude(sys.argv[1]),parse_codex(sys.argv[2])]),patch.object(usage.hermes,'parse_hermes',return_value=[]),patch.object(usage,'parse_rtk',return_value={'available':False}),patch.object(usage.glob,'glob',wraps=usage.glob.glob):
 d=usage.build(7)
 s=insights.summary(d)
 print(json.dumps([d,s,insights.summary_md(s)]))`,
    [...files, String(now)],
  );
  const actual = build(store, 7, now);
  delete actual.build_ms;
  expected[0].copilot_dirs = 0;
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected[0]);
  const result = summary(actual, new URLSearchParams());
  assert.deepEqual(JSON.parse(JSON.stringify(result)), expected[1]);
  assert.equal(markdown(result), expected[2]);
  appendFileSync(files[1], '{"type":"token_usage_record","payload":{"usage":{"input_tokens":19}}}\n');
  ingestFile(store, 'codex', files[1]);
  unlinkSync(files[0]);
  unlinkSync(files[1]);
  refresh();
  const all = () =>
    store.db
      .prepare('SELECT data FROM dashboard_sessions WHERE version=? ORDER BY source')
      .all(PARSER_VERSION);
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
        messages: [
          { role: 'assistant', timestamp: '2026-11-13T10:00:00Z', token_usage: { input_tokens: 6 } },
        ],
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
    assert.deepEqual(
      parseFile(agent, path, doc, { id: 'test', client_name: 'golden' }),
      python(
        'import sys,json\nfrom backend.parsers.' +
          agent +
          ' import parse_' +
          agent +
          '\nprint(json.dumps(parse_' +
          agent +
          '(sys.argv[1])))',
        [path],
      ),
    );
  }
  const expected = python(
    `import json,sqlite3,sys
from backend.parsers import hermes
hermes.HERMES_DB=sys.argv[1]
db=sqlite3.connect(sys.argv[1])
db.executescript("CREATE TABLE sessions(id,title,started_at,ended_at,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,cwd,git_branch,model,source);INSERT INTO sessions VALUES('h','hello',100,102,5,7,2,1,3,'/repo','main','model','cli');CREATE TABLE messages(session_id,role,content,tool_name,tool_calls,timestamp,active);INSERT INTO messages VALUES('h','user','hello',null,null,101,1)")
db.row_factory=sqlite3.Row
print(json.dumps([dict(db.execute('select * from sessions').fetchone()),[dict(db.execute('select * from messages').fetchone())],hermes.parse_hermes(0)[0]]))`,
    [join(root, 'hermes.db')],
  );
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
    assert.deepEqual(
      Buffer.from(await (await fetch(base + path)).arrayBuffer()),
      readFileSync(join(dashboard, 'web', path === '/' ? 'index.html' : path)),
    );
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
    old = python(
      'import json,sys\nfrom backend.cli_tools import discover\nprint(json.dumps(discover(sys.argv[1])))',
      [p],
    );
  cli.generated_at = old.generated_at;
  assert.deepEqual(JSON.parse(JSON.stringify(cli)), old);
  const name = 'team-builder';
  const doc = skillDoc(name);
  assert.deepEqual(
    doc,
    python(
      'import sys,json\nfrom backend.team_docs import skill_doc\nprint(json.dumps(skill_doc(sys.argv[1])))',
      [name],
    ),
  );
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
      messages: [
        { id: 'm', from_handle: 'dispatch:d', to_handle: 'run:run_a', created_at: date, body: 'sent' },
      ],
    },
  };
  for (const [cmd, data] of Object.entries(calls)) {
    const args =
      cmd === 'run-list' ? ['--page', '0'] : cmd === 'worker-show' ? ['--dispatch', 'd'] : ['--run', 'run_a'];
    store.record(
      store.source('orca', JSON.stringify([cmd, ...args])),
      1,
      'result',
      Buffer.from(JSON.stringify(data)),
    );
  }
  const fixture = join(root, 'orca.json');
  writeFileSync(fixture, JSON.stringify(calls));
  const expected = python(
    `import sys,json
from unittest.mock import patch
from backend import orca,usage,insights
calls=json.load(open(sys.argv[1]))
with patch('time.time',return_value=float(sys.argv[2])),patch.object(orca,'orca',side_effect=lambda command,*args:calls[command]),patch.object(usage.cache,'load_files',return_value=[]),patch.object(usage.hermes,'parse_hermes',return_value=[]),patch.object(usage,'parse_rtk',return_value={'available':False}):
 orca.refresh_orca()
 d=usage.build(7)
 r=insights.run_detail(d,'run_a')
 print(json.dumps([d['orca']['runs'],r,insights.run_md(r)]))`,
    [fixture, String(now)],
  );
  projections(store)();
  const data = build(store, 7, now);
  assert.deepEqual(JSON.parse(JSON.stringify(data.orca.runs)), expected[0]);
  const r = runDetail(data, 'run_a');
  assert.deepEqual(JSON.parse(JSON.stringify(r)), expected[1]);
  assert.equal(markdown(r), expected[2]);
});

test('SQLite row corrections update only the affected session and RTK commands match Python', (t) => {
  const { store, root } = scratch(t),
    refresh = projections(store);
  const source = store.source('hermes', 'removed.db'),
    rtk = store.source('rtk', 'removed-rtk.db');
  const put = (id, item, row) => store.record(id, 1, item, Buffer.from(JSON.stringify(row)));
  for (const id of ['a', 'b']) put(source, 'sessions/' + id, { id, started_at: 100, input_tokens: 5 });
  put(source, 'messages/1', { session_id: 'a', role: 'user', content: 'before', timestamp: 101, active: 1 });
  const path = join(root, 'oracle.db');
  const expected = python(
    `import json,sys,sqlite3
from backend.parsers import common
db=sqlite3.connect(sys.argv[1])
db.execute('create table commands(timestamp,rtk_cmd,project_path,input_tokens,output_tokens,saved_tokens,exec_time_ms)')
rows=[('1970-01-01','rg','/repo',40,20,20,3),('1970-01-01','rg','/repo',60,10,50,8),('1970-01-01','git','',100,5,95,10)]
db.executemany('insert into commands values (?,?,?,?,?,?,?)',rows);db.commit()
common.RTK_DB=sys.argv[1]
db.row_factory=sqlite3.Row
print(json.dumps([[dict(r) for r in db.execute('select * from commands')],common.parse_rtk('1969-12-20')]))`,
    [path],
  );
  expected[0].forEach((r, i) => put(rtk, 'commands/' + i, r));
  refresh();
  assert.deepEqual(JSON.parse(JSON.stringify(build(store, 14, 120).rtk)), expected[1]);
  store.db.exec(
    "CREATE TEMP TRIGGER untouched BEFORE INSERT ON dashboard_sessions WHEN NEW.sid='b' BEGIN SELECT RAISE(ABORT,'unrelated session replayed');END;",
  );
  put(source, 'messages/1', { session_id: 'a', role: 'user', content: 'after', timestamp: 101, active: 1 });
  refresh();
  assert.equal(
    JSON.parse(String(store.db.prepare("SELECT data FROM dashboard_sessions WHERE sid='a'").get().data))
      .preview,
    'after',
  );
});

test('feature defect history matches Python across merge, fix, and a cached rebuild', (t) => {
  const { root, store } = scratch(t),
    repo = join(root, 'repo');
  mkdirSync(repo);
  function git(...args: string[]) {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }
  git('init', '-b', 'main');
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
  const expected = python(
    'import json,sys\nfrom backend.escaped import default_head,repo_defects\np=sys.argv[1]\nprint(json.dumps(repo_defects(p,default_head(p))))',
    [repo],
  );
  for (let i = 0; i < 2; i++)
    assert.deepEqual(JSON.parse(JSON.stringify(build(store, 7).features.repositories.repo)), expected);
  assert.equal(store.db.prepare('SELECT count(*) n FROM dashboard_git').get().n, 1);
});

test('Copilot counts visible directories and restores sidecar metadata after deletion', (t) => {
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
  assert.equal(data.copilot_dirs, 2);
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessions[0].id, 'archived');
  assert.equal(data.sessions[0].originator, 'test');
});
