import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { createApi } from '../api.ts';
import { Store } from '../store.ts';

async function scratch(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'dashboard-api-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function request(api: ReturnType<typeof createApi>, path: string) {
  const url = new URL(path, 'http://localhost');
  const req = { method: 'GET', headers: { host: 'localhost' } };
  return api.routes[url.pathname](req, url) as Promise<Response>;
}

test('configured roots resolve static assets and identify a missing installation', async (t) => {
  const home = await scratch(t);
  const oldWeb = process.env.AGENT_DASHBOARD_WEB,
    oldTeam = process.env.AGENT_TEAM_HOME;
  t.after(() => {
    if (oldWeb === undefined) delete process.env.AGENT_DASHBOARD_WEB;
    else process.env.AGENT_DASHBOARD_WEB = oldWeb;
    if (oldTeam === undefined) delete process.env.AGENT_TEAM_HOME;
    else process.env.AGENT_TEAM_HOME = oldTeam;
  });
  process.env.AGENT_DASHBOARD_WEB = home;
  assert.throws(() => createApi(home), /AGENT_DASHBOARD_WEB.*index.html/);
  await writeFile(join(home, 'index.html'), 'plugin assets');
  process.env.AGENT_TEAM_HOME = home;
  assert.throws(() => createApi(home), /AGENT_TEAM_HOME.*skills/);
  await mkdir(join(home, 'skills'));
  const api = createApi(home);
  try {
    assert.equal(await (await request(api, '/')).text(), 'plugin assets');
  } finally {
    await api.close();
  }
});

test('pending requests resolve on timeout and shutdown', async (t) => {
  const home = await scratch(t);
  const api = createApi(home, { timeoutMs: 1 });
  try {
    const timedOut = await request(api, '/api/data');
    assert.equal(timedOut.status, 503);
    assert.deepEqual(await timedOut.json(), { loading: true });
    const pending = request(api, '/api/data');
    const closing = api.close();
    assert.deepEqual(await (await pending).json(), { loading: true });
    await closing;
    assert.equal((await request(api, '/api/data')).status, 503);
  } finally {
    await api.close();
  }
});

test('a failed startup backs off before a recovered ledger is reopened', async (t) => {
  const dir = await scratch(t),
    home = join(dir, 'ledger');
  await writeFile(home, 'occupied');
  const api = createApi(home);
  try {
    assert.equal((await request(api, '/api/data')).status, 503);
    await rm(home);
    assert.equal((await request(api, '/api/data')).status, 503);
    await delay(1100);
    const response = await request(api, '/api/data');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).projection, { errors: 0, lag: 0 });
  } finally {
    await api.close();
  }
});

test('the data endpoint reports a quarantined source after the cursor catches up', async (t) => {
  const store = new Store(await scratch(t));
  const source = store.source('rtk', 'history.db');
  store.record(source, 1, 'commands/1', Buffer.from('invalid JSON'));
  const api = createApi(store);
  try {
    const result = await request(api, '/api/data');
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).projection, { errors: 1, lag: 0 });
  } finally {
    await api.close();
    store.db.close();
  }
});

test('CLI discovery coalesces, serves cached results, and yields to dashboard data', async (t) => {
  const api = createApi(await scratch(t));
  try {
    const first = request(api, '/api/cli-tools');
    const second = request(api, '/api/cli-tools');
    const data = request(api, '/api/data');
    assert.equal(await Promise.race([first.then(() => 'cli'), data.then(() => 'data')]), 'data');
    const inventory = await (await first).text();
    assert.ok(JSON.parse(inventory).generated_at);
    assert.equal(await (await second).text(), inventory);
    assert.equal(await (await request(api, '/api/cli-tools')).text(), inventory);
  } finally {
    await api.close();
  }
});

test('standalone reports an occupied port and exits', async (t) => {
  const home = await scratch(t),
    server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const child = spawn(process.execPath, [new URL('../serve.ts', import.meta.url).pathname, '--port', String(address.port)], {
    env: { ...process.env, AGENT_LEDGER_HOME: home },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (data) => {
    stderr += data;
  });
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.match(stderr, /could not listen.*EADDRINUSE/);
});
