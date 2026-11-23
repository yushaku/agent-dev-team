import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { golden as frozen } from './golden.ts';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { PARSER_VERSION, projectionStatus, projections } from '../derived.ts';
import { ingestFile } from '../files.ts';
import { Store } from '../store.ts';

function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), 'projection-'));
  const store = new Store(root);
  t.after(() => {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  });
  const sessions = () =>
    store.db
      .prepare('SELECT data FROM dashboard_sessions WHERE version=? ORDER BY sid')
      .all(PARSER_VERSION)
      .map((r) => JSON.parse(String(r.data)));
  return { root, store, sessions };
}
const meta = (id: string) => JSON.stringify({ type: 'session_meta', payload: { id } }) + '\n';
const usage = (n: number) =>
  JSON.stringify({
    type: 'token_usage_record',
    timestamp: `2026-11-01T01:00:${String(n).padStart(2, '0')}Z`,
    payload: { usage: { input_tokens: n } },
  }) + '\n';

test('Codex generations preserve prefix, partial-overlap and disjoint histories with exact occurrence counts', (t) => {
  const { root, store, sessions } = scratch(t);
  const path = join(root, 'rollout.jsonl'),
    refresh = projections(store);
  const base = meta('first') + usage(1) + usage(2) + usage(2);
  function ingest(text: string, replace = false) {
    if (replace) {
      writeFileSync(path + '.new', text);
      renameSync(path + '.new', path);
    } else writeFileSync(path, text);
    ingestFile(store, 'codex', path);
    refresh();
    assert.equal(projectionStatus(store).errors, 0);
  }
  let n = 0;
  function golden(text: string) {
    const oracle = join(root, 'oracle.jsonl');
    writeFileSync(oracle, text);
    // Python's parse_codex of this exact text, frozen in tests/golden before the Python dashboard was removed.
    const expected = frozen('codex-generation-' + ++n, root);
    assert.deepEqual(
      sessions().find((s) => s.id === 'first'),
      expected,
    );
  }
  ingest(base);
  ingest(base + usage(3), true); // Atomically replaced with the original prefix.
  golden(base + usage(3));
  ingest(meta('first')); // Truncated in place, then regrown with only partial overlap.
  golden(base + usage(3));
  appendFileSync(path, usage(2) + usage(3) + usage(4));
  ingestFile(store, 'codex', path);
  refresh();
  golden(base + usage(3) + usage(4));
  ingest(usage(5), true); // No session_meta after rotation.
  golden(base + usage(3) + usage(4) + usage(5));
  ingest(meta('second') + usage(6), true);
  assert.deepEqual(
    sessions().map((s) => s.id),
    ['first', 'second'],
  );
  golden(base + usage(3) + usage(4) + usage(5));
});

test('SQLite inode replacement retains disjoint sessions and commands and applies restored rows once', (t) => {
  const { root, store, sessions } = scratch(t),
    refresh = projections(store);
  const hermes = join(root, 'state.db'),
    rtk = join(root, 'history.db');
  function replace(path: string, sql: string) {
    const db = new DatabaseSync(path + '.new');
    try {
      db.exec(sql);
    } finally {
      db.close();
    }
    renameSync(path + '.new', path);
    ingestFile(store, path === hermes ? 'hermes' : 'rtk', path);
  }
  const hs =
    'CREATE TABLE sessions(id,started_at,input_tokens); CREATE TABLE messages(id,session_id,role,active,content,timestamp);';
  const rs =
    'CREATE TABLE commands(timestamp,rtk_cmd,project_path,input_tokens,output_tokens,saved_tokens,exec_time_ms);';
  const common =
    "INSERT INTO sessions VALUES('stable',10,11);INSERT INTO messages VALUES(1,'stable','user',1,'preview',10);";
  const command = "INSERT INTO commands VALUES('2026-11-01','git','/a',15,10,5,1);";
  replace(hermes, hs + common + "INSERT INTO sessions VALUES('old',11,13);");
  replace(rtk, rs + command + "INSERT INTO commands VALUES('2026-11-02','rg','/a',18,10,8,1);");
  refresh();
  replace(
    hermes,
    hs + common + "UPDATE sessions SET input_tokens=12; INSERT INTO sessions VALUES('fresh',12,14);",
  );
  replace(
    rtk,
    rs +
      command +
      "UPDATE commands SET saved_tokens=6; INSERT INTO commands VALUES('2026-11-03','ls','/a',19,10,9,2);",
  );
  refresh();
  assert.deepEqual(
    sessions().map((s) => [s.id, s.calls[0][3]]),
    [
      ['fresh', 14],
      ['old', 13],
      ['stable', 12],
    ],
  );
  assert.equal(sessions().find((s) => s.id === 'stable').preview, 'preview');
  assert.deepEqual(
    store.db
      .prepare('SELECT item,timestamp,saved_tokens FROM dashboard_commands ORDER BY timestamp')
      .all()
      .map((r) => Object.values(r)),
    [
      ['commands/1', '2026-11-01', 6],
      ['commands/2', '2026-11-02', 8],
      ['commands/2', '2026-11-03', 9],
    ],
  );
});

test('projection errors roll back one source, advance its cursor and clear on correction or a parser bump', (t) => {
  const { store, sessions } = scratch(t);
  const old = projections(store, PARSER_VERSION - 2),
    previous = projections(store, PARSER_VERSION - 1);
  const bad = store.source('rtk', 'bad.db'),
    good = store.source('codex', 'good.jsonl');
  const record = (item, data) => store.record(bad, 1, item, Buffer.from(data));
  record('commands/1', '{"timestamp":"2026-01-01","rtk_cmd":"rg"}');
  record('commands/2', 'broken');
  store.record(good, 1, '0', Buffer.from(meta('ok') + usage(1)));
  old();
  previous();
  const refresh = projections(store);
  assert.deepEqual(projectionStatus(store), { errors: 0, lag: 3 });
  assert.deepEqual(refresh.step(), { revision: 2, pending: true });
  assert.deepEqual(projectionStatus(store), { errors: 1, lag: 1 });
  assert.equal(
    store.db.prepare('SELECT count(*) AS n FROM dashboard_commands WHERE version=?').get(PARSER_VERSION).n,
    0,
  );
  assert.deepEqual(refresh.step(), { revision: 3, pending: false });
  assert.deepEqual(
    sessions().map((s) => s.id),
    ['ok'],
  );
  assert.deepEqual(projectionStatus(store), { errors: 1, lag: 0 });
  assert.deepEqual(
    store.db
      .prepare('SELECT version FROM dashboard_errors ORDER BY version')
      .all()
      .map((r) => r.version),
    [PARSER_VERSION - 1, PARSER_VERSION],
  );
  record('commands/2', '{"timestamp":"2026-01-02","rtk_cmd":"git"}');
  refresh();
  assert.equal(
    store.db.prepare('SELECT count(*) AS n FROM dashboard_commands WHERE version=?').get(PARSER_VERSION).n,
    2,
  );
  assert.deepEqual(projectionStatus(store), { errors: 0, lag: 0 });
  assert.equal(
    store.db.prepare('SELECT count(*) AS n FROM dashboard_errors WHERE version=?').get(PARSER_VERSION - 1).n,
    1,
  );

  // A corrected parser replays failed rows even when the archive receives no new data.
  store.db.exec(`CREATE TEMP TRIGGER old_parser BEFORE INSERT ON dashboard_sessions
    WHEN NEW.version=${PARSER_VERSION + 1} BEGIN SELECT RAISE(ABORT,'old parser failed'); END`);
  projections(store, PARSER_VERSION + 1)();
  assert.equal(
    store.db.prepare('SELECT count(*) AS n FROM dashboard_errors WHERE version=?').get(PARSER_VERSION + 1).n,
    1,
  );
  projections(store, PARSER_VERSION + 2)();
  assert.equal(
    store.db.prepare('SELECT count(*) AS n FROM dashboard_sessions WHERE version=?').get(PARSER_VERSION + 2)
      .n,
    1,
  );
  assert.equal(
    store.db.prepare('SELECT count(*) AS n FROM dashboard_errors WHERE version=?').get(PARSER_VERSION + 2).n,
    0,
  );
});

test('a malformed Codex record keeps its last good session while other files advance', (t) => {
  const { store, sessions } = scratch(t),
    refresh = projections(store);
  const a = store.source('codex', 'a.jsonl'),
    b = store.source('codex', 'b.jsonl');
  store.record(a, 1, '0', Buffer.from(meta('a') + usage(1)));
  refresh();
  const bad =
    JSON.stringify({
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: { unexpected: true } },
    }) + '\n';
  store.record(a, 1, '300', Buffer.from(bad));
  store.record(b, 1, '0', Buffer.from(meta('b') + usage(2)));
  refresh();
  assert.deepEqual(projectionStatus(store), { errors: 1, lag: 0 });
  assert.deepEqual(
    sessions().map((s) => [s.id, s.calls.length]),
    [
      ['a', 1],
      ['b', 1],
    ],
  );
  const error = store.db
    .prepare('SELECT source,generation,error,at FROM dashboard_errors WHERE version=?')
    .get(PARSER_VERSION);
  assert.equal(error.source, a);
  assert.equal(error.generation, 1);
  assert.match(String(error.error), /TypeError/);
  assert.ok(error.at);
  // A new generation also recovers the last good part of the quarantined generation.
  store.record(a, 2, '0', Buffer.from(meta('a') + usage(3)));
  refresh();
  assert.deepEqual(
    sessions()
      .find((s) => s.id === 'a')
      .calls.map((c) => c[3]),
    [1, 3],
  );
});

function worker(root: string, body: string, gate: SharedArrayBuffer) {
  const source = `
    import {parentPort,workerData} from 'node:worker_threads';
    import {Store} from ${JSON.stringify(new URL('../store.ts', import.meta.url))};
    import {projections} from ${JSON.stringify(new URL('../derived.ts', import.meta.url))};
    const store=new Store(workerData.root), gate=new Int32Array(workerData.gate);
    try { ${body} } finally {store.db.close();}
  `;
  return new Worker(new URL('data:text/javascript,' + encodeURIComponent(source)), {
    workerData: { root, gate },
  });
}
function release(gate: Int32Array) {
  Atomics.store(gate, 0, 1);
  Atomics.notify(gate, 0);
}

test('a reader sees committed rows while a writer waits to commit an archive transaction', async (t) => {
  const { root, store, sessions } = scratch(t),
    refresh = projections(store);
  const source = store.source('codex', 'concurrent.jsonl');
  store.record(source, 1, '0', Buffer.from(meta('concurrent') + usage(1)));
  refresh();
  const gate = new Int32Array(new SharedArrayBuffer(4));
  const writer = worker(
    root,
    `
    store.db.exec('BEGIN IMMEDIATE');
    store.record(${source},1,'500',Buffer.from(${JSON.stringify(usage(2))}));
    parentPort.postMessage('ready');
    Atomics.wait(gate,0,0,5000);
    store.db.exec('COMMIT');
  `,
    gate.buffer,
  );
  const exit = once(writer, 'exit');
  await once(writer, 'message');
  store.db.exec('BEGIN');
  try {
    assert.deepEqual(projectionStatus(store), { errors: 0, lag: 0 });
    release(gate);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(projectionStatus(store), { errors: 0, lag: 0 });
    assert.equal(sessions()[0].calls.length, 1);
  } finally {
    store.db.exec('COMMIT');
  }
  assert.deepEqual(await exit, [0]);
  assert.equal(projectionStatus(store).lag, 1);
  refresh();
  assert.deepEqual(
    sessions()[0].calls.map((call) => call[3]),
    [1, 2],
  );
});

test('two workers racing a projection cursor each commit a source once', async (t) => {
  const { root, store, sessions } = scratch(t);
  projections(store);
  const gate = new Int32Array(new SharedArrayBuffer(4));
  const workers = [1, 2].map(() =>
    worker(
      root,
      `
    const refresh=projections(store);
    parentPort.postMessage('ready');
    Atomics.wait(gate,0,0,5000);
    refresh();
  `,
      gate.buffer,
    ),
  );
  const exits = workers.map((w) => once(w, 'exit'));
  await Promise.all(workers.map((w) => once(w, 'message')));
  store.db.exec(
    `CREATE TABLE writes(sid TEXT); CREATE TRIGGER tally AFTER INSERT ON dashboard_sessions BEGIN INSERT INTO writes VALUES(NEW.sid); END`,
  );
  for (const sid of ['a', 'b', 'c']) {
    const source = store.source('codex', sid + '.jsonl');
    store.record(source, 1, '0', Buffer.from(meta(sid) + usage(1)));
  }
  release(gate);
  assert.deepEqual(await Promise.all(exits), [[0], [0]]);
  assert.deepEqual(
    sessions().map((s) => s.id),
    ['a', 'b', 'c'],
  );
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM writes').get().n, 3);
  assert.deepEqual(projectionStatus(store), { errors: 0, lag: 0 });
});
