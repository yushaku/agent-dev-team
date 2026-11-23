import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { PARSER_VERSION, projections } from '../derived.ts';
import { ingestFile } from '../files.ts';
import { Store } from '../store.ts';

const scripts = join(import.meta.dirname, '../scripts');
const fixtures = join(import.meta.dirname, 'fixtures/parity');

test('parity CLI compares all transcript, sidecar and SQLite source types', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'parity-input-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixtures, root, { recursive: true });
  mkdirSync(join(root, 'jcode'));
  writeFileSync(join(root, 'jcode', 'session.json'), JSON.stringify({ id: 'j', messages: [] }));
  const path = join(root, 'codex', 'trimmed.jsonl');
  const original = Buffer.concat([readFileSync(path), Buffer.from('{"partial":')]);
  writeFileSync(path, original);
  const hermes = new DatabaseSync(join(root, 'state.db'));
  hermes.exec(`
    CREATE TABLE sessions(id,title,started_at,ended_at,input_tokens,output_tokens,cache_read_tokens,
      cache_write_tokens,reasoning_tokens,cwd,git_branch,model,source);
    CREATE TABLE messages(session_id,role,content,tool_name,tool_calls,timestamp,active);
    INSERT INTO sessions VALUES('h','',1,2,10,2,0,0,0,NULL,NULL,'model','cli');
    INSERT INTO messages VALUES('h','user','fixture',NULL,NULL,1,1);
  `);
  hermes.close();
  // Keep the writer open so the backup must include committed rows in the WAL.
  const rtk = new DatabaseSync(join(root, 'history.db'));
  t.after(() => rtk.close());
  rtk.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE commands(timestamp,rtk_cmd,project_path,input_tokens,output_tokens,saved_tokens,exec_time_ms);
    INSERT INTO commands VALUES('2026-11-13','ls','/example',8,3,5,1)`);
  const run = spawnSync(process.execPath, [join(scripts, 'parity.ts'), root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  for (const agent of ['claude', 'codex', 'copilot', 'hermes', 'jcode'])
    assert.match(run.stdout, new RegExp(agent + ' 1 sessions'));
  assert.match(run.stdout, /rtk 1 commands/);
  assert.match(run.stdout, /0 differences/);
  assert.deepEqual(readFileSync(path), original);
  assert.equal(rtk.prepare('SELECT count(*) AS n FROM commands').get()!.n, 1);
});

test('the Python comparison reports a changed field without exposing its content', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'parity-output-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new Store(root);
  try {
    ingestFile(store, 'codex', join(fixtures, 'codex', 'trimmed.jsonl'));
    await projections(store)();
    store.db.exec("UPDATE dashboard_sessions SET data=json_set(data,'$.preview','private fixture value')");
  } finally {
    store.db.close();
  }
  const run = spawnSync(
    'python3',
    [join(scripts, 'parity.py'), join(root, 'ledger.sqlite'), String(PARSER_VERSION)],
    {
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      encoding: 'utf8',
    },
  );
  assert.equal(run.status, 1);
  assert.match(run.stdout, /codex.preview: 1/);
  assert.doesNotMatch(run.stdout + run.stderr, /private fixture value|trimmed\.jsonl/);
});
