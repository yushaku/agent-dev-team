import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
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
    root, env, get db() { return store.db; },
    run() { assert.deepEqual(cycle(store,env),[]); },
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

test('JSONL offsets survive restart, rotation, truncation and disappearance', t => {
  const f = fixture(t);
  const dir = join(f.root,'claude','project');
  mkdirSync(dir,{recursive:true});
  const file = join(dir,'log.jsonl');
  writeFileSync(file,'invalid\n{"x"');
  f.run();
  f.restart();
  f.run();
  assert.equal(f.history('claude').length,1);
  appendFileSync(file,':1}\npartial');
  f.run();
  renameSync(file,file+'.old');
  writeFileSync(file,'rotated\n');
  f.run();
  writeFileSync(file,'x\n');
  f.run();
  unlinkSync(file);
  f.run();
  assert.ok(f.db.prepare("SELECT source_gone_at FROM sources WHERE kind='claude'").get()?.source_gone_at);
  assert.deepEqual(f.history('claude'),[
    {gen:1,item:'0',text:'invalid\n'}, {gen:1,item:'8',text:'{"x":1}\n'},
    {gen:2,item:'0',text:'rotated\n'}, {gen:3,item:'0',text:'x\n'},
  ]);
  assert.equal(f.history('orca').length,6);
});

test('SQLite WAL updates, row additions and restart preserve distinct versions', t => {
  const f = fixture(t);
  const source = new DatabaseSync(join(f.root,'hermes'));
  t.after(() => source.close());
  source.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE sessions(id TEXT PRIMARY KEY, total INTEGER);
    CREATE TABLE messages(id INTEGER PRIMARY KEY, content BLOB);
    INSERT INTO sessions VALUES('a',5);
    INSERT INTO messages VALUES(9,x'ff');`);
  f.run();
  source.exec("UPDATE sessions SET total=7; INSERT INTO sessions VALUES('b',12)");
  f.run();
  f.restart();
  f.run();
  const rows = f.history('hermes');
  assert.deepEqual(rows.filter(r=>r.item.startsWith('sessions/')).map(r=>JSON.parse(r.text).total),[5,7,12]);
  assert.equal(rows.filter(r=>r.item==='messages/9').length,1);
  assert.deepEqual(JSON.parse(rows[1].text).content,{base64:'/w=='});
});

test('whole-file snapshots retain a return to earlier content', t => {
  const f = fixture(t);
  mkdirSync(join(f.root,'jcode'));
  const path = join(f.root,'jcode','session.json');
  for (const value of ['{}','{"long":true}','{}']) {
    writeFileSync(path,value);
    f.run();
  }
  assert.deepEqual(f.history('jcode').map(r=>r.text),['{}','{"long":true}','{}']);
});
