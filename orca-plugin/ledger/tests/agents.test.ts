import './team-env.ts'; // first: the team root is read when modules load
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';
import { type TestContext, test } from 'node:test';
import { AGENT_INVENTORY_TTL_MS, AGENT_LABELS_MAX_AGE_MS, Inventory, inventoryOf, readAgents } from '../agents.ts';
import { cycle } from '../cycle.ts';
import { build } from '../dashboard.ts';
import { projections } from '../derived.ts';
import { spawn } from 'node:child_process';
import { once as onePass, start, stop } from '../ingest.ts';
import { Store } from '../store.ts';

function scratch(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'agents-'));
  const home = join(root, 'ledger');
  const store = new Store(home);
  const calls = join(root, 'calls');
  t.after(() => {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  });
  /** A fake `orca` that counts its calls and answers `agent installed` with the given JSON, or fails when body is null. */
  const orca = (body: string | null) => {
    const path = join(root, 'orca');
    writeFileSync(path, `#!/bin/sh\necho x >> '${calls}'\n${body === null ? 'exit 1' : `echo '${body}'`}\n`, { mode: 0o700 });
    return path;
  };
  const count = () => (existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean).length : 0);
  projections(store)();
  return { root, home, store, orca, count };
}

/** Starts a refresh and waits for it to end. */
async function refresh(inventory: Inventory, binary: string, now: number, timeoutMs?: number) {
  inventory.refresh(binary, now, timeoutMs);
  await inventory.idle();
}

/** The injected clock of these tests: a fixed "now" in ms, close to the real one so default-clock reads still see fresh labels. */
const T0 = Date.now();
const INSTALLED =
  '{"ok":true,"result":{"agents":[{"id":"claude","name":"Claude Code","default":false},{"id":"pi","name":"Pi","default":true},{"id":"","name":"x"},{"id":"bad"}]}}';

test('installed agents are cached in the ledger and reach the dashboard snapshot as id and name', async (t) => {
  const { store, home, orca } = scratch(t);
  assert.deepEqual(readAgents(store.db), [], 'empty before Orca answered');
  await refresh(new Inventory(home), orca(INSTALLED), T0);
  const expected = [
    { id: 'claude', name: 'Claude Code' },
    { id: 'pi', name: 'Pi' },
  ];
  assert.deepEqual(readAgents(store.db), expected);
  assert.deepEqual(build(store, 7).agents, expected);
  assert.equal(build(store, 7).sessions.length, 0, 'installed agents add no usage rows');
  const fetched = store.db.prepare('SELECT fetched_at FROM agent_inventory WHERE id=1').get();
  assert.equal(fetched?.fetched_at, T0, 'the last success time is stored (a freshness limit can read it)');
});

test('the inventory is fetched at most once per TTL after an attempt ends, and after a failure the last answer is kept for 24 h', async (t) => {
  const { store, home, orca, count } = scratch(t);
  const inventory = new Inventory(home);
  await refresh(inventory, orca(INSTALLED), T0);
  await refresh(inventory, orca(INSTALLED), T0 + AGENT_INVENTORY_TTL_MS - 1);
  assert.equal(count(), 1, 'a second call inside the TTL does not run Orca');
  await refresh(inventory, orca(null), T0 + AGENT_INVENTORY_TTL_MS);
  assert.equal(count(), 2);
  assert.equal(readAgents(store.db, T0 + AGENT_INVENTORY_TTL_MS).length, 2, 'a failed refresh keeps the cached labels');
  assert.equal(build(store, 7, (T0 + AGENT_LABELS_MAX_AGE_MS - 1000) / 1000).agents.length, 2, 'still shown inside 24 h of the last success');
  assert.equal(build(store, 7, (T0 + AGENT_LABELS_MAX_AGE_MS) / 1000).agents.length, 2, 'exactly 24 h is still inside');
  assert.deepEqual(build(store, 7, (T0 + AGENT_LABELS_MAX_AGE_MS + 1000) / 1000).agents, [], 'past 24 h the snapshot omits them: the UI shows raw ids');
  assert.deepEqual(readAgents(store.db, T0 + 2 * AGENT_LABELS_MAX_AGE_MS), []);
  await refresh(inventory, orca(INSTALLED), T0 + AGENT_INVENTORY_TTL_MS + 5);
  assert.equal(count(), 2, 'a failed attempt also waits out the TTL');
});

test('without Orca the snapshot has no agent labels and nothing throws', async (t) => {
  const { store, home } = scratch(t);
  await refresh(new Inventory(home), join(tmpdir(), 'no-such-orca-binary'), T0);
  assert.deepEqual(build(store, 7).agents, []);
});

test('an answer that is not an inventory is ignored', async (t) => {
  const { store, home, orca } = scratch(t);
  await refresh(new Inventory(home), orca('{"ok":true,"result":{"raw":true}}'), T0);
  assert.deepEqual(readAgents(store.db), []);
});

test('a name whose UTF-8 bytes arrive in separate chunks is decoded once, not per chunk', async (t) => {
  const { store, home, root } = scratch(t);
  const path = join(root, 'split-orca');
  // "Π" is CE A0: the two bytes go out 200 ms apart, so they arrive as separate chunks.
  writeFileSync(path, '#!/bin/sh\nprintf \'{"ok":true,"result":{"agents":[{"id":"pi","name":"\\316\'\nsleep 0.2\nprintf \'\\240i"}]}}\'\n', { mode: 0o700 });
  await refresh(new Inventory(home), path, T0);
  assert.deepEqual(readAgents(store.db), [{ id: 'pi', name: 'Πi' }]);
});

/** A fake `orca` whose `agent installed` records its pid, ignores SIGTERM and sleeps; everything else answers like an empty Orca. */
const hung = (root: string, seconds = 4) => {
  const path = join(root, 'hung-orca');
  writeFileSync(
    path,
    `#!/bin/sh
if [ "$1" = agent ]; then
  echo $$ > '${join(root, 'pid')}'
  trap '' TERM
  sleep ${seconds}
  exit 1
fi
case "$2" in
run-list) result='{"runs":[]}' ;;
worker-list) result='{"workers":[]}' ;;
*) result='{"raw":true}' ;;
esac
echo "{\\"id\\":$$,\\"result\\":$result}"
`,
    { mode: 0o700 },
  );
  return path;
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const pidOf = async (root: string) => {
  for (let i = 0; i < 200 && !existsSync(join(root, 'pid')); i++) await sleep(25);
  return Number(readFileSync(join(root, 'pid'), 'utf8'));
};

test('a hung inventory command is killed at the timeout, even when it ignores SIGTERM', async (t) => {
  const { home, root } = scratch(t);
  const started = Date.now();
  await refresh(new Inventory(home), hung(root), T0, 1000);
  assert.ok(Date.now() - started < 3000, 'returned shortly after the 1 s timeout, not after the 4 s sleep');
  await sleep(100);
  assert.equal(alive(Number(readFileSync(join(root, 'pid'), 'utf8'))), false, 'the child is gone');
});

test('the ingest pass does not wait for the inventory, and does not report its failure', async (t) => {
  const { store, root } = scratch(t);
  const env: NodeJS.ProcessEnv = {};
  for (const kind of ['claude', 'codex', 'copilot', 'jcode', 'pi', 'hermes', 'rtk']) env['AGENT_LEDGER_' + kind.toUpperCase()] = join(root, kind);
  env.AGENT_LEDGER_ORCA = hung(root);
  const started = Date.now();
  const errors = await cycle(store, env);
  assert.ok(Date.now() - started < 2000, 'the pass finished long before the hung inventory command would');
  assert.deepEqual(errors, []);
  await inventoryOf(store).close();
});

test('a writer holding the ledger lock neither delays the pass nor loses the answer', async (t) => {
  const { store, home, root, orca } = scratch(t);
  const writer = new DatabaseSync(join(home, 'ledger.sqlite'));
  writer.exec('BEGIN IMMEDIATE');
  t.after(() => {
    try {
      writer.close();
    } catch {}
  });
  const inventory = new Inventory(home);
  const started = performance.now();
  inventory.refresh(orca(INSTALLED), T0);
  assert.ok(performance.now() - started < 50, 'refresh() returns at once: it touches no database');
  await sleep(500); // the child has answered; the write keeps failing on the busy ledger without blocking this thread
  assert.deepEqual(readAgents(store.db).length, 0, 'not written while the ledger is locked');
  writer.exec('ROLLBACK');
  await inventory.idle();
  assert.equal(readAgents(store.db).length, 2, 'written as soon as the lock is free');
  assert.ok(root);
});

test('a one-shot pass keeps a fast inventory answer, and leaves no cooldown to suppress the next one', async (t) => {
  const { root, home } = scratch(t);
  const env: NodeJS.ProcessEnv = { AGENT_LEDGER_HOME: home };
  for (const kind of ['claude', 'codex', 'copilot', 'jcode', 'pi', 'hermes', 'rtk']) env['AGENT_LEDGER_' + kind.toUpperCase()] = join(root, kind);
  // Answers the orchestration calls and the inventory at once.
  const path = join(root, 'fast-orca');
  writeFileSync(
    path,
    `#!/bin/sh
if [ "$1" = agent ]; then echo '${INSTALLED}'; exit 0; fi
case "$2" in
run-list) result='{"runs":[]}' ;;
worker-list) result='{"workers":[]}' ;;
*) result='{"raw":true}' ;;
esac
echo "{\\"id\\":$$,\\"result\\":$result}"
`,
    { mode: 0o700 },
  );
  env.AGENT_LEDGER_ORCA = path;
  const result = await onePass({ home, env });
  assert.deepEqual('errors' in result ? result.errors : ['locked'], [], JSON.stringify(result));
  const reopened = new Store(home);
  t.after(() => reopened.db.close());
  assert.equal(readAgents(reopened.db).length, 2, 'the answer survived the end of the one-shot pass');
});

test('stop() leaves no inventory command running', async (t) => {
  const { root, home } = scratch(t);
  const env: NodeJS.ProcessEnv = { ...process.env, AGENT_LEDGER_HOME: home };
  for (const kind of ['claude', 'codex', 'copilot', 'jcode', 'pi', 'hermes', 'rtk']) env['AGENT_LEDGER_' + kind.toUpperCase()] = join(root, kind);
  env.AGENT_LEDGER_ORCA = hung(root, 30);
  mkdirSync(join(root, 'claude'), { recursive: true });
  start({ home: join(root, 'host'), env: { ...env, AGENT_LEDGER_HOME: join(root, 'host') }, intervalMs: 60_000, host: 'test' });
  const pid = await pidOf(root);
  assert.ok(alive(pid), 'the inventory command is running while the host runs');
  await stop();
  await sleep(50);
  assert.equal(alive(pid), false, 'stop() killed it before the ledger closed');
});

/** Runs `daemon.ts --once` as the launchd job does and reports how long the process lived. */
function oneShot(root: string, orca: string): Promise<{ ms: number; code: number | null; stderr: string }> {
  const home = join(root, 'oneshot-home');
  const env: NodeJS.ProcessEnv = { ...process.env, AGENT_LEDGER_HOME: home, AGENT_LEDGER_ORCA: orca };
  for (const kind of ['claude', 'codex', 'copilot', 'jcode', 'pi', 'hermes', 'rtk']) env['AGENT_LEDGER_' + kind.toUpperCase()] = join(root, 'none-' + kind);
  return new Promise((resolve) => {
    const started = Date.now();
    let stderr = '';
    const child = spawn(process.execPath, [join(import.meta.dirname, '../daemon.ts'), '--once'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => resolve({ ms: Date.now() - started, code, stderr }));
  });
}
/** A fake `orca`: orchestration calls answer at once; `agent installed` runs `agentBranch`. */
const fakeOrca = (root: string, name: string, agentBranch: string) => {
  const path = join(root, name);
  writeFileSync(
    path,
    `#!/bin/sh
if [ "$1" = agent ]; then ${agentBranch}; fi
case "$2" in
run-list) result='{"runs":[]}' ;;
worker-list) result='{"workers":[]}' ;;
*) result='{"raw":true}' ;;
esac
echo "{\\"id\\":$$,\\"result\\":$result}"
`,
    { mode: 0o700 },
  );
  return path;
};

test('the one-shot process exits promptly after a fast inventory success or an immediate failure, and is bounded for a slow one', async (t) => {
  const { root } = scratch(t);
  const fast = await oneShot(root, fakeOrca(root, 'fast', `echo '${INSTALLED}'; exit 0`));
  assert.equal(fast.code, 0, fast.stderr);
  assert.ok(fast.ms < 1500, `fast success: the process lived ${fast.ms} ms (the 2 s grace timer must not outlive the refresh)`);
  const failing = await oneShot(root, fakeOrca(root, 'failing', 'exit 1'));
  assert.equal(failing.code, 0, failing.stderr);
  assert.ok(failing.ms < 1500, `immediate failure: the process lived ${failing.ms} ms`);
  const slow = await oneShot(root, hung(root, 30));
  assert.equal(slow.code, 0, slow.stderr);
  assert.ok(slow.ms >= 1800 && slow.ms < 6000, `slow command: the grace deadline still applies (${slow.ms} ms)`);
  await sleep(100);
  assert.equal(alive(Number(readFileSync(join(root, 'pid'), 'utf8'))), false, 'and the slow child is killed');
});
