import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApi } from '../api.ts';
import { MIME, readAsset, scanBundle } from '../assets.ts';
import { webRoot } from '../roots.ts';

/** A scratch web bundle and a file outside it that no route may ever return. */
function bundle(t: import('node:test').TestContext) {
  const base = mkdtempSync(join(tmpdir(), 'static-routes-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'web');
  mkdirSync(join(root, 'js'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>page</title>');
  writeFileSync(join(root, 'js', 'app.js'), 'export const app = 1');
  const outside = join(base, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'secret.js'), 'export const secret = "do not serve"');
  writeFileSync(join(outside, 'page.html'), '<!doctype html><title>outside</title>');
  return { base, root, outside };
}
async function serveApi(t: import('node:test').TestContext, root: string) {
  process.env.AGENT_DASHBOARD_WEB = root;
  t.after(() => {
    delete process.env.AGENT_DASHBOARD_WEB;
  });
  const api = createApi(join(root, '..', 'ledger'));
  const server = createServer((req, res) => void api(req, res));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await api.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });
  const { port } = server.address() as { port: number };
  // http.request keeps the path exactly as given (fetch may normalize it)
  const get = (path: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      request({ port, host: '127.0.0.1', path }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      })
        .on('error', reject)
        .end();
    });
  return { get, routes: api.routes };
}

test('the root alias and the page are served only from an approved regular index.html', async (t) => {
  const { root } = bundle(t);
  const { get, routes } = await serveApi(t, root);
  assert.ok('/' in routes && '/index.html' in routes);
  assert.match((await get('/')).body, /<title>page<\/title>/);
  assert.equal((await get('/index.html')).status, 200);
  assert.equal((await get('/js/app.js')).status, 200);
});

test('a linked index.html is refused at startup, so the root alias never serves outside the bundle', (t) => {
  const { root, outside } = bundle(t);
  rmSync(join(root, 'index.html'));
  symlinkSync(join(outside, 'page.html'), join(root, 'index.html'));
  process.env.AGENT_DASHBOARD_WEB = root;
  t.after(() => {
    delete process.env.AGENT_DASHBOARD_WEB;
  });
  assert.throws(() => webRoot(), /AGENT_DASHBOARD_WEB must contain index.html/);
  assert.throws(() => createApi(join(root, '..', 'ledger')), /must contain index.html/);
});

test('dot files, linked files, linked directories and special files are never routes', (t) => {
  const { root, outside } = bundle(t);
  writeFileSync(join(root, '.hidden.js'), 'export const hidden = 1');
  mkdirSync(join(root, '.cache'));
  writeFileSync(join(root, '.cache', 'x.js'), 'export const x = 1');
  symlinkSync(join(outside, 'secret.js'), join(root, 'js', 'linked.js'));
  symlinkSync(outside, join(root, 'linked-dir'));
  symlinkSync(join(root, 'js'), join(root, 'alias-dir'));
  writeFileSync(join(root, 'notes.txt'), 'unsupported type');
  const keys = [...scanBundle(root).keys()].sort();
  assert.deepEqual(keys, ['/', '/index.html', '/js/app.js']);
  for (const extension of Object.keys(MIME)) assert.match(extension, /^\.[a-z0-9]+$/);
});

test('over HTTP those entries answer 404 and nothing outside the bundle is returned', async (t) => {
  const { root, outside } = bundle(t);
  writeFileSync(join(root, '.hidden.js'), 'export const hidden = 1');
  symlinkSync(join(outside, 'secret.js'), join(root, 'js', 'linked.js'));
  symlinkSync(outside, join(root, 'linked-dir'));
  const { get } = await serveApi(t, root);
  for (const path of [
    '/.hidden.js',
    '/js/linked.js',
    '/linked-dir/secret.js',
    '/linked-dir/page.html',
    '/../outside/secret.js',
    '/%2e%2e/outside/secret.js',
    '/js/%2e%2e/%2e%2e/outside/secret.js',
  ]) {
    const answer = await get(path);
    assert.equal(answer.status, 404, path);
    assert.doesNotMatch(answer.body, /do not serve|outside/, path);
  }
});

test('a file replaced by a link after the scan is refused at read time, and so is a replaced parent directory', async (t) => {
  const { root, outside } = bundle(t);
  mkdirSync(join(root, 'lib'));
  writeFileSync(join(root, 'lib', 'a.js'), 'export const a = 1');
  const { get } = await serveApi(t, root);
  assert.equal((await get('/js/app.js')).status, 200);
  rmSync(join(root, 'js', 'app.js'));
  symlinkSync(join(outside, 'secret.js'), join(root, 'js', 'app.js'));
  const swapped = await get('/js/app.js');
  assert.equal(swapped.status, 500);
  assert.doesNotMatch(swapped.body, /do not serve/);
  rmSync(join(root, 'lib'), { recursive: true });
  symlinkSync(outside, join(root, 'lib'));
  writeFileSync(join(outside, 'a.js'), 'export const stolen = 1');
  const parent = await get('/lib/a.js');
  assert.equal(parent.status, 500);
  assert.doesNotMatch(parent.body, /stolen/);
  // readAsset itself says why
  const asset = scanBundle(root).get('/index.html')!;
  await assert.doesNotReject(readAsset(root, asset));
  await assert.rejects(readAsset(root, { ...asset, file: join(root, 'lib', 'a.js'), rel: 'lib/a.js' }), /moved or linked|outside the bundle/);
});

test('assets with spaces and non-ASCII names are reachable under their percent-encoded URLs', async (t) => {
  const { root } = bundle(t);
  mkdirSync(join(root, 'ảnh đẹp'));
  writeFileSync(join(root, 'ảnh đẹp', 'tệp lạ.js'), 'export const unicode = 1');
  writeFileSync(join(root, 'with space.css'), 'body { color: red }');
  writeFileSync(join(root, "a+b(1)'.js"), 'export const odd = 1');
  const keys = [...scanBundle(root).keys()];
  assert.ok(keys.includes('/with%20space.css'));
  assert.ok(keys.includes('/%E1%BA%A3nh%20%C4%91%E1%BA%B9p/t%E1%BB%87p%20l%E1%BA%A1.js'));
  const { get } = await serveApi(t, root);
  assert.equal((await get('/with%20space.css')).status, 200);
  assert.match((await get('/%E1%BA%A3nh%20%C4%91%E1%BA%B9p/t%E1%BB%87p%20l%E1%BA%A1.js')).body, /unicode/);
  assert.equal((await get("/a%2Bb(1)'.js")).status, 200);
  assert.equal((await get('/with space.css'.replace(' ', '%20'))).status, 200);
  assert.equal((await get('/missing%20file.css')).status, 404);
});

test('an unreadable file is a request failure, not a crash', async (t) => {
  const { root } = bundle(t);
  const { get } = await serveApi(t, root);
  chmodSync(join(root, 'js', 'app.js'), 0o000);
  t.after(() => {
    try {
      chmodSync(join(root, 'js', 'app.js'), 0o644);
    } catch {
      /* the scratch directory is already gone */
    }
  });
  assert.equal((await get('/js/app.js')).status, process.getuid?.() === 0 ? 200 : 500);
  assert.equal((await get('/')).status, 200);
});

test('a registered asset that becomes a FIFO is refused without blocking, over HTTP and in readAsset', async (t) => {
  const { root } = bundle(t);
  const { get } = await serveApi(t, root);
  const asset = scanBundle(root).get('/js/app.js')!;
  assert.equal((await get('/js/app.js')).status, 200);
  rmSync(join(root, 'js', 'app.js'));
  execFileSync('mkfifo', [join(root, 'js', 'app.js')]); // a plain open(O_RDONLY) of this would wait for a writer forever
  const settled = (promise: Promise<unknown>) =>
    Promise.race([
      promise.then(
        () => 'settled',
        () => 'settled',
      ),
      new Promise((done) => setTimeout(() => done('blocked'), 3000)),
    ]);
  assert.equal(await settled(readAsset(root, asset)), 'settled');
  await assert.rejects(readAsset(root, asset), /not a regular file/);
  const answer = await Promise.race([get('/js/app.js'), new Promise<{ status: number }>((done) => setTimeout(() => done({ status: -1 }), 3000))]);
  assert.equal(answer.status, 500, 'the request settles with a failure instead of hanging');
  assert.equal((await get('/index.html')).status, 200, 'other assets still answer');
});
