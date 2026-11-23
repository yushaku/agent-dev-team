import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { projections } from '../derived.ts';
import { files, ingestFile } from '../files.ts';
import { Store } from '../store.ts';
import { golden } from './golden.ts';

// The three transcript fixtures (Claude, Codex, Copilot with its workspace.yaml sidecar) against Python's
// parsers, whose output was frozen into tests/golden (GOLDEN_RECORD=1 while the Python dashboard existed).
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
    if (agent === 'copilot') for (const p of files(join(fixtures, 'copilot'), 'copilot', (_, e) => { throw e; })) ingestFile(store, agent, p);
    else ingestFile(store, agent, path);
    await projections(store)();
    const rows = store.db.prepare('SELECT data FROM dashboard_sessions').all();
    assert.equal(rows.length, 1);
    const expected = golden('fixture-' + agent, fixtures, () =>
      JSON.parse(
        execFileSync(
          'python3',
          ['-c', `import sys,json\nfrom backend.parsers.${agent} import parse_${agent} as parse\nprint(json.dumps(parse(sys.argv[1])))`, path],
          { cwd: resolve(import.meta.dirname, '../../dashboard'), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } },
        ),
      ),
    );
    assert.deepEqual(JSON.parse(String(rows[0].data)), expected);
  });
