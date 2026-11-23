import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
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
  assert.equal(f.history('orca').length,6);
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
  writeFileSync(calls,'');
  await f.run();
  const shared = readFileSync(calls,'utf8');
  assert.equal(shared.match(/task-list --run/g)?.length,4);
  assert.equal(shared.match(/worker-list --limit/g)?.length,1);
  assert.doesNotMatch(shared,/worker-list --run/);
  writeFileSync(join(f.root,'new'),'');
  writeFileSync(calls,'');
  await f.run();
  const changed = readFileSync(calls,'utf8');
  assert.equal(changed.match(/worker-list --run/g)?.length,1);
  assert.match(changed,/worker-show --dispatch/);
  writeFileSync(calls,'');
  await f.run();
  assert.doesNotMatch(readFileSync(calls,'utf8'),/worker-show/);
  writeFileSync(join(f.root,'bound'),'');
  writeFileSync(calls,'');
  await f.run();
  assert.equal(readFileSync(calls,'utf8').match(/worker-list --run/g)?.length,4);
});
