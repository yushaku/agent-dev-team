// The web bundle the dashboard serves: which files are routes, under which URLs, and how one is read.
import { constants, realpathSync, readdirSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

/** The only file types served; anything else in the bundle directory is ignored. */
export const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
export type Asset = { file: string; rel: string; type: string };

/**
 * Every regular file of the bundle with a supported extension becomes a route. Dot files, links (to files or
 * directories) and special files are skipped, so a link in the bundle can never be a route. Keys are URL
 * pathnames as a browser sends them: each segment percent-encoded (and, for characters the URL parser leaves
 * alone, also the parser's own form), while `file` is the plain path that is read. `/` is an alias of
 * `/index.html`, registered only when that is an approved regular file.
 */
export function scanBundle(root: string): Map<string, Asset> {
  const real = realpathSync(root);
  const routes = new Map<string, Asset>();
  const walk = (dir: string, prefix: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(join(dir, entry.name), [...prefix, entry.name]);
      else if (entry.isFile() && MIME[extname(entry.name)]) {
        const parts = [...prefix, entry.name];
        const asset: Asset = { file: join(real, ...parts), rel: parts.join('/'), type: MIME[extname(entry.name)] };
        const strict = '/' + parts.map(encodeURIComponent).join('/');
        const parsed = new URL('/' + parts.map((p) => p.replace(/[%?#]/g, encodeURIComponent)).join('/'), 'http://localhost').pathname;
        routes.set(strict, asset);
        routes.set(parsed, asset);
      }
    }
  };
  walk(real, []);
  const index = routes.get('/index.html');
  if (index) routes.set('/', index);
  return routes;
}

/**
 * Reads a registered asset, refusing anything that is no longer the regular file that was scanned: a parent
 * directory or the file itself replaced by a link since the scan, or a path that now resolves outside the bundle.
 */
export async function readAsset(root: string, asset: Asset): Promise<Buffer> {
  const real = realpathSync(root);
  if (realpathSync(asset.file) !== join(real, ...asset.rel.split('/'))) throw new Error('asset moved or linked: ' + asset.rel);
  if (!asset.file.startsWith(real + sep)) throw new Error('asset outside the bundle: ' + asset.rel);
  const handle = await open(asset.file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new Error('asset is not a regular file: ' + asset.rel);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
