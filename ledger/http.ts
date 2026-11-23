// A small loopback HTTP server that routes are mounted on (step 2b adds the API routes).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type Route = (req: IncomingMessage, url: URL) => unknown | Promise<unknown>;
export type Routes = Record<string, Route>;

/** Serves JSON for GET routes keyed by path; anything else is 404, other methods 405. */
export function serve(routes: Routes, { port = 4748, host = '127.0.0.1', retryMs = 0, onError = (_: Error) => {} } = {}) {
  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = routes[url.pathname];
    if (!route) return void res.writeHead(404).end();
    if (req.method !== 'GET') return void res.writeHead(405, { Allow: 'GET' }).end();
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(await route(req, url)));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(error) }));
    }
  });
  let timer: NodeJS.Timeout | undefined, closed = false;
  server.on('error', (error: NodeJS.ErrnoException) => {
    onError(error);
    // A previous host (a reload) may still hold the port: try again instead of staying dark.
    if (error.code === 'EADDRINUSE' && retryMs && !closed) timer = setTimeout(() => server.listen(port, host), retryMs);
  });
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
