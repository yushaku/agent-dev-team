import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  utimesSync,
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cycle } from '../daemon.ts';
import { Store } from '../store.ts';

function fixture(t: import('node:test').TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'ingest-'));
  const env: NodeJS.ProcessEnv = {};
  for (const kind of ['claude', 'codex', 'copilot', 'jcode', 'hermes', 'rtk', 'orca']) {
    env['AGENT_LEDGER_' + kind.toUpperCase()] = join(root, kind);
  }
  const orca = join(root, 'orca');
  writeFileSync(
    orca,
    `#!/bin/sh
case "$2" in
run-list) result='{"runs":[{"id":"one"}]}' ;;
worker-list) result='{"workers":[{"dispatchId":"dispatch1"}]}' ;;
*) result='{"raw":true}' ;;
esac
echo "{\\"id\\":$$,\\"result\\":$result}"
`,
    { mode: 0o700 },
  );
  const home = join(root, 'ledger');
  let store = new Store(home);
  t.after(() => {
    store.db.close();
    rmSync(root, { recursive: true });
  });
  return {
    root,
    env,
    get store() {
      return store;
    },
    get db() {
      return store.db;
    },
    async run() {
      assert.deepEqual(await cycle(store, env), []);
    },
    restart() {
      store.db.close();
      store = new Store(home);
    },
    history(kind: string) {
      return store.db
        .prepare(`SELECT generation,item,bytes FROM ingest_log
        JOIN sources ON sources.id=ingest_log.source JOIN archive.blobs USING(hash)
        WHERE kind=? ORDER BY ingest_log.id`)
        .all(kind)
        .map((r) => ({
          gen: r.generation,
          item: r.item,
          text: Buffer.from(r.bytes as Uint8Array).toString(),
        }));
    },
  };
}

test('JSONL offsets survive restart, rotation, truncation and disappearance', async (t) => {
  const f = fixture(t);
  const dir = join(f.root, 'claude', 'project');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'log.jsonl');
  writeFileSync(file, 'invalid\n{"x"');
  await f.run();
  f.restart();
  await f.run();
  assert.equal(f.history('claude').length, 1);
  appendFileSync(file, ':1}\npartial');
  await f.run();
  renameSync(file, file + '.old');
  writeFileSync(file, 'rotated\n');
  await f.run();
  writeFileSync(file, 'x\n');
  await f.run();
  unlinkSync(file);
  await f.run();
  assert.ok(f.db.prepare("SELECT source_gone_at FROM sources WHERE kind='claude'").get()?.source_gone_at);
  assert.deepEqual(f.history('claude'), [
    { gen: 1, item: '0', text: 'invalid\n' },
    { gen: 1, item: '8', text: '{"x":1}\n' },
    { gen: 2, item: '0', text: 'rotated\n' },
    { gen: 3, item: '0', text: 'x\n' },
  ]);
});

test('SQLite WAL updates, row additions and restart preserve distinct versions', async (t) => {
  const f = fixture(t);
  const source = new DatabaseSync(join(f.root, 'hermes'));
  t.after(() => source.close());
  source.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE sessions(id TEXT PRIMARY KEY, total INTEGER);
    CREATE TABLE messages(id INTEGER PRIMARY KEY, content BLOB);
    INSERT INTO sessions VALUES('a',5);
    INSERT INTO messages VALUES(9,x'ff');`);
  await f.run();
  source.exec("UPDATE sessions SET total=7; INSERT INTO sessions VALUES('b',12)");
  await f.run();
  f.restart();
  await f.run();
  const rows = f.history('hermes');
  assert.deepEqual(
    rows.filter((r) => r.item.startsWith('sessions/')).map((r) => JSON.parse(r.text).total),
    [5, 7, 12],
  );
  assert.equal(rows.filter((r) => r.item === 'messages/9').length, 1);
  assert.deepEqual(JSON.parse(rows[1].text).content, { base64: '/w==' });
});

test('whole-file snapshots retain a return to earlier content', async (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'jcode'));
  const path = join(f.root, 'jcode', 'session.json');
  for (const value of ['{}', '{"long":true}', '{}']) {
    writeFileSync(path, value);
    await f.run();
  }
  assert.deepEqual(
    f.history('jcode').map((r) => r.text),
    ['{}', '{"long":true}', '{}'],
  );
});

test('changed databases revisit sessions, recent messages and new commands only', async (t) => {
  const f = fixture(t);
  const hermes = new DatabaseSync(join(f.root, 'hermes'));
  const rtk = new DatabaseSync(join(f.root, 'rtk'));
  t.after(() => {
    hermes.close();
    rtk.close();
  });
  hermes.exec(`CREATE TABLE sessions(id INTEGER PRIMARY KEY,total INTEGER);
    INSERT INTO sessions VALUES(1,10);
    CREATE TABLE messages(id INTEGER PRIMARY KEY,content TEXT);
    INSERT INTO messages VALUES(1,'old'),(300,'recent');`);
  rtk.exec("CREATE TABLE commands(id INTEGER PRIMARY KEY, cmd TEXT); INSERT INTO commands VALUES(1,'first')");
  await f.run();
  f.restart();
  hermes.exec("UPDATE sessions SET total=20; UPDATE messages SET content='edit'; INSERT INTO messages VALUES(301,'new')");
  rtk.exec("INSERT INTO commands VALUES(2,'second')");
  const spy = t.mock.method(f.store, 'record');
  await f.run();
  const scanned = spy.mock.calls.map((c) => c.arguments[2]).filter((item) => item.includes('/'));
  assert.deepEqual(scanned, ['sessions/1', 'messages/300', 'messages/301', 'commands/2']);
  assert.equal(f.history('hermes').filter((r) => r.item === 'messages/300').length, 2);
});

test('terminal details survive restart and refresh after list changes or reappearance', async (t) => {
  const f = fixture(t);
  const listing = join(f.root, 'listing');
  const calls = join(f.root, 'calls');
  const list = (ids: string[], revision = 1) => writeFileSync(listing, JSON.stringify({ runs: ids.map((id) => ({ id, revision })) }));
  writeFileSync(
    join(f.root, 'orca'),
    `#!/bin/sh
dir=$(dirname "$0")
echo "$2 $4" >> "$dir/calls"
case "$2" in
run-list) result=$(cat "$dir/listing") ;;
task-list) result='{"tasks":[{"status":"completed"}]}' ;;
gate-list) result='{"gates":[]}' ;;
worker-list) result='{"workers":[]}' ;;
inbox) result='{"messages":[]}' ;;
esac
echo "{\\"result\\":$result}"
`,
    { mode: 0o700 },
  );
  list(['one']);
  await f.run();
  f.restart();
  writeFileSync(calls, '');
  await f.run();
  assert.equal(readFileSync(calls, 'utf8').trim(), 'run-list 100');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sources WHERE source_gone_at IS NOT NULL').get()?.n, 0);
  list(['one'], 2);
  await f.run();
  assert.match(readFileSync(calls, 'utf8'), /task-list one/);
  list([]);
  await f.run();
  assert.ok(f.db.prepare("SELECT source_gone_at FROM sources WHERE path LIKE '%task-list%'").get()?.source_gone_at);
  writeFileSync(calls, '');
  list(['one'], 2);
  await f.run();
  assert.match(readFileSync(calls, 'utf8'), /task-list one/);
});

test('live runs share worker inventory and fall back when the CLI scope is bound', async (t) => {
  const f = fixture(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const calls = join(f.root, 'calls');
  writeFileSync(
    join(f.root, 'orca'),
    `#!/bin/sh
dir=$(dirname "$0")
echo "$2 $3" >> "$dir/calls"
case "$2" in
run-list) result='{"runs":[{"id":"a"},{"id":"b"},{"id":"c"},{"id":"d"}]}' ;;
task-list) result='{"tasks":[{"status":"blocked"}]}' ;;
gate-list) result='{"gates":[]}' ;;
worker-list)
  if [ -f "$dir/bound" ]; then scope=bound; else scope=all; fi
  workers='[]'
  if [ -f "$dir/new" ] && { [ "$3" = --limit ] || [ "$4" = a ]; }; then
    workers='[{"runId":"a","dispatchId":"x","dispatchStatus":"completed"}]'
  fi
  result="{\\"workers\\":$workers,\\"scope\\":{\\"source\\":\\"$scope\\"}}" ;;
worker-show) result='{"dispatch":{"status":"completed"}}' ;;
inbox) result='{"messages":[]}' ;;
esac
echo "{\\"result\\":$result}"
`,
    { mode: 0o700 },
  );
  await f.run();
  now += 60 * 60 * 1000;
  writeFileSync(calls, '');
  await f.run();
  const shared = readFileSync(calls, 'utf8');
  assert.equal(shared.match(/task-list --run/g)?.length, 4);
  assert.equal(shared.match(/worker-list --limit/g)?.length, 1);
  assert.doesNotMatch(shared, /worker-list --run/);
  writeFileSync(join(f.root, 'new'), '');
  now += 60 * 60 * 1000;
  writeFileSync(calls, '');
  await f.run();
  const changed = readFileSync(calls, 'utf8');
  assert.equal(changed.match(/worker-list --run/g)?.length, 1);
  assert.match(changed, /worker-show --dispatch/);
  now += 60 * 60 * 1000;
  writeFileSync(calls, '');
  await f.run();
  assert.doesNotMatch(readFileSync(calls, 'utf8'), /worker-show/);
  writeFileSync(join(f.root, 'bound'), '');
  now += 60 * 60 * 1000;
  writeFileSync(calls, '');
  await f.run();
  assert.equal(readFileSync(calls, 'utf8').match(/worker-list --run/g)?.length, 4);
});

test('quiet runs reopen on schedule and active dispatches poll each minute', async (t) => {
  const f = fixture(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  writeFileSync(
    join(f.root, 'orca'),
    `#!/bin/sh
dir=$(dirname "$0")
case "$2" in
run-list) result='{"runs":[{"id":"one"}]}' ;;
task-list) result=$(cat "$dir/tasks") ;;
worker-list) result=$(cat "$dir/workers") ;;
gate-list) result='{"gates":[]}' ;;
inbox) result='{"messages":[]}' ;;
worker-show) result='{"dispatch":{}}' ;;
esac
echo "{\\"result\\":$result}"
`,
    { mode: 0o700 },
  );
  const tasks = join(f.root, 'tasks');
  const workers = join(f.root, 'workers');
  writeFileSync(workers, '{"workers":[]}');
  writeFileSync(tasks, '{"tasks":[{"status":"completed"}]}');
  const minute = 60000;
  const due = () => Number(f.db.prepare('SELECT next_poll_at FROM orca_runs').get()?.next_poll_at);
  await f.run();
  const start = now;
  for (const minutes of [10, 60, 360, 1800]) {
    assert.equal(due(), start + minutes * minute);
    now = due();
    await f.run();
  }
  f.restart();
  writeFileSync(tasks, '{"tasks":[{"status":"completed"},{"status":"ready","id":"new-task"}]}');
  now = due() - 1;
  await f.run();
  assert.ok(!f.history('orca').some((r) => r.text.includes('new-task')));
  now++;
  await f.run();
  assert.ok(f.history('orca').some((r) => r.text.includes('new-task')));
  for (const minutes of [5, 15, 60]) {
    assert.equal(due() - now, minutes * minute);
    now = due();
    await f.run();
  }
  writeFileSync(workers, '{"workers":[{"dispatchId":"new","dispatchStatus":"dispatched"}]}');
  now = due();
  await f.run();
  assert.equal(due() - now, minute);
});

test('Orca retries failed details and keeps sources present through incomplete polls', async (t) => {
  const f = fixture(t);
  await f.run();
  f.db.exec('UPDATE orca_runs SET next_poll_at=0');
  const cli = join(f.root, 'orca');
  const original = readFileSync(cli, 'utf8');
  writeFileSync(cli, original.replace('case "$2"', '[ "$2" != inbox ] || exit 2\ncase "$2"'));
  assert.equal((await cycle(f.store, f.env)).length, 1);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM orca_runs').get()?.n, 0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sources WHERE source_gone_at IS NOT NULL').get()?.n, 0);
  writeFileSync(cli, original);
  await f.run();
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM orca_runs').get()?.n, 1);
});

test('moving Orca cursors preserve page identities', async (t) => {
  const f = fixture(t);
  const cli = join(f.root, 'orca');
  const script = `#!/bin/sh
case "$*" in
*--cursor*) result='{"runs":[]}' ;;
*) result='{"runs":[],"nextCursor":"TOKEN"}' ;;
esac
echo "{\\"result\\":$result}"
`;
  writeFileSync(cli, script);
  await f.run();
  writeFileSync(cli, script.replace('TOKEN', 'DIFFERENT'));
  await f.run();
  const keys = f.db.prepare("SELECT path FROM sources WHERE kind='orca' ORDER BY path").all();
  assert.deepEqual(
    keys.map((r) => JSON.parse(String(r.path))),
    [
      ['run-list', '--page', '0'],
      ['run-list', '--page', '1'],
    ],
  );
});

test('JSONL spanning chunk boundaries resumes on reappearance and detects regrowth', async (t) => {
  const f = fixture(t);
  const dir = join(f.root, 'codex');
  mkdirSync(dir);
  const path = join(dir, 'session.jsonl');
  const content = 'a'.repeat(750000) + '\n' + 'β'.repeat(400000) + '\n' + 'c'.repeat(950000) + '\n';
  writeFileSync(path, content);
  await f.run();
  assert.deepEqual(
    Buffer.from(
      f
        .history('codex')
        .map((r) => r.text)
        .join(''),
    ),
    Buffer.from(content),
  );
  renameSync(path, path + '.away');
  await f.run();
  renameSync(path + '.away', path);
  appendFileSync(path, 'again\n');
  await f.run();
  assert.equal(f.history('codex').at(-1)?.gen, 1);
  assert.equal(f.history('codex').at(-1)?.item, String(Buffer.byteLength(content)));
  assert.equal(f.db.prepare("SELECT source_gone_at FROM sources WHERE kind='codex'").get()?.source_gone_at, null);
  const replacement = 'new'.repeat(900000) + '\n';
  writeFileSync(path, replacement);
  await f.run();
  assert.deepEqual(
    f.history('codex').filter((r) => r.gen === 2),
    [{ gen: 2, item: '0', text: replacement }],
  );
});

test('VACUUM preserves SQLite history, source files and rowid watermark', async (t) => {
  const f = fixture(t);
  const path = join(f.root, 'rtk');
  const source = new DatabaseSync(path);
  source.exec(
    'CREATE TABLE commands(id INTEGER PRIMARY KEY); INSERT INTO commands VALUES(1); CREATE TABLE spare(b BLOB); INSERT INTO spare VALUES(zeroblob(1000000)); DROP TABLE spare',
  );
  const before = statSync(path, { bigint: true });
  const listing = readdirSync(f.root).sort();
  await f.run();
  assert.equal(statSync(path, { bigint: true }).mtimeNs, before.mtimeNs);
  assert.equal(statSync(path, { bigint: true }).size, before.size);
  assert.deepEqual(readdirSync(f.root).sort(), listing);
  source.exec('VACUUM; INSERT INTO commands VALUES(2)');
  source.close();
  assert.ok(statSync(path, { bigint: true }).size < before.size);
  await f.run();
  assert.deepEqual(
    f.history('rtk').map((r) => [r.gen, r.item]),
    [
      [1, 'commands/1'],
      [1, 'commands/2'],
    ],
  );
});

test('Hermes compaction rescans the affected session and preserves prompt and usage history', async (t) => {
  const f = fixture(t);
  const source = new DatabaseSync(join(f.root, 'hermes'));
  t.after(() => source.close());
  source.exec(`CREATE TABLE sessions(id INTEGER PRIMARY KEY);
    CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,active INTEGER,compacted INTEGER);
    INSERT INTO messages VALUES(1,'a',1,0),(2,'b',1,0),(500,'c',1,0);
    CREATE TABLE system_prompts(hash TEXT PRIMARY KEY,prompt TEXT);
    INSERT INTO system_prompts VALUES('h','original');
    CREATE TABLE session_model_usage(session_id TEXT,total INTEGER);
    INSERT INTO session_model_usage VALUES('a',4);`);
  await f.run();
  f.restart();
  source.exec("UPDATE messages SET active=0,compacted=1 WHERE id=1; UPDATE session_model_usage SET total=5; INSERT INTO system_prompts VALUES('h2','another')");
  const spy = t.mock.method(f.store, 'record');
  await f.run();
  assert.deepEqual(
    spy.mock.calls.map((c) => c.arguments[2]).filter((k) => k.includes('/')),
    ['messages/1', 'messages/500', 'system_prompts/2', 'session_model_usage/1'],
  );
  assert.deepEqual(
    f
      .history('hermes')
      .filter((r) => r.item === 'messages/1')
      .map((r) => JSON.parse(r.text).active),
    [1, 0],
  );
  assert.deepEqual(
    f
      .history('hermes')
      .filter((r) => r.item === 'session_model_usage/1')
      .map((r) => JSON.parse(r.text).total),
    [4, 5],
  );
});

test('mid-file failure rolls back chunks and cursor while siblings commit', async (t) => {
  const f = fixture(t);
  const dir = join(f.root, 'claude');
  mkdirSync(dir);
  const path = join(dir, 'bad.jsonl');
  writeFileSync(path, 'base\n');
  await f.run();
  appendFileSync(path, 'a'.repeat(800000) + '\n' + 'b'.repeat(800000) + '\n');
  writeFileSync(join(dir, 'sibling.jsonl'), 'sibling\n');
  // Abort after the file has already inserted a blob and its previous range.
  f.db.exec(`CREATE TRIGGER fail_log BEFORE INSERT ON ingest_log WHEN new.item='800006'
    BEGIN SELECT RAISE(ABORT,'forced error'); END`);
  assert.equal((await cycle(f.store, f.env)).length, 1);
  assert.deepEqual(
    f.history('claude').map((r) => r.text),
    ['base\n', 'sibling\n'],
  );
  assert.equal(f.db.prepare('SELECT offset FROM cursors JOIN sources ON id=source WHERE path=?').get(path)?.offset, 5);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM archive.blobs WHERE length(bytes)>100000').get()?.n, 0);
  f.db.exec('DROP TRIGGER fail_log');
  await f.run();
  assert.equal(f.db.prepare('SELECT offset FROM cursors JOIN sources ON id=source WHERE path=?').get(path)?.offset, 1600007);
});

test('unreadable subtree keeps prior sources present and siblings ingest', async (t) => {
  const f = fixture(t);
  const root = join(f.root, 'claude');
  const dir = join(root, 'private');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'hidden.jsonl'), 'first\n');
  await f.run();
  chmodSync(dir, 0);
  try {
    writeFileSync(join(root, 'visible.jsonl'), 'second\n');
    const errors = await cycle(f.store, f.env);
    assert.ok(errors.some((msg) => msg.includes(dir)));
    assert.deepEqual(
      f.history('claude').map((r) => r.text),
      ['first\n', 'second\n'],
    );
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM sources WHERE source_gone_at IS NOT NULL').get()?.n, 0);
  } finally {
    chmodSync(dir, 0o700);
  }
});

test('--once is refused by the lock while the daemon waits for an Orca response', async (t) => {
  const f = fixture(t);
  const cli = join(f.root, 'orca');
  const gate = join(f.root, 'waiting');
  writeFileSync(
    cli,
    readFileSync(cli, 'utf8').replace(
      'case "$2"',
      `if [ "$2" = task-list ] && [ "$STALL" = yes ]; then
    touch "$WAIT_PATH"
    while [ -f "$WAIT_PATH" ]; do sleep 0.05; done
  fi
  case "$2"`,
    ),
  );
  const env = { ...process.env, ...f.env, AGENT_LEDGER_HOME: join(f.root, 'ledger'), WAIT_PATH: gate };
  const script = new URL('../daemon.ts', import.meta.url).pathname;
  const child = spawn(process.execPath, [script], { env: { ...env, STALL: 'yes' }, stdio: 'ignore' });
  const stopped = once(child, 'exit');
  try {
    for (let i = 0; i < 200 && !existsSync(gate); i++) await sleep(25);
    assert.ok(existsSync(gate));
    f.db.exec('PRAGMA busy_timeout=100; BEGIN IMMEDIATE; COMMIT');
    // The daemon holds ingest.lock, so a second host exits cleanly (75) without touching the ledger.
    await assert.rejects(
      promisify(execFile)(process.execPath, [script, '--once'], { env, timeout: 5000 }),
      (error: { code?: number; stderr?: string }) => error.code === 75 && /held by launchd pid \d+/.test(String(error.stderr)),
    );
    assert.deepEqual(f.history('orca'), []);
    unlinkSync(gate);
  } finally {
    rmSync(gate, { force: true });
    child.kill();
    await stopped;
  }
});

test('explicit run status selects the settled schedule and unknown status stays open', async (t) => {
  const f = fixture(t);
  const cli = join(f.root, 'orca');
  const script = readFileSync(cli, 'utf8').replace('{"dispatchId":"dispatch1"}', '{"dispatchId":"dispatch1","dispatchStatus":"completed"}');
  for (const [status, minutes] of [
    ['closed', 10],
    ['succeeded', 10],
    ['done', 10],
    ['unrecognized', 5],
  ] as const) {
    writeFileSync(cli, script.replace('{"id":"one"}', JSON.stringify({ id: 'one', status })));
    await f.run();
    assert.equal(f.db.prepare('SELECT (next_poll_at-last_polled_at)/60000 AS delay FROM orca_runs').get()?.delay, minutes);
  }
});

test('round-one ledger migrates in place and checks the archived cursor tail', async (t) => {
  const f = fixture(t);
  const dir = join(f.root, 'codex');
  mkdirSync(dir);
  const path = join(dir, 'old.jsonl');
  writeFileSync(path, 'original\n');
  await f.run();
  f.db.exec(`ALTER TABLE cursors DROP COLUMN checksum;
    ALTER TABLE orca_runs DROP COLUMN next_poll_at;
    ALTER TABLE orca_runs DROP COLUMN last_polled_at;
    ALTER TABLE orca_runs DROP COLUMN settled_since;
    DROP TABLE message_sessions;
    DROP TABLE orca_revision`);
  f.restart();
  writeFileSync(path, 'replacement line\n');
  await f.run();
  assert.deepEqual(f.history('codex'), [
    { gen: 1, item: '0', text: 'original\n' },
    { gen: 2, item: '0', text: 'replacement line\n' },
  ]);
  assert.ok(f.db.prepare('SELECT last_polled_at FROM orca_runs').get()?.last_polled_at);
});

const here = new URL('.', import.meta.url).pathname;
const nodeBin = process.execPath;
async function holder(home: string) {
  const child = spawn(nodeBin, [join(here, 'lock-child.ts'), home], { stdio: ['pipe', 'pipe', 'inherit'] });
  const [line] = await once(child.stdout, 'data');
  return { child, said: String(line).trim(), stopped: once(child, 'exit') };
}

test('start() ingests under a lock, trigger() coalesces to one pass, stop() releases', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'host');
  const passes: string[] = [];
  const { start, stop, trigger, status } = await import('../ingest.ts');
  start({
    home,
    env: { ...process.env, ...f.env, AGENT_LEDGER_HOME: home },
    intervalMs: 60_000,
    debounceMs: 50,
    minGapMs: 0,
    host: 'test',
    onPass: (p) => passes.push(p.reason),
  });
  try {
    for (let i = 0; i < 200 && passes.length < 1; i++) await sleep(25);
    assert.deepEqual(passes, ['start']);
    assert.equal(status()?.lock, 'held');
    assert.ok(existsSync(join(home, 'ingest.lock.db')));
    assert.ok(Object.keys(status()?.counts?.sources ?? {}).length);
    for (let i = 0; i < 5; i++) trigger('event');
    for (let i = 0; i < 200 && passes.length < 2; i++) await sleep(25);
    await sleep(300);
    assert.deepEqual(passes, ['start', 'event']);
  } finally {
    await stop();
  }
  const { acquire } = await import('../lock.ts');
  const again = acquire(home, 'after');
  assert.ok('held' in again);
  again.held.release();
});

test('lock: simultaneous acquisition by several processes has exactly one winner', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'race');
  mkdirSync(home);
  const racers = await Promise.all(Array.from({ length: 6 }, () => holder(home)));
  try {
    assert.equal(racers.filter((r) => r.said.startsWith('held')).length, 1);
    assert.equal(racers.filter((r) => r.said.startsWith('refused')).length, 5);
  } finally {
    for (const r of racers) r.child.kill('SIGKILL');
    await Promise.all(racers.map((r) => r.stopped));
  }
});

test('lock: a crashed holder (SIGKILL) frees it at once; a live holder keeps it past the old five-minute threshold', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'crash');
  mkdirSync(home);
  const { acquire } = await import('../lock.ts');
  const first = await holder(home);
  assert.match(first.said, /^held/);
  // Make every file look ten minutes idle: the old design would have evicted the live holder here.
  const old = new Date(Date.now() - 10 * 60_000);
  for (const name of ['ingest.lock.db', 'ingest.lock.info']) utimesSync(join(home, name), old, old);
  const refused = acquire(home, 'second');
  assert.ok('by' in refused);
  assert.match((refused as { by: string }).by, /child-\d+ pid \d+/);
  first.child.kill('SIGKILL');
  await first.stopped;
  const taken = acquire(home, 'second');
  assert.ok('held' in taken, 'the OS drops the lock with the dead process');
  // A second acquisition inside this same process (a reload) is refused too.
  assert.ok('by' in acquire(home, 'third'));
  (taken as { held: { release(): void } }).held.release();
  assert.ok('held' in acquire(home, 'fourth'));
});

test('--once exits 75 with the holder named, then runs once the holder is gone', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'once');
  mkdirSync(home);
  const first = await holder(home);
  const env = { ...process.env, ...f.env, AGENT_LEDGER_HOME: home };
  const script = join(here, '..', 'daemon.ts');
  await assert.rejects(
    promisify(execFile)(nodeBin, [script, '--once'], { env }),
    (e: { code?: number; stderr?: string }) => e.code === 75 && /held by child-\d+ pid \d+/.test(String(e.stderr)),
  );
  first.child.stdin.end();
  await first.stopped;
  const ok = await promisify(execFile)(nodeBin, [script, '--once'], { env });
  assert.match(ok.stdout, /wall_ms/);
});

test('private: an existing group-readable home and its files are tightened before use', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'shared');
  mkdirSync(home, { mode: 0o755 });
  chmodSync(home, 0o755);
  for (const name of ['ledger.sqlite', 'archive.sqlite']) {
    writeFileSync(join(home, name), '');
    chmodSync(join(home, name), 0o644);
  }
  const store = new Store(home);
  store.db.close();
  assert.equal(statSync(home).mode & 0o777, 0o700);
  for (const name of ['ledger.sqlite', 'archive.sqlite']) assert.equal(statSync(join(home, name)).mode & 0o777, 0o600);
  const { acquire } = await import('../lock.ts');
  const got = acquire(home, 'p');
  assert.ok('held' in got);
  assert.equal(statSync(join(home, 'ingest.lock.db')).mode & 0o077, 0);
  (got as { held: { release(): void } }).held.release();
});

test('scheduler: the periodic pass keeps its deadline under a stream of events, and event passes keep their spacing', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'sched');
  const passes: { reason: string; at: number }[] = [];
  const { start, stop, trigger } = await import('../ingest.ts');
  const t0 = Date.now();
  start({
    home,
    env: { ...process.env, ...f.env, AGENT_LEDGER_HOME: home },
    intervalMs: 700,
    debounceMs: 20,
    minGapMs: 150,
    host: 'test',
    onPass: (p) => passes.push({ reason: p.reason, at: Date.now() - t0 }),
  });
  try {
    const burst = setInterval(() => trigger('event'), 10); // a continuous stream below the debounce
    await sleep(2300);
    clearInterval(burst);
    await sleep(100);
  } finally {
    await stop();
  }
  assert.ok(passes.filter((p) => p.reason === 'interval').length >= 2, 'interval passes keep running: ' + JSON.stringify(passes));
  const events = passes.filter((p) => p.reason === 'event');
  assert.ok(events.length >= 3, 'a stream of events still gets event passes: ' + JSON.stringify(passes));
  assert.ok(events.length <= 2300 / 150 + 1, 'event passes are rate limited: ' + events.length);
});

test('stop() twice during a delayed Orca call drains once, releases the lock last, and a stopped runner cannot be restarted early', async (t) => {
  const f = fixture(t);
  const cli = join(f.root, 'orca');
  const gate = join(f.root, 'gate');
  writeFileSync(
    cli,
    readFileSync(cli, 'utf8').replace(
      'case "$2"',
      `if [ "$2" = task-list ]; then
    touch "$GATE"
    while [ -f "$GATE" ]; do sleep 0.05; done
  fi
  case "$2"`,
    ),
  );
  const home = join(f.root, 'drain');
  const { start, stop } = await import('../ingest.ts');
  const { acquire } = await import('../lock.ts');
  process.env.GATE = gate; // the Orca CLI child inherits the test process's environment
  t.after(() => {
    delete process.env.GATE;
  });
  start({ home, env: { ...process.env, ...f.env, AGENT_LEDGER_HOME: home }, host: 'test' });
  for (let i = 0; i < 200 && !existsSync(gate); i++) await sleep(25);
  assert.ok(existsSync(gate));
  let done = 0;
  const a = stop().then(() => done++),
    b = stop().then(() => done++);
  await sleep(150);
  assert.equal(done, 0, 'both callers wait for the drain');
  assert.ok('by' in acquire(home, 'x'), 'the lock is still held while the pass drains');
  assert.throws(() => start({ home, host: 'again' }), /still stopping/);
  unlinkSync(gate);
  await Promise.all([a, b]);
  assert.equal(done, 2);
  const got = acquire(home, 'x');
  assert.ok('held' in got);
  (got as { held: { release(): void } }).held.release();
});

test('http: bad URL is 400, inherited names are 404, a failing route is 500, POST is 405', async (t) => {
  const { serve } = await import('../http.ts');
  const hits: string[] = [];
  const srv = serve(
    {
      '/ok': () => ({ ok: true }),
      '/boom': () => {
        throw new Error('nope');
      },
    },
    { port: 0, onListening: () => hits.push('up') },
  );
  t.after(() => srv.close());
  for (let i = 0; i < 100 && !srv.server.listening; i++) await sleep(10);
  const { port } = srv.server.address() as { port: number };
  const get = (path: string, method = 'GET') =>
    new Promise<{ status: number; body: string }>((resolve) => {
      import('node:http').then(({ request }) => {
        const r = request({ port, host: '127.0.0.1', path, method }, (res) => {
          let b = '';
          res.on('data', (d) => (b += d));
          res.on('end', () => resolve({ status: res.statusCode!, body: b }));
        });
        r.end();
      });
    });
  assert.equal((await get('/ok')).status, 200);
  assert.equal((await get('/boom')).status, 500);
  assert.equal((await get('/constructor')).status, 404);
  assert.equal((await get('/__proto__')).status, 404);
  assert.equal((await get('/ok', 'POST')).status, 405);
  assert.equal((await get('/nothing')).status, 404);
  assert.ok([200, 400, 404].includes((await get('//[bad')).status)); // never hangs or crashes
});

test('plugin host: deactivating during activation starts nothing; a later activation serves /health and shuts down clean', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'plugin-host');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const saved = { ...process.env };
  Object.assign(process.env, f.env, { AGENT_LEDGER_HOME: home, TEAM_DASHBOARD_PORT: String(port) });
  t.after(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  const bars: string[] = [],
    listeners: Record<string, () => void> = {};
  const orca = {
    log() {},
    host: {
      call: async (_: string, p: { text: string }) => {
        bars.push(p.text);
      },
    },
    events: {
      on: (e: string, h: () => void) => {
        listeners[e] = h;
      },
    },
  };
  const probe = () =>
    fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }).then(
      (r) => r.json(),
      () => null,
    );
  // Deactivate while the modules are still loading.
  const first = run(orca);
  await shutdown();
  await first;
  assert.equal(await probe(), null, 'the cancelled activation never bound the port');
  assert.equal(existsSync(join(home, 'ingest.lock.db')), false, 'and never touched the ledger');
  // A later activation works, and a reload (shutdown + run) hands the lock over.
  await run(orca);
  let health: { ok: boolean; host: string; node: string; lock: string } | null = null;
  for (let i = 0; i < 200 && !health?.ok; i++) {
    await sleep(25);
    health = await probe();
  }
  assert.equal(health?.host, 'orca-plugin');
  assert.equal(health?.lock, 'held');
  assert.ok(
    bars.some((b) => /^Ledger \d\d:\d\d ✓/.test(b)),
    'status bar: ' + bars.join(' | '),
  );
  assert.ok(listeners['agent.status.changed'] && listeners['workspace.created'] && listeners['workspace.removed']);
  await shutdown();
  assert.equal(await probe(), null);
  await run(orca);
  for (let i = 0; i < 200 && !(await probe())?.ok; i++) await sleep(25);
  assert.equal((await probe())?.lock, 'held');
  await shutdown();
});

test('plugin host: a failed startup shows in the status bar', async (t) => {
  const f = fixture(t);
  const saved = { ...process.env };
  // An unwritable home makes the ledger refuse to start its pass; a missing ledger module would fail the same way.
  Object.assign(process.env, f.env, {
    AGENT_LEDGER_HOME: '/proc/definitely/not/writable',
    TEAM_DASHBOARD_PORT: String(20000 + Math.floor(Math.random() * 20000)),
  });
  t.after(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  const bars: string[] = [];
  const orca = {
    log() {},
    host: {
      call: async (_: string, p: { text: string }) => {
        bars.push(p.text);
      },
    },
    events: { on() {} },
  };
  await run(orca);
  try {
    for (let i = 0; i < 100 && !bars.some((b) => b.includes('✗')); i++) await sleep(25);
    assert.ok(
      bars.some((b) => b.includes('✗')),
      'status bar: ' + bars.join(' | '),
    );
  } finally {
    await shutdown();
  }
});

test('http: close() right after serve() leaves no listener behind', async () => {
  const { serve } = await import('../http.ts');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv = serve({ '/ok': () => 1 }, { port });
  await srv.close();
  await sleep(100);
  assert.equal(srv.server.listening, false);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/ok`, { signal: AbortSignal.timeout(500) }));
});

test('a leftover ingest.lock file from an older build is removed once the lock is held, and ingest runs', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'leftover');
  mkdirSync(home);
  writeFileSync(join(home, 'ingest.lock'), JSON.stringify({ pid: process.pid, host: 'launchd', token: 'old' }));
  const { start, stop, status } = await import('../ingest.ts');
  start({ home, env: { ...process.env, ...f.env, AGENT_LEDGER_HOME: home }, host: 'new' });
  try {
    for (let i = 0; i < 200 && !status()?.passes; i++) await sleep(25);
    assert.equal(status()?.lock, 'held');
    assert.ok((status()?.passes ?? 0) >= 1, 'a pass ran');
    assert.equal(existsSync(join(home, 'ingest.lock')), false);
  } finally {
    await stop();
  }
});

test('a failure after the lock is taken closes the connection: the very next acquire succeeds, in this process too', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'initfail');
  const { acquire } = await import('../lock.ts');
  assert.throws(
    () =>
      acquire(home, 'x', () => {
        throw Object.assign(new Error('disk says no'), { code: 'EIO' });
      }),
    /disk says no/,
  );
  const got = acquire(home, 'x'); // a leaked connection in this process would answer BUSY
  assert.ok('held' in got);
  (got as { held: { release(): void } }).held.release();
});

test('a store that fails to initialise leaves no open connection, and once() frees the lock', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'badstore');
  mkdirSync(home, { mode: 0o700 });
  writeFileSync(join(home, 'archive.sqlite'), 'this is not a database'.repeat(50));
  const { once: runOnce } = await import('../ingest.ts');
  const { acquire } = await import('../lock.ts');
  await assert.rejects(runOnce({ home, env: { ...process.env, ...f.env } }));
  const got = acquire(home, 'after');
  assert.ok('held' in got, 'the lock was released');
  (got as { held: { release(): void } }).held.release();
  assert.throws(() => new Store(home));
  rmSync(join(home, 'archive.sqlite'));
  const store = new Store(home); // the ledger database is not stuck behind a leaked handle
  store.db.close();
});

test('tightening tolerates files that are not there', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'vanish');
  mkdirSync(home, { mode: 0o700 });
  const { tightenFiles } = await import('../private.ts');
  tightenFiles(home);
  writeFileSync(join(home, 'ingest.lock.info'), 'x');
  chmodSync(join(home, 'ingest.lock.info'), 0o644);
  unlinkSync(join(home, 'ingest.lock.info'));
  tightenFiles(home);
});

test('scheduler: event passes keep their spacing at dispatch even when a slow pass or a queued rerun is in the way', async (t) => {
  const f = fixture(t);
  const cli = join(f.root, 'orca');
  writeFileSync(
    cli,
    readFileSync(cli, 'utf8').replace(
      'case "$2"',
      `if [ "$2" = task-list ]; then sleep 0.3; fi
  case "$2"`,
    ),
  );
  for (const interval of [60_000, 450]) {
    const home = join(f.root, 'spacing' + interval);
    const starts: { reason: string; at: number }[] = [];
    const { start, stop, trigger } = await import('../ingest.ts');
    start({
      home,
      env: { ...process.env, ...f.env, AGENT_LEDGER_HOME: home },
      intervalMs: interval,
      debounceMs: 10,
      minGapMs: 600,
      host: 'test',
      onPass: (p) => starts.push({ reason: p.reason, at: Date.parse(p.startedAt) }),
    });
    try {
      const burst = setInterval(() => trigger('event'), 20);
      await sleep(4500);
      clearInterval(burst);
      await sleep(900);
    } finally {
      await stop();
    }
    const ordered = starts.sort((a, b) => a.at - b.at);
    const events = ordered.filter((p) => p.reason === 'event');
    // With a 450 ms period the periodic passes already cover the events; the spacing must hold for any event pass that does run.
    if (interval > 1000) assert.ok(events.length >= 3, `interval ${interval}: ${JSON.stringify(ordered)}`);
    for (const e of events) {
      const previous = ordered[ordered.indexOf(e) - 1];
      assert.ok(previous, 'an event pass follows the first pass');
      assert.ok(e.at - previous.at >= 600 - 25, `interval ${interval}: event pass ${e.at - previous.at} ms after the previous pass started`);
    }
  }
});

test('plugin host: a second activation without a shutdown replaces the first cleanly (one listener, one ingest, old handlers inert)', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'twice');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const saved = { ...process.env };
  Object.assign(process.env, f.env, { AGENT_LEDGER_HOME: home, TEAM_DASHBOARD_PORT: String(port) });
  t.after(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  const { status } = await import('../ingest.ts');
  const make = () => {
    const handlers: Record<string, () => void> = {};
    return {
      handlers,
      orca: {
        log() {},
        host: { call: async () => {} },
        events: {
          on: (e: string, h: () => void) => {
            handlers[e] = h;
          },
        },
      },
    };
  };
  const one = make(),
    two = make();
  const probe = () =>
    fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }).then(
      (r) => r.json(),
      () => null,
    );
  await run(one.orca);
  for (let i = 0; i < 200 && !(await probe())?.ok; i++) await sleep(25);
  assert.equal((await probe())?.lock, 'held');
  const firstPid = (await probe())?.startedAt;
  await run(two.orca); // no shutdown in between
  for (let i = 0; i < 200 && !(await probe())?.ok; i++) await sleep(25);
  const second = await probe();
  assert.equal(second?.lock, 'held');
  assert.notEqual(second?.startedAt, firstPid, 'a new ingest runner replaced the first');
  const passes = status()!.passes;
  one.handlers['agent.status.changed']();
  await sleep(300);
  assert.equal(status()!.passes, passes, "the first activation's event handler does nothing now");
  await shutdown(); // closes only the live listener, and it is the only one
  await sleep(100);
  assert.equal(await probe(), null, 'no listener is left on the port');
});

/** An Orca stand-in whose first task-list call stalls until the gate file is removed (later calls do not). */
function stalled(f: ReturnType<typeof fixture>) {
  const cli = join(f.root, 'orca');
  writeFileSync(
    cli,
    readFileSync(cli, 'utf8').replace(
      'case "$2"',
      `if [ "$2" = task-list ] && [ ! -f "$GATE.done" ]; then
    touch "$GATE"
    while [ -f "$GATE" ]; do sleep 0.05; done
    touch "$GATE.done"
  fi
  case "$2"`,
    ),
  );
  return join(f.root, 'gate');
}
function hostFixture(t: import('node:test').TestContext, f: ReturnType<typeof fixture>, name: string) {
  const home = join(f.root, name);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const saved = { ...process.env };
  Object.assign(process.env, f.env, { AGENT_LEDGER_HOME: home, TEAM_DASHBOARD_PORT: String(port) });
  t.after(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  const bars: string[] = [];
  const make = () => ({
    log() {},
    host: {
      call: async (_: string, p: { text: string }) => {
        bars.push(p.text);
      },
    },
    events: { on() {} },
  });
  const probe = () =>
    fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }).then(
      (r) => r.json(),
      () => null,
    );
  return { home, port, bars, make, probe };
}

test('plugin host: shutdown and a new activation overlapping a delayed pass run in order, and the activation is not lost', async (t) => {
  const f = fixture(t);
  const gate = stalled(f);
  process.env.GATE = gate;
  t.after(() => {
    delete process.env.GATE;
  });
  const h = hostFixture(t, f, 'overlap');
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  await run(h.make());
  for (let i = 0; i < 200 && !existsSync(gate); i++) await sleep(25);
  assert.ok(existsSync(gate), 'a pass is in flight');
  let shutDown = false,
    reactivated = false;
  const sd = shutdown().then(() => {
    shutDown = true;
  });
  const re = run(h.make()).then(() => {
    reactivated = true;
  });
  await sleep(300);
  assert.equal(shutDown, false, 'shutdown waits for the pass to drain');
  assert.equal(reactivated, false, 'the new activation waits for the shutdown');
  unlinkSync(gate);
  await Promise.all([sd, re]);
  assert.ok(shutDown && reactivated);
  let health: { ok: boolean; lock: string } | null = null;
  for (let i = 0; i < 200 && !health?.ok; i++) {
    await sleep(25);
    health = await h.probe();
  }
  assert.equal(health?.lock, 'held', 'the second activation is running');
  assert.ok(!h.bars.some((b) => b.includes('not started')), h.bars.join(' | '));
  await shutdown();
  assert.equal(await h.probe(), null);
});

test('plugin host: two overlapping shutdowns both wait for the drain, in order', async (t) => {
  const f = fixture(t);
  const gate = stalled(f);
  process.env.GATE = gate;
  t.after(() => {
    delete process.env.GATE;
  });
  const h = hostFixture(t, f, 'twoshut');
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  await run(h.make());
  for (let i = 0; i < 200 && !existsSync(gate); i++) await sleep(25);
  assert.ok(existsSync(gate));
  const order: string[] = [];
  const a = shutdown().then(() => order.push('a')),
    b = shutdown().then(() => order.push('b'));
  await sleep(300);
  assert.deepEqual(order, [], 'neither resolves while the pass drains');
  unlinkSync(gate);
  await Promise.all([a, b]);
  assert.deepEqual(order, ['a', 'b']);
  assert.equal(await h.probe(), null, 'the listener is closed');
  const { acquire } = await import('../lock.ts');
  const got = acquire(h.home, 'after');
  assert.ok('held' in got, 'the lock is free');
  (got as { held: { release(): void } }).held.release();
});

test('http: a non-loopback Host is 403 on every route, /health and unknown paths included', async (t) => {
  const { serve } = await import('../http.ts');
  const { request } = await import('node:http');
  const srv = serve({ '/health': () => ({ ok: true }) }, { port: 0 });
  t.after(() => srv.close());
  for (let i = 0; i < 100 && !srv.server.listening; i++) await sleep(10);
  const { port } = srv.server.address() as { port: number };
  const status = (path: string, host: string) =>
    new Promise<number>((resolve) => {
      request({ port, host: '127.0.0.1', path, headers: { Host: host } }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      }).end();
    });
  assert.equal(await status('/health', 'example.com'), 403);
  assert.equal(await status('/health', 'evil.test:4748'), 403);
  assert.equal(await status('/nothing', 'example.com'), 403);
  assert.equal(await status('/health', `localhost:${port}`), 200);
  assert.equal(await status('/health', `127.0.0.1:${port}`), 200);
  assert.equal(await status('/health', '[::1]:4748'), 200);
  assert.equal(await status('/health', '127.0.0.1.evil.test'), 403);
});

test('lock: only a missing ingest.lock is ignored; any other failure to remove it fails the acquire and frees the connection', async (t) => {
  const f = fixture(t);
  const home = join(f.root, 'stuck');
  mkdirSync(join(home, 'ingest.lock'), { recursive: true });
  writeFileSync(join(home, 'ingest.lock', 'inside'), 'x'); // a non-empty directory cannot be unlinked
  const { acquire } = await import('../lock.ts');
  assert.throws(
    () => acquire(home, 'x'),
    (e: NodeJS.ErrnoException) => ['EISDIR', 'EPERM', 'ENOTEMPTY', 'EACCES'].includes(String(e.code)),
  );
  rmSync(join(home, 'ingest.lock'), { recursive: true });
  const got = acquire(home, 'x'); // the failed attempt left no open connection behind
  assert.ok('held' in got);
  (got as { held: { release(): void } }).held.release();
});

/** The environment a host test needs: its own ledger home and port, the repo as team root, restored afterwards. */
function hostEnv(t: import('node:test').TestContext, f: ReturnType<typeof fixture>, extra: Record<string, string> = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const saved = { ...process.env };
  const repo = join(here, 'fixtures/team');
  Object.assign(
    process.env,
    f.env,
    { AGENT_LEDGER_HOME: join(f.root, 'ledger-host'), TEAM_DASHBOARD_PORT: String(port), AGENT_TEAM_HOME: repo, TEAM_DASHBOARD_RETRY_MS: '200' },
    extra,
  );
  delete process.env.AGENT_DASHBOARD_WEB; // the host must point it at its own bundle
  t.after(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  const bars: string[] = [];
  const orca = {
    log() {},
    host: {
      call: async (_: string, p: { text: string }) => {
        bars.push(p.text);
      },
    },
    events: { on() {} },
  };
  const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(15000) });
  const up = () =>
    get('/health').then(
      (r) => r.ok,
      () => false,
    );
  const withHost = async (path: string, host: string) => {
    // fetch may not set Host; http.request can
    const { request } = await import('node:http');
    return new Promise<number>((resolve, reject) => {
      request({ port, host: '127.0.0.1', path, headers: { Host: host } }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      })
        .on('error', reject)
        .end();
    });
  };
  return { port, bars, orca, get, up, withHost, repo };
}

test('plugin host: one listener serves the dashboard, waits for a busy port, and shuts down in order', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f);
  // Another server holds the port first.
  const { createServer } = await import('node:http');
  const squatter = createServer((_, res) => res.end('other')).listen(h.port, '127.0.0.1');
  await once(squatter, 'listening');
  t.after(() => {
    squatter.close();
  });
  const { run, shutdown, dashboardData } = await import('../../src/ledger-host.ts');
  await run(h.orca);
  try {
    for (let i = 0; i < 100 && !h.bars.some((b) => b.includes(`${h.port} busy`)); i++) await sleep(25);
    assert.ok(
      h.bars.some((b) => b.includes(`${h.port} busy`)),
      h.bars.join(' | '),
    );
    assert.equal(await (await h.get('/')).text(), 'other', 'the port still belongs to the other server');
    squatter.close();
    await once(squatter, 'close');
    for (let i = 0; i < 300 && !(await h.up()); i++) await sleep(50);
    assert.equal((await h.get('/health')).status, 200, 'the port is taken over once it is free');
    const health = (await (await h.get('/health')).json()) as { listening: { bound: number[]; waiting: number[] } };
    assert.deepEqual(health.listening.bound, [h.port]);
    assert.deepEqual(health.listening.waiting, []);
    assert.ok(
      h.bars.some((b) => /✓ \d+$/.test(b) && b.endsWith(String(h.port))),
      h.bars.join(' | '),
    );
    // Every dashboard route answers on the one port: index.html equals the packaged bundle byte for byte.
    const index = await h.get('/');
    assert.equal(index.status, 200);
    assert.equal(Buffer.compare(Buffer.from(await index.arrayBuffer()), readFileSync(join(here, '../../dashboard-web/index.html'))), 0);
    for (const path of ['/js/dash.js', '/vendor/marked.min.js', '/css/app.css']) assert.equal((await h.get(path)).status, 200, path);
    let data = await h.get('/api/data?days=7');
    for (let i = 0; i < 100 && data.status === 503; i++) {
      await sleep(100);
      data = await h.get('/api/data?days=7');
    }
    assert.equal(data.status, 200);
    const body = (await data.json()) as { sessions: unknown[]; days: number };
    assert.equal(body.days, 7);
    assert.ok(Array.isArray(body.sessions));
    assert.equal((await h.get('/api/team/skill?name=team-builder')).status, 200);
    assert.equal(await h.withHost('/health', 'example.com'), 403, 'the Host check covers /health');
    assert.equal(await h.withHost('/api/data', 'example.com'), 403);
    assert.equal((await dashboardData(7)).days, 7, 'the Tasks panel reads the same data in process');
  } finally {
    await shutdown();
  }
  await assert.rejects(h.get('/health'), undefined, 'listener closed');
  await assert.rejects(dashboardData(7), /chưa sẵn sàng/);
  const { acquire } = await import('../lock.ts');
  const got = acquire(process.env.AGENT_LEDGER_HOME!, 'after');
  assert.ok('held' in got, 'ingest released the lock after the API stopped');
  (got as { held: { release(): void } }).held.release();
});

test('plugin host: an invalid port override fails before anything starts, and says so', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f, { TEAM_DASHBOARD_PORT: 'not-a-port' });
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  await run(h.orca);
  try {
    assert.ok(
      h.bars.some((b) => b.includes('✗ not started')),
      h.bars.join(' | '),
    );
    assert.equal(existsSync(join(process.env.AGENT_LEDGER_HOME!, 'ingest.lock.db')), false, 'no ledger resource was touched');
  } finally {
    await shutdown();
  }
  for (const bad of ['0', '70000', '80.5']) {
    process.env.TEAM_DASHBOARD_PORT = bad;
    const bars: string[] = [];
    await run({
      ...h.orca,
      host: {
        call: async (_: string, p: { text: string }) => {
          bars.push(p.text);
        },
      },
    });
    assert.ok(
      bars.some((b) => b.includes('✗ not started')),
      `${bad}: ${bars.join(' | ')}`,
    );
    await shutdown();
  }
});

test('plugin host: a listener that fails to start rolls everything back (no ingest, API worker or port left)', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f);
  const { run, shutdown, setModuleLoader } = await import('../../src/ledger-host.ts');
  // A http module whose serve() throws right away, as listen() does for an unusable address.
  setModuleLoader(async (file: string) => {
    const real = await import(new URL('../' + file, import.meta.url).href);
    return file === 'http.ts'
      ? {
          ...real,
          serve: () => {
            throw new RangeError('options.port should be >= 0 and < 65536');
          },
        }
      : real;
  });
  t.after(() => setModuleLoader());
  await run(h.orca);
  try {
    assert.ok(
      h.bars.some((b) => b.includes('✗ not started')),
      h.bars.join(' | '),
    );
    const { acquire } = await import('../lock.ts');
    const got = acquire(process.env.AGENT_LEDGER_HOME!, 'after'); // ingest was stopped by the rollback
    assert.ok('held' in got, 'the failed start released the ledger lock');
    (got as { held: { release(): void } }).held.release();
  } finally {
    await shutdown();
  }
});

test('plugin host: shutdown while the listener is still retrying a busy port leaves nothing to bind later', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f);
  const { createServer } = await import('node:http');
  const squatter = createServer((_, res) => res.end('other')).listen(h.port, '127.0.0.1');
  await once(squatter, 'listening');
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  await run(h.orca);
  for (let i = 0; i < 100 && !h.bars.some((b) => b.includes(`${h.port} busy`)); i++) await sleep(25);
  assert.ok(
    h.bars.some((b) => b.includes(`${h.port} busy`)),
    'the retry is pending',
  );
  await shutdown();
  squatter.close();
  await once(squatter, 'close');
  await sleep(700); // several retry intervals (200 ms): a leaked retry would bind the freed port now
  await assert.rejects(h.get('/health'), undefined, 'no retry timer is still alive');
});

test('plugin host: an API request in flight during shutdown does not hang the shutdown, and the port closes', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f);
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  await run(h.orca);
  for (let i = 0; i < 200 && !(await h.up()); i++) await sleep(25);
  assert.ok(await h.up());
  const inflight = h.get('/api/cli-tools').then(
    (r) => r.status,
    () => 'reset',
  ); // takes a moment: it scans PATH in a worker
  await sleep(20);
  const started = Date.now();
  await shutdown();
  assert.ok(Date.now() - started < 8000, 'shutdown completed promptly');
  const outcome = await Promise.race([inflight, sleep(5000).then(() => 'hung')]);
  assert.notEqual(outcome, 'hung', 'the in-flight request settled (a reset, or a 200/503 answer)');
  await assert.rejects(h.get('/health'), undefined, 'the port is closed');
});

test('plugin host: an API module that cannot be imported leaves ingest and /health running and says so', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f);
  const { run, shutdown, setModuleLoader } = await import('../../src/ledger-host.ts');
  setModuleLoader(async (file: string) => {
    if (file === 'api.ts') throw new SyntaxError('Unexpected token in api.ts');
    return import(new URL('../' + file, import.meta.url).href);
  });
  t.after(() => setModuleLoader());
  await run(h.orca);
  try {
    let health: { ok: boolean; listening: { apiError?: string } } | null = null;
    for (let i = 0; i < 200 && !health?.ok; i++) {
      await sleep(25);
      health = await h.get('/health').then(
        (r) => r.json(),
        () => null,
      );
    }
    assert.equal(health?.ok, true, 'ingest and /health run');
    assert.match(health?.listening.apiError ?? '', /Unexpected token in api\.ts/);
    assert.ok(
      h.bars.some((b) => b.endsWith('⚠')),
      h.bars.join(' | '),
    );
    assert.equal((await h.get('/api/data')).status, 404, 'no dashboard routes without the API');
  } finally {
    await shutdown();
  }
});

test('plugin host: an API that cannot start (bad team root) leaves ingest and /health running and says so', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f, { AGENT_TEAM_HOME: join(f.root, 'no-team-here') });
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  await run(h.orca);
  try {
    let health: { ok: boolean; listening: { apiError?: string } } | null = null;
    for (let i = 0; i < 200 && !health?.ok; i++) {
      await sleep(25);
      health = await h.get('/health').then(
        (r) => r.json(),
        () => null,
      );
    }
    assert.equal(health?.ok, true);
    assert.match(health?.listening.apiError ?? '', /AGENT_TEAM_HOME/);
    assert.ok(
      h.bars.some((b) => b.endsWith('⚠')),
      h.bars.join(' | '),
    );
  } finally {
    await shutdown();
  }
});

test('the API route map covers every file of the shipped dashboard bundle', async (t) => {
  const f = fixture(t);
  const { createApi } = await import('../api.ts');
  const bundle = join(here, '../../dashboard-web');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) e.isDirectory() ? walk(join(dir, e.name)) : files.push(join(dir, e.name).slice(bundle.length));
  };
  walk(bundle);
  assert.ok(files.length > 15, 'the bundle was found');
  process.env.AGENT_DASHBOARD_WEB = bundle;
  process.env.AGENT_TEAM_HOME = join(here, 'fixtures/team');
  t.after(() => {
    delete process.env.AGENT_DASHBOARD_WEB;
    delete process.env.AGENT_TEAM_HOME;
  });
  const api = createApi(join(f.root, 'api-routes'));
  t.after(() => api.close());
  const missing = files.filter((file) => !(file in api.routes) && !(file === '/index.html'));
  assert.deepEqual(missing, [], 'a file was shipped that the HTTP route map would answer 404 for: update the static list in ledger/api.ts');
});

test('plugin host: a deactivation during a slow optional API import starts nothing, whether the import succeeds or fails', async (t) => {
  for (const outcome of ['loads', 'fails']) {
    const f = fixture(t);
    const h = hostEnv(t, f);
    const { run, shutdown, setModuleLoader } = await import('../../src/ledger-host.ts');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setModuleLoader(async (file: string) => {
      if (file === 'api.ts') {
        await gate;
        if (outcome === 'fails') throw new SyntaxError('late failure');
      }
      return import(new URL('../' + file, import.meta.url).href);
    });
    try {
      const activation = run(h.orca);
      await sleep(100); // the required modules are in; api.ts is still loading
      const stopping = shutdown();
      release();
      await Promise.all([activation, stopping]);
      assert.equal(existsSync(join(process.env.AGENT_LEDGER_HOME!, 'ingest.lock.db')), false, `${outcome}: ingest never started`);
      await assert.rejects(h.get('/health'), undefined, `${outcome}: the port was never bound`);
      assert.deepEqual(h.bars, [], `${outcome}: nothing was announced`);
    } finally {
      setModuleLoader();
    }
  }
});

test('plugin host: an asynchronous bind failure tears the activation down through the lifecycle chain, and a later activation works', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f);
  const { run, shutdown, setModuleLoader, dashboardData } = await import('../../src/ledger-host.ts');
  // A listener whose bind fails some time after serve() returned, as listen() errors such as EACCES do.
  setModuleLoader(async (file: string) => {
    const real = await import(new URL('../' + file, import.meta.url).href);
    return file !== 'http.ts'
      ? real
      : {
          ...real,
          serve: (_: unknown, options: { onError: (e: Error & { code?: string }) => void }) => {
            setTimeout(() => options.onError(Object.assign(new Error('listen EACCES'), { code: 'EACCES' })), 150);
            return { close: async () => {} };
          },
        };
  });
  try {
    await run(h.orca);
    for (let i = 0; i < 100 && !h.bars.some((b) => b.includes('✗ not started')); i++) await sleep(25);
    assert.ok(
      h.bars.some((b) => b.includes('✗ not started')),
      h.bars.join(' | '),
    );
    const { acquire } = await import('../lock.ts');
    let got = acquire(process.env.AGENT_LEDGER_HOME!, 'after');
    for (let i = 0; i < 100 && 'by' in got; i++) {
      await sleep(25);
      got = acquire(process.env.AGENT_LEDGER_HOME!, 'after');
    }
    assert.ok('held' in got, 'ingest was stopped by the teardown');
    (got as { held: { release(): void } }).held.release();
    await assert.rejects(dashboardData(7), /chưa sẵn sàng/);
    assert.equal(h.bars.at(-1)?.includes('✗ not started'), true, 'the status bar keeps saying why (nothing overwrote it)');
    // The activation can start again afterwards (the lifecycle chain is not stuck).
    setModuleLoader();
    await run(h.orca);
    for (let i = 0; i < 200 && !(await h.up()); i++) await sleep(25);
    assert.ok(await h.up(), 'a fresh activation serves again');
  } finally {
    setModuleLoader();
    await shutdown();
  }
});

test('plugin host: a terminal listener error of an old activation does not tear down its replacement', async (t) => {
  const f = fixture(t);
  const h = hostEnv(t, f);
  const { run, shutdown, setModuleLoader } = await import('../../src/ledger-host.ts');
  let httpLoads = 0,
    apiLoads = 0,
    failOld: (() => void) | undefined,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  setModuleLoader(async (file: string) => {
    const real = await import(new URL('../' + file, import.meta.url).href);
    if (file === 'api.ts' && ++apiLoads === 2) await gate; // the replacement is importing while the old listener fails
    if (file === 'http.ts' && ++httpLoads === 1) {
      return {
        ...real,
        serve: (routes: unknown, options: { onError: (e: Error & { code?: string }) => void }) => {
          const handle = real.serve(routes, options);
          failOld = () => options.onError(Object.assign(new Error('listen EACCES'), { code: 'EACCES' }));
          return handle;
        },
      };
    }
    return real;
  });
  try {
    await run(h.orca); // the old activation
    for (let i = 0; i < 200 && !(await h.up()); i++) await sleep(25);
    assert.ok((await h.up()) && failOld, 'the old activation serves');
    const replacement = run(h.orca); // queued behind nothing, but still importing (gated)
    await sleep(100);
    failOld!(); // the old listener fails now, while the replacement is queued/importing
    release();
    await replacement;
    for (let i = 0; i < 200 && !(await h.up()); i++) await sleep(25);
    await sleep(400); // a wrongly queued cleanup of the old activation would run by now
    const health = (await h.get('/health').then(
      (r) => r.json(),
      () => null,
    )) as { ok: boolean; lock: string } | null;
    assert.equal(health?.lock, 'held', 'the replacement is running');
    assert.ok(health?.ok);
    assert.ok(!h.bars.some((b) => b.includes('✗ not started')), 'the old error did not announce a failure: ' + h.bars.join(' | '));
    assert.equal(
      (await h.get('/api/data?days=7')).status === 503 || (await h.get('/api/data?days=7')).status === 200,
      true,
      'the replacement API still answers',
    );
  } finally {
    setModuleLoader();
    await shutdown();
  }
});
