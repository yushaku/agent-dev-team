import { Worker } from 'node:worker_threads';
import { teamRoot, webRoot } from './roots.ts';
import { dirname, extname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostAllowed, sendResponse, type Routes } from './http.ts';
import type { Store } from './store.ts';

const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
/** Every regular file of the web bundle becomes a route, so a new asset needs no list to update (links and dot files are skipped). */
function bundleRoutes(root: string) {
  const routes = new Map<string, string>([['/', 'text/html']]);
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(join(dir, entry.name), prefix + entry.name + '/');
      else if (mime[extname(entry.name)]) routes.set('/' + prefix + entry.name, mime[extname(entry.name)]);
    }
  };
  walk(root, '');
  return routes;
}
const apiPaths = new Set([
  '/api/data',
  '/api/agent/summary',
  '/api/agent/run',
  '/api/team/skill',
  '/api/cli-tools',
]);
type WorkerReply = [number, string, string | Buffer];
const loading: WorkerReply = [503, 'application/json', JSON.stringify({ loading: true })];
export function createApi(ledger: Store | string, { timeoutMs = 10000 } = {}) {
  const assets = webRoot();
  const staticFiles = bundleRoutes(assets);
  teamRoot();
  const home =
    typeof ledger === 'string'
      ? ledger
      : dirname(
          String(
            ledger.db
              .prepare('PRAGMA database_list')
              .all()
              .find((d) => d.name === 'main')!.file,
          ),
        );
  let worker: Worker | undefined,
    closed = false,
    next = 0,
    retryAt = 0;
  const pending = new Map<number, (r: WorkerReply) => void>();
  function startWorker() {
    const w = new Worker(new URL('./api-worker.ts', import.meta.url), { workerData: { home } });
    worker = w;
    w.on('message', ({ id, response }) => {
      pending.get(id)?.(response);
    });
    w.on('error', (e) => console.error('Dashboard worker failed', e));
    w.on('exit', () => {
      if (worker !== w) return;
      worker = undefined;
      retryAt = Date.now() + 1000;
      for (const cb of pending.values()) cb(loading);
    });
  }
  startWorker();
  function dispatch(url: string) {
    if (closed || (!worker && Date.now() < retryAt)) return Promise.resolve(loading);
    if (!worker) startWorker();
    const id = next++;
    return new Promise<WorkerReply>((done) => {
      function finish(reply: WorkerReply) {
        clearTimeout(timer);
        pending.delete(id);
        done(reply);
      }
      const timer = setTimeout(() => finish(loading), timeoutMs);
      pending.set(id, finish);
      worker!.postMessage({ id, url });
    });
  }
  function response([status, type, body]: WorkerReply) {
    return new Response(typeof body === 'string' ? body : new Uint8Array(body), {
      status,
      headers: {
        'Content-Type': type,
        'Content-Length': String(Buffer.byteLength(body)),
        'Cache-Control': 'no-store',
      },
    });
  }
  async function route(req: { method?: string; headers?: IncomingMessage['headers'] }, url: URL) {
    if (req.method !== 'GET') return response([405, 'text/plain', 'method not allowed']);
    try {
      const type = staticFiles.get(url.pathname);
      if (type) {
        const path = url.pathname === '/' ? '/index.html' : url.pathname;
        return response([200, type + '; charset=utf-8', await readFile(join(assets, path))]);
      }
      if (!apiPaths.has(url.pathname)) return response([404, 'text/plain', 'not found']);
      return response(await dispatch(url.pathname + url.search));
    } catch {
      return response([500, 'text/plain', 'Dashboard request failed']);
    }
  }
  const routes: Routes = Object.fromEntries(
    [...apiPaths, ...staticFiles.keys()].map((path) => [path, route]),
  );
  async function handler(req: IncomingMessage, res: ServerResponse) {
    let url: URL;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return sendResponse(res, response([400, 'text/plain', 'invalid URL']));
    }
    // serve() checks the Host for every route it mounts; this handler is the standalone entry (serve.ts).
    if (!hostAllowed(req)) return sendResponse(res, response([403, 'text/plain', 'forbidden']));
    await sendResponse(res, await route(req, url));
  }
  return Object.assign(handler, {
    routes,
    async close() {
      closed = true;
      for (const cb of pending.values()) cb(loading);
      await worker?.terminate();
    },
  });
}
