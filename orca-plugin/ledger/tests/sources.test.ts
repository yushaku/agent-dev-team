import './team-env.ts'; // first: the team root is read when modules load
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TestContext, test } from 'node:test';
import { build } from '../dashboard.ts';
import { projections } from '../derived.ts';
import { readSources, recordRoots, SOURCE_NOTES, SOURCE_PATHS } from '../sources.ts';
import { Store } from '../store.ts';

function scratch(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'sources-'));
  const store = new Store(join(root, 'ledger'));
  t.after(() => {
    store.db.close();
    rmSync(root, { recursive: true });
  });
  projections(store)();
  return { root, store };
}

test('the snapshot lists every source the ledger reads, with path, file count and accounting note', (t) => {
  const { store } = scratch(t);
  const sources = build(store, 7).sources;
  assert.deepEqual(
    sources.map((s) => s.kind),
    [...Object.keys(SOURCE_PATHS), 'orca'],
    'claude, codex, copilot, jcode, hermes, rtk and orca',
  );
  for (const s of sources) {
    assert.ok(s.note.length > 20 && s.note === SOURCE_NOTES[s.kind], s.kind + ' has its note');
    assert.equal(s.present, false);
    assert.equal(s.files, ['claude', 'codex', 'copilot', 'jcode'].includes(s.kind) ? 0 : null, 'only file sources have a file count');
  }
  assert.ok(sources.find((s) => s.kind === 'claude')?.path.startsWith('~/'), 'the home directory is shown as ~');
});

test('the configured roots, not the defaults, are what the methodology shows, and archived files are counted', (t) => {
  const { root, store } = scratch(t);
  recordRoots(store, { AGENT_LEDGER_JCODE: join(root, 'jcode-here'), AGENT_LEDGER_ORCA: '/opt/orca' });
  store.source('jcode', join(root, 'jcode-here', 'a.json'));
  const sources = readSources(store.db);
  assert.equal(sources.find((s) => s.kind === 'jcode')?.path, join(root, 'jcode-here'));
  assert.equal(sources.find((s) => s.kind === 'jcode')?.files, 1);
  assert.equal(sources.find((s) => s.kind === 'jcode')?.present, true);
  assert.equal(sources.find((s) => s.kind === 'orca')?.path, '/opt/orca');
  assert.equal(sources.find((s) => s.kind === 'codex')?.path, '~/' + SOURCE_PATHS.codex, 'unset roots keep the default under ~');
  assert.ok(homedir().length > 1);
});

test('a Copilot directory marker is not counted as a file, and databases and Orca answers have no file count', (t) => {
  const { root, store } = scratch(t);
  const dir = store.source('copilot', join(root, 'session-state', 'empty'));
  store.db.prepare("INSERT INTO versions(source,generation,item,hash) VALUES(?,?,'directory','x')").run(dir, 1);
  store.source('hermes', join(root, 'state.db'));
  store.source('orca', 'run-list');
  const by = Object.fromEntries(readSources(store.db).map((s) => [s.kind, s]));
  assert.equal(by.copilot.files, 0, 'an empty session directory is not a file');
  assert.equal(by.hermes.files, null);
  assert.equal(by.hermes.present, true);
  assert.equal(by.orca.files, null);
  assert.equal(by.orca.present, true);
});
