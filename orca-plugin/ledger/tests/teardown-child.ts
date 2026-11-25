// Run by ingest.test.ts in its own node process: a host test that acquires the plugin host, then fails an assertion.
// Without teardown the listener and ingest timers keep this process alive past the failure.
import './team-env.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { SOURCE_PATHS, rootOf } from '../sources.ts';
import { teardowns } from './teardown.ts';

test('host test that fails after acquiring the host', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'teardown-'));
  // An Orca CLI stand-in that answers every call, so the first ingest pass completes and /health reports ok.
  const orcaStub = join(root, 'orca');
  writeFileSync(
    orcaStub,
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
  const defer = teardowns(t, () => rmSync(root, { recursive: true, force: true }));
  Object.assign(process.env, {
    AGENT_LEDGER_HOME: join(root, 'ledger'),
    TEAM_DASHBOARD_PORT: process.env.CHILD_PORT,
    AGENT_LEDGER_ORCA: orcaStub,
  });
  // Empty sources for every kind the ledger ingests (derived, so a new kind cannot read the developer's real histories).
  for (const kind of Object.keys(SOURCE_PATHS)) process.env['AGENT_LEDGER_' + kind.toUpperCase()] = join(root, kind);
  for (const kind of Object.keys(SOURCE_PATHS))
    assert.ok(
      rootOf(kind as keyof typeof SOURCE_PATHS).startsWith(root),
      `source ${kind} reads outside the fixture: ${rootOf(kind as keyof typeof SOURCE_PATHS)}`,
    );
  const { run, shutdown } = await import('../../src/ledger-host.ts');
  const hostLog: string[] = [];
  defer(shutdown); // right after acquiring, before anything can fail
  await run({ log: (m: string) => void hostLog.push(String(m)), host: { call: async () => {} }, events: { on() {} } });
  // Prove the host is really up before failing: a disabled or rolled-back host would make the failure below prove nothing.
  const port = process.env.CHILD_PORT;
  const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
  let health: { ok?: boolean; lock?: string; listening?: { bound?: number[]; apiError?: string } } | null = null;
  for (let i = 0; i < 600 && !health?.ok; i++) {
    await sleep(25);
    health = await get('/health').then(
      (r) => r?.json() ?? null,
      () => null,
    );
  }
  assert.equal(health?.ok, true, 'HOST-NOT-UP: /health answers ' + JSON.stringify(health) + hostLog.join(' | '));
  assert.equal(health?.lock, 'held', 'HOST-NOT-UP: the ingest lock is held');
  assert.deepEqual(health?.listening?.bound, [Number(port)], 'HOST-NOT-UP: the listener is bound');
  assert.equal(health?.listening?.apiError, undefined, 'HOST-NOT-UP: the API started');
  let api = await get('/api/data?days=7');
  for (let i = 0; i < 100 && api?.status === 503; i++) {
    await sleep(100);
    api = await get('/api/data?days=7');
  }
  assert.equal(api?.status, 200, 'HOST-NOT-UP: the API is ready');
  console.log('HOST-READY');
  assert.fail('FORCED-FAILURE');
});
