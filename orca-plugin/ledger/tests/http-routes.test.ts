import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApi } from '../api.ts';
import { serve } from '../http.ts';

test('dashboard routes share the plugin HTTP server with its JSON health route', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'ledger-http-routes-'));
  const api = createApi(home);
  const host = serve({ '/health': () => ({ ok: true }), ...api.routes }, { port: 0 });
  t.after(async () => {
    await host.close();
    await api.close();
    await rm(home, { recursive: true, force: true });
  });
  await once(host.server, 'listening');
  const address = host.server.address();
  assert.ok(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;

  const health = await fetch(base + '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  const data = await fetch(base + '/api/data?days=30');
  assert.equal(data.status, 200);
  assert.equal(data.headers.get('content-type'), 'application/json');
  assert.equal((await data.json()).days, 30);

  const summary = await fetch(base + '/api/agent/summary?days=30');
  assert.equal(summary.status, 200);
  assert.equal(summary.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.match(await summary.text(), /^# Team dashboard summary\n/);

  const missing = await fetch(base + '/api/agent/run?id=missing');
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'unknown run id');

  const page = await fetch(base + '/');
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await page.arrayBuffer()), await readFile(new URL('../../dashboard-web/index.html', import.meta.url)));

  const status = await new Promise<number | undefined>((resolve, reject) => {
    get(base + '/api/data', { headers: { Host: 'example.com' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(status, 403);
});
