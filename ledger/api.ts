import { Worker } from 'node:worker_threads';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
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
const routes = new Set([
  '/api/data',
  '/api/agent/summary',
  '/api/agent/run',
  '/api/team/skill',
  '/api/cli-tools',
]);
type Response = [number, string, string | Buffer];
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
  const pending = new Map<number, (r: Response) => void>();
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
    return new Promise<Response>((done) => {
      pending.set(id, done);
      worker!.postMessage({ id, url });
    });
  }
  async function handler(req: IncomingMessage, res: ServerResponse) {
    function send([code, type, body]: Response) {
      res.writeHead(code, {
        'Content-Type': type,
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
      });
      res.end(body);
    }
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || ''))
      return send([403, 'text/plain', 'forbidden']);
    if (req.method !== 'GET') return send([405, 'text/plain', 'method not allowed']);
    try {
      const url = new URL(req.url || '/', 'http://localhost'),
        type = staticFiles.get(url.pathname);
      if (type) {
        const path = url.pathname === '/' ? '/index.html' : url.pathname;
        return send([
          200,
          type + '; charset=utf-8',
          await readFile(new URL('../dashboard/web' + path, import.meta.url)),
        ]);
      }
      if (!routes.has(url.pathname)) return send([404, 'text/plain', 'not found']);
      if (closed) return send([503, 'text/plain', 'Dashboard data is temporarily unavailable']);
      send(await dispatch(url.pathname + url.search));
    } catch {
      send([500, 'text/plain', 'Dashboard request failed']);
    }
  }
  return Object.assign(handler, {
    async close() {
      closed = true;
      await worker?.terminate();
    },
  });
}
