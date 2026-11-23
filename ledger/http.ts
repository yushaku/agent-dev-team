// A small loopback HTTP server that routes are mounted on (step 2b adds the API routes).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { HttpApi, Route } from './types.ts';

export type Routes = Record<string, Route>;
const reply = (res: ServerResponse, status: number, body: unknown) => {
  const text = JSON.stringify(body);
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(text);
};

export async function sendResponse(res: ServerResponse, response: Response) {
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(body);
}

/** Serves JSON for GET routes keyed by path; unknown paths are 404, other methods 405, a bad URL 400, a failing route 500. */
export function serve(routes: Routes, { port = 4748, host = '127.0.0.1', retryMs = 0, onError = (_: Error) => {}, onListening = () => {} }: Parameters<HttpApi['serve']>[1] = {}) {
  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      let url: URL;
      try { url = new URL(req.url ?? '/', 'http://localhost'); } catch { return reply(res, 400, { error: 'invalid URL' }); }
      if (!Object.hasOwn(routes, url.pathname)) return reply(res, 404, { error: 'not found' });
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return reply(res, 405, { error: 'method not allowed' }); }
      const result = await routes[url.pathname](req, url);
      if (result instanceof Response) return await sendResponse(res, result);
      reply(res, 200, result);
    } catch (error) {
      try { reply(res, 500, { error: String(error) }); } catch { res.destroy(); }
    }
  });
  let timer: NodeJS.Timeout | undefined, closed = false;
  server.on('error', (error: NodeJS.ErrnoException) => {
    onError(error);
    // A previous host (a reload) may still hold the port: try again instead of staying dark.
    if (error.code === 'EADDRINUSE' && retryMs && !closed) timer = setTimeout(() => server.listen(port, host), retryMs);
  });
  server.on('listening', onListening);
  server.listen(port, host);
  return {
    server,
    close: () => new Promise<void>((done) => {
      closed = true; clearTimeout(timer);
      if (!server.listening) return done();
      server.close(() => done()); server.closeAllConnections();
    }),
  };
}
