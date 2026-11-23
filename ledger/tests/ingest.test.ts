import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
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
  const root = mkdtempSync(join(tmpdir(),'ingest-'));
  const env: NodeJS.ProcessEnv = {};
  for (const kind of ['claude','codex','copilot','jcode','hermes','rtk','orca']) {
    env['AGENT_LEDGER_'+kind.toUpperCase()] = join(root,kind);
  }
  const orca = join(root,'orca');
  writeFileSync(orca,`#!/bin/sh
case "$2" in
run-list) result='{"runs":[{"id":"one"}]}' ;;
worker-list) result='{"workers":[{"dispatchId":"dispatch1"}]}' ;;
*) result='{"raw":true}' ;;
esac
echo "{\\"id\\":$$,\\"result\\":$result}"
`,{mode:0o700});
  const home = join(root,'ledger');
  let store = new Store(home);
  t.after(() => { store.db.close(); rmSync(root,{recursive:true}); });
  return {
    root, env, get store() { return store; }, get db() { return store.db; },
    async run() { assert.deepEqual(await cycle(store,env),[]); },
    restart() { store.db.close(); store = new Store(home); },
    history(kind: string) {
      return store.db.prepare(`SELECT generation,item,bytes FROM ingest_log
        JOIN sources ON sources.id=ingest_log.source JOIN archive.blobs USING(hash)
        WHERE kind=? ORDER BY ingest_log.id`).all(kind).map(r => ({
          gen:r.generation, item:r.item, text:Buffer.from(r.bytes as Uint8Array).toString(),
        }));
    },
  };
}

test('JSONL offsets survive restart, rotation, truncation and disappearance', async t => {
  const f = fixture(t);
  const dir = join(f.root,'claude','project');
  mkdirSync(dir,{recursive:true});
  const file = join(dir,'log.jsonl');
  writeFileSync(file,'invalid\n{"x"');
  await f.run();
  f.restart();
  await f.run();
  assert.equal(f.history('claude').length,1);
  appendFileSync(file,':1}\npartial');
  await f.run();
  renameSync(file,file+'.old');
  writeFileSync(file,'rotated\n');
  await f.run();
  writeFileSync(file,'x\n');
  await f.run();
  unlinkSync(file);
  await f.run();
  assert.ok(f.db.prepare("SELECT source_gone_at FROM sources WHERE kind='claude'").get()?.source_gone_at);
  assert.deepEqual(f.history('claude'),[
    {gen:1,item:'0',text:'invalid\n'}, {gen:1,item:'8',text:'{"x":1}\n'},
    {gen:2,item:'0',text:'rotated\n'}, {gen:3,item:'0',text:'x\n'},
  ]);
});

test('SQLite WAL updates, row additions and restart preserve distinct versions', async t => {
  const f = fixture(t);
  const source = new DatabaseSync(join(f.root,'hermes'));
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
  assert.deepEqual(rows.filter(r=>r.item.startsWith('sessions/')).map(r=>JSON.parse(r.text).total),[5,7,12]);
  assert.equal(rows.filter(r=>r.item==='messages/9').length,1);
  assert.deepEqual(JSON.parse(rows[1].text).content,{base64:'/w=='});
});

test('whole-file snapshots retain a return to earlier content', async t => {
  const f = fixture(t);
  mkdirSync(join(f.root,'jcode'));
  const path = join(f.root,'jcode','session.json');
  for (const value of ['{}','{"long":true}','{}']) {
    writeFileSync(path,value);
    await f.run();
  }
  assert.deepEqual(f.history('jcode').map(r=>r.text),['{}','{"long":true}','{}']);
});

test('changed databases revisit sessions, recent messages and new commands only', async t => {
  const f = fixture(t);
  const hermes = new DatabaseSync(join(f.root,'hermes'));
  const rtk = new DatabaseSync(join(f.root,'rtk'));
  t.after(() => { hermes.close(); rtk.close(); });
  hermes.exec(`CREATE TABLE sessions(id INTEGER PRIMARY KEY,total INTEGER);
    INSERT INTO sessions VALUES(1,10);
    CREATE TABLE messages(id INTEGER PRIMARY KEY,content TEXT);
    INSERT INTO messages VALUES(1,'old'),(300,'recent');`);
  rtk.exec("CREATE TABLE commands(id INTEGER PRIMARY KEY, cmd TEXT); INSERT INTO commands VALUES(1,'first')");
  await f.run();
  f.restart();
  hermes.exec("UPDATE sessions SET total=20; UPDATE messages SET content='edit'; INSERT INTO messages VALUES(301,'new')");
  rtk.exec("INSERT INTO commands VALUES(2,'second')");
  const spy = t.mock.method(f.store,'record');
  await f.run();
  const scanned = spy.mock.calls.map(c=>c.arguments[2]).filter(item=>item.includes('/'));
  assert.deepEqual(scanned,['sessions/1','messages/300','messages/301','commands/2']);
  assert.equal(f.history('hermes').filter(r=>r.item==='messages/300').length,2);
});

test('terminal details survive restart and refresh after list changes or reappearance', async t => {
  const f = fixture(t);
  const listing = join(f.root,'listing');
  const calls = join(f.root,'calls');
  const list = (ids: string[], revision=1) =>
    writeFileSync(listing,JSON.stringify({runs:ids.map(id=>({id,revision}))}));
  writeFileSync(join(f.root,'orca'),`#!/bin/sh
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
`,{mode:0o700});
  list(['one']);
  await f.run();
  f.restart();
  writeFileSync(calls,'');
  await f.run();
  assert.equal(readFileSync(calls,'utf8').trim(),'run-list 100');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sources WHERE source_gone_at IS NOT NULL').get()?.n,0);
  list(['one'],2);
  await f.run();
  assert.match(readFileSync(calls,'utf8'),/task-list one/);
  list([]);
  await f.run();
  assert.ok(f.db.prepare("SELECT source_gone_at FROM sources WHERE path LIKE '%task-list%'").get()?.source_gone_at);
  writeFileSync(calls,'');
  list(['one'],2);
  await f.run();
  assert.match(readFileSync(calls,'utf8'),/task-list one/);
});

test('live runs share worker inventory and fall back when the CLI scope is bound', async t => {
  const f = fixture(t);
  let now = Date.now();
  t.mock.method(Date,'now',() => now);
  const calls = join(f.root,'calls');
  writeFileSync(join(f.root,'orca'),`#!/bin/sh
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
`,{mode:0o700});
  await f.run();
  now += 60*60*1000;
  writeFileSync(calls,'');
  await f.run();
  const shared = readFileSync(calls,'utf8');
  assert.equal(shared.match(/task-list --run/g)?.length,4);
  assert.equal(shared.match(/worker-list --limit/g)?.length,1);
  assert.doesNotMatch(shared,/worker-list --run/);
  writeFileSync(join(f.root,'new'),'');
  now += 60*60*1000;
  writeFileSync(calls,'');
  await f.run();
  const changed = readFileSync(calls,'utf8');
  assert.equal(changed.match(/worker-list --run/g)?.length,1);
  assert.match(changed,/worker-show --dispatch/);
  now += 60*60*1000;
  writeFileSync(calls,'');
  await f.run();
  assert.doesNotMatch(readFileSync(calls,'utf8'),/worker-show/);
  writeFileSync(join(f.root,'bound'),'');
  now += 60*60*1000;
  writeFileSync(calls,'');
  await f.run();
  assert.equal(readFileSync(calls,'utf8').match(/worker-list --run/g)?.length,4);
});

test('quiet runs reopen on schedule and active dispatches poll each minute', async t => {
  const f = fixture(t);
  let now = Date.now();
  t.mock.method(Date,'now',() => now);
  writeFileSync(join(f.root,'orca'),`#!/bin/sh
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
`,{mode:0o700});
  const tasks = join(f.root,'tasks');
  const workers = join(f.root,'workers');
  writeFileSync(workers,'{"workers":[]}');
  writeFileSync(tasks,'{"tasks":[{"status":"completed"}]}');
  const minute = 60000;
  const due = () => Number(f.db.prepare('SELECT next_poll_at FROM orca_runs').get()?.next_poll_at);
  await f.run();
  const start = now;
  for (const minutes of [10,60,360,1800]) {
    assert.equal(due(),start+minutes*minute);
    now = due();
    await f.run();
  }
  f.restart();
  writeFileSync(tasks,'{"tasks":[{"status":"completed"},{"status":"ready","id":"new-task"}]}');
  now = due()-1;
  await f.run();
  assert.ok(!f.history('orca').some(r=>r.text.includes('new-task')));
  now++;
  await f.run();
  assert.ok(f.history('orca').some(r=>r.text.includes('new-task')));
  for (const minutes of [5,15,60]) {
    assert.equal(due()-now,minutes*minute);
    now = due();
    await f.run();
  }
  writeFileSync(workers,'{"workers":[{"dispatchId":"new","dispatchStatus":"dispatched"}]}');
  now = due();
  await f.run();
  assert.equal(due()-now,minute);
});

test('Orca retries failed details and keeps sources present through incomplete polls', async t => {
  const f = fixture(t);
  await f.run();
  f.db.exec('UPDATE orca_runs SET next_poll_at=0');
  const cli = join(f.root,'orca');
  const original = readFileSync(cli,'utf8');
  writeFileSync(cli,original.replace('case "$2"', '[ "$2" != inbox ] || exit 2\ncase "$2"'));
  assert.equal((await cycle(f.store,f.env)).length,1);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM orca_runs').get()?.n,0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sources WHERE source_gone_at IS NOT NULL').get()?.n,0);
  writeFileSync(cli,original);
  await f.run();
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM orca_runs').get()?.n,1);
});

test('moving Orca cursors preserve page identities', async t => {
  const f = fixture(t);
  const cli = join(f.root,'orca');
  const script = `#!/bin/sh
case "$*" in
*--cursor*) result='{"runs":[]}' ;;
*) result='{"runs":[],"nextCursor":"TOKEN"}' ;;
esac
echo "{\\"result\\":$result}"
`;
  writeFileSync(cli,script);
  await f.run();
  writeFileSync(cli,script.replace('TOKEN','DIFFERENT'));
  await f.run();
  const keys = f.db.prepare("SELECT path FROM sources WHERE kind='orca' ORDER BY path").all();
  assert.deepEqual(keys.map(r=>JSON.parse(String(r.path))),[['run-list','--page','0'],['run-list','--page','1']]);
});

test('JSONL spanning chunk boundaries resumes on reappearance and detects regrowth', async t => {
  const f = fixture(t);
  const dir = join(f.root,'codex');
  mkdirSync(dir);
  const path = join(dir,'session.jsonl');
  const content = 'a'.repeat(750000)+'\n'+'β'.repeat(400000)+'\n'+'c'.repeat(950000)+'\n';
  writeFileSync(path,content);
  await f.run();
  assert.deepEqual(Buffer.from(f.history('codex').map(r=>r.text).join('')),Buffer.from(content));
  renameSync(path,path+'.away');
  await f.run();
  renameSync(path+'.away',path);
  appendFileSync(path,'again\n');
  await f.run();
  assert.equal(f.history('codex').at(-1)?.gen,1);
  assert.equal(f.history('codex').at(-1)?.item,String(Buffer.byteLength(content)));
  assert.equal(f.db.prepare("SELECT source_gone_at FROM sources WHERE kind='codex'").get()?.source_gone_at,null);
  const replacement = 'new'.repeat(900000)+'\n';
  writeFileSync(path,replacement);
  await f.run();
  assert.deepEqual(f.history('codex').filter(r=>r.gen===2),[{gen:2,item:'0',text:replacement}]);
});

test('VACUUM preserves SQLite history, source files and rowid watermark', async t => {
  const f = fixture(t);
  const path = join(f.root,'rtk');
  const source = new DatabaseSync(path);
  source.exec("CREATE TABLE commands(id INTEGER PRIMARY KEY); INSERT INTO commands VALUES(1); CREATE TABLE spare(b BLOB); INSERT INTO spare VALUES(zeroblob(1000000)); DROP TABLE spare");
  const before = statSync(path,{bigint:true});
  const listing = readdirSync(f.root).sort();
  await f.run();
  assert.equal(statSync(path,{bigint:true}).mtimeNs,before.mtimeNs);
  assert.equal(statSync(path,{bigint:true}).size,before.size);
  assert.deepEqual(readdirSync(f.root).sort(),listing);
  source.exec('VACUUM; INSERT INTO commands VALUES(2)');
  source.close();
  assert.ok(statSync(path,{bigint:true}).size < before.size);
  await f.run();
  assert.deepEqual(f.history('rtk').map(r=>[r.gen,r.item]),[[1,'commands/1'],[1,'commands/2']]);
});

test('Hermes compaction rescans the affected session and preserves prompt and usage history', async t => {
  const f = fixture(t);
  const source = new DatabaseSync(join(f.root,'hermes'));
  t.after(()=>source.close());
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
  const spy = t.mock.method(f.store,'record');
  await f.run();
  assert.deepEqual(spy.mock.calls.map(c=>c.arguments[2]).filter(k=>k.includes('/')),
    ['messages/1','messages/500','system_prompts/2','session_model_usage/1']);
  assert.deepEqual(f.history('hermes').filter(r=>r.item==='messages/1').map(r=>JSON.parse(r.text).active),[1,0]);
  assert.deepEqual(f.history('hermes').filter(r=>r.item==='session_model_usage/1').map(r=>JSON.parse(r.text).total),[4,5]);
});

test('mid-file failure rolls back chunks and cursor while siblings commit', async t => {
  const f = fixture(t);
  const dir = join(f.root,'claude');
  mkdirSync(dir);
  const path = join(dir,'bad.jsonl');
  writeFileSync(path,'base\n');
  await f.run();
  appendFileSync(path,'a'.repeat(800000)+'\n'+'b'.repeat(800000)+'\n');
  writeFileSync(join(dir,'sibling.jsonl'),'sibling\n');
  // Abort after the file has already inserted a blob and its previous range.
  f.db.exec(`CREATE TRIGGER fail_log BEFORE INSERT ON ingest_log WHEN new.item='800006'
    BEGIN SELECT RAISE(ABORT,'forced error'); END`);
  assert.equal((await cycle(f.store,f.env)).length,1);
  assert.deepEqual(f.history('claude').map(r=>r.text),['base\n','sibling\n']);
  assert.equal(f.db.prepare('SELECT offset FROM cursors JOIN sources ON id=source WHERE path=?').get(path)?.offset,5);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM archive.blobs WHERE length(bytes)>100000').get()?.n,0);
  f.db.exec('DROP TRIGGER fail_log');
  await f.run();
  assert.equal(f.db.prepare('SELECT offset FROM cursors JOIN sources ON id=source WHERE path=?').get(path)?.offset,1600007);
});

test('unreadable subtree keeps prior sources present and siblings ingest', async t => {
  const f = fixture(t);
  const root = join(f.root,'claude');
  const dir = join(root,'private');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'hidden.jsonl'),'first\n');
  await f.run();
  chmodSync(dir,0);
  try {
    writeFileSync(join(root,'visible.jsonl'),'second\n');
    const errors = await cycle(f.store,f.env);
    assert.ok(errors.some(msg=>msg.includes(dir)));
    assert.deepEqual(f.history('claude').map(r=>r.text),['first\n','second\n']);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM sources WHERE source_gone_at IS NOT NULL').get()?.n,0);
  } finally { chmodSync(dir,0o700); }
});

test('--once completes while the daemon waits for an Orca response', async t => {
  const f = fixture(t);
  const cli = join(f.root,'orca');
  const gate = join(f.root,'waiting');
  writeFileSync(cli,readFileSync(cli,'utf8').replace('case "$2"',`if [ "$2" = task-list ] && [ "$STALL" = yes ]; then
    touch "$WAIT_PATH"
    while [ -f "$WAIT_PATH" ]; do sleep 0.05; done
  fi
  case "$2"`));
  const env = {...process.env,...f.env,AGENT_LEDGER_HOME:join(f.root,'ledger'),WAIT_PATH:gate};
  const script = new URL('../daemon.ts',import.meta.url).pathname;
  const child = spawn(process.execPath,[script],{env:{...env,STALL:'yes'},stdio:'ignore'});
  const stopped = once(child,'exit');
  try {
    for (let i=0;i<200 && !existsSync(gate);i++) await sleep(25);
    assert.ok(existsSync(gate));
    f.db.exec('PRAGMA busy_timeout=100; BEGIN IMMEDIATE; COMMIT');
    await promisify(execFile)(process.execPath,[script,'--once'],{env,timeout:5000});
    const before = f.history('orca');
    assert.ok(before.length);
    unlinkSync(gate);
    await sleep(200);
    assert.deepEqual(f.history('orca'),before);
  } finally {
    rmSync(gate,{force:true});
    child.kill();
    await stopped;
  }
});

test('explicit run status selects the settled schedule and unknown status stays open', async t => {
  const f = fixture(t);
  const cli = join(f.root,'orca');
  const script = readFileSync(cli,'utf8').replace('{"dispatchId":"dispatch1"}','{"dispatchId":"dispatch1","dispatchStatus":"completed"}');
  for (const [status,minutes] of [['closed',10],['succeeded',10],['done',10],['unrecognized',5]] as const) {
    writeFileSync(cli,script.replace('{"id":"one"}',JSON.stringify({id:'one',status})));
    await f.run();
    assert.equal(f.db.prepare('SELECT (next_poll_at-last_polled_at)/60000 AS delay FROM orca_runs').get()?.delay,minutes);
  }
});

test('round-one ledger migrates in place and checks the archived cursor tail', async t => {
  const f = fixture(t);
  const dir = join(f.root,'codex');
  mkdirSync(dir);
  const path = join(dir,'old.jsonl');
  writeFileSync(path,'original\n');
  await f.run();
  f.db.exec(`ALTER TABLE cursors DROP COLUMN checksum;
    ALTER TABLE orca_runs DROP COLUMN next_poll_at;
    ALTER TABLE orca_runs DROP COLUMN last_polled_at;
    ALTER TABLE orca_runs DROP COLUMN settled_since;
    DROP TABLE message_sessions;
    DROP TABLE orca_revision`);
  f.restart();
  writeFileSync(path,'replacement line\n');
  await f.run();
  assert.deepEqual(f.history('codex'),[
    {gen:1,item:'0',text:'original\n'},{gen:2,item:'0',text:'replacement line\n'},
  ]);
  assert.ok(f.db.prepare('SELECT last_polled_at FROM orca_runs').get()?.last_polled_at);
});
