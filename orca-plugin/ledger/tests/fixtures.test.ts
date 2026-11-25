import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { projections } from '../derived.ts';
import { files, ingestFile } from '../files.ts';
import { Store } from '../store.ts';
import { golden } from './golden.ts';

// The three transcript fixtures (Claude, Codex, Copilot with its workspace.yaml sidecar) against Python's
// parsers, whose output was frozen into tests/golden before the Python dashboard was removed.
const fixtures = join(import.meta.dirname, 'fixtures/parity');
const cases: [string, string][] = [
  ['claude', join(fixtures, 'claude/trimmed.jsonl')],
  ['codex', join(fixtures, 'codex/trimmed.jsonl')],
  ['copilot', join(fixtures, 'copilot/session/events.jsonl')],
];
for (const [agent, path] of cases)
  test(`the ${agent} fixture projects to what Python's parser produced`, async (t) => {
    const home = mkdtempSync(join(tmpdir(), 'fixture-golden-'));
    const store = new Store(home);
    t.after(() => {
      store.db.close();
      rmSync(home, { recursive: true, force: true });
    });
    // Copilot sessions are a directory: events.jsonl plus the workspace.yaml sidecar, found the way ingest finds them.
    if (agent === 'copilot')
      for (const p of files(join(fixtures, 'copilot'), 'copilot', (_, e) => {
        throw e;
      }))
        ingestFile(store, agent, p);
    else ingestFile(store, agent, path);
    await projections(store)();
    const rows = store.db.prepare('SELECT data FROM dashboard_sessions').all();
    assert.equal(rows.length, 1);
    const expected = golden('fixture-' + agent, fixtures);
    assert.deepEqual(JSON.parse(String(rows[0].data)), expected);
  });

test('golden placeholders are filled in values and keys, so a path with quotes or backslashes cannot break the file', (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'golden-path-'));
  const root = join(parent, 'say "hi" \\ back {x}');
  mkdirSync(root);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const real = realpathSync(root);
  const home = homedir();
  const fixtures = join(import.meta.dirname, 'fixtures');
  const shown = fixtures.startsWith(home + '/') ? '~' + fixtures.slice(home.length) : fixtures;
  assert.deepEqual(golden('placeholders', root), { [root + '/key']: [root, real + '/x', shown + '/y', 'plain'] });
});
