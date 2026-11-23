import { Worker } from 'node:worker_threads';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendResponse, type Routes } from './http.ts';
import type { Store } from './store.ts';

const staticFiles = new Map([
  ['/', 'text/html'],
  ['/index.html', 'text/html'],
  ['/css/app.css', 'text/css'],
  ...[
    'js/main',
    'js/sheet',
    'js/dash',
    'js/md',
    'js/lib/charts',
    'vendor/marked.min',
    ...[
      'overview',
      'roles',
      'repos',
      'runs',
      'sessions',
      'skills',
      'tokens',
      'search',
      'overall',
      'role-skills',
      'cli-tools',
    ].map((t) => 'js/tabs/' + t),
  ].map((n): [string, string] => ['/' + n + '.js', 'text/javascript']),
]);
const apiPaths = new Set([
  '/api/data',
  '/api/agent/summary',
  '/api/agent/run',
  '/api/team/skill',
  '/api/cli-tools',
]);
type WorkerReply = [number, string, string | Buffer];
export function createApi(ledger: Store | string) {
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
    next = 0;
  const pending = new Map<number, (r: WorkerReply) => void>();
  function startWorker() {
    const w = new Worker(new URL('./api-worker.ts', import.meta.url), { workerData: { home } });
    worker = w;
    w.on('message', ({ id, response }) => {
      pending.get(id)?.(response);
      pending.delete(id);
    });
    w.on('error', (e) => console.error('Dashboard worker failed', e));
    w.on('exit', () => {
      if (worker !== w) return;
      worker = undefined;
      for (const cb of pending.values()) cb([503, 'text/plain', 'Dashboard data is temporarily unavailable']);
      pending.clear();
    });
  }
  startWorker();
  function dispatch(url: string) {
    if (!worker) startWorker();
    const id = next++;
    return new Promise<WorkerReply>((done) => {
      pending.set(id, done);
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
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers?.host || ''))
      return response([403, 'text/plain', 'forbidden']);
    if (req.method !== 'GET') return response([405, 'text/plain', 'method not allowed']);
    try {
      const type = staticFiles.get(url.pathname);
      if (type) {
        const path = url.pathname === '/' ? '/index.html' : url.pathname;
        return response([
          200,
          type + '; charset=utf-8',
          await readFile(new URL('../dashboard/web' + path, import.meta.url)),
        ]);
      }
      if (!apiPaths.has(url.pathname)) return response([404, 'text/plain', 'not found']);
      if (closed) return response([503, 'text/plain', 'Dashboard data is temporarily unavailable']);
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
    await sendResponse(res, await route(req, url));
  }
  return Object.assign(handler, {
    routes,
    async close() {
      closed = true;
      await worker?.terminate();
    },
  });
}
