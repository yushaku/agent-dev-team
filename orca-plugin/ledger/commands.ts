import type { CliTools } from './protocol.ts';
import { accessSync, constants, readFileSync, realpathSync, readdirSync, statSync } from 'node:fs';
import { hostname, type, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { home, ls } from './metadata.ts';

function metadata(path: string) {
  try {
    const b = readFileSync(path);
    return (path.endsWith('.gz') ? gunzipSync(b) : b).subarray(0, 65536).toString();
  } catch {
    return '';
  }
}
/** Where a command came from, by its resolved path and local package metadata: [source, package, version]. */
export function install(path: string) {
  const parts = path.split('/');
  for (const m of ['Cellar', 'Caskroom']) {
    const i = parts.indexOf(m);
    if (i >= 0 && parts[i + 2]) return ['Homebrew', parts[i + 1], parts[i + 2]];
  }
  const i = parts.lastIndexOf('node_modules');
  if (i >= 0 && parts[i + 1]) {
    const pkg = parts.slice(i + 1, i + (parts[i + 1].startsWith('@') ? 3 : 2)).join('/');
    let version = '';
    try {
      version = JSON.parse(metadata(join(parts.slice(0, i + 1).join('/'), pkg, 'package.json'))).version || '';
    } catch {}
    return ['npm', pkg, version];
  }
  for (const m of ['uv', 'pipx']) {
    const i = parts.indexOf(m);
    if (i >= 0 && ['tools', 'venvs'].includes(parts[i + 1]) && parts[i + 2]) return [m, parts[i + 2], ''];
  }
  const parent = dirname(path);
  if (parent === join(process.env.CARGO_HOME || join(home, '.cargo'), 'bin')) return ['Cargo', '', ''];
  if (/^\/(usr|bin|sbin|System|Library\/Apple)\//.test(path) && !path.startsWith('/usr/local/')) return ['Hệ thống', '', ''];
  if (parent === join(home, 'Library/pnpm/bin')) return ['pnpm', '', ''];
  for (const root of ['/Applications', join(home, '.local/share')]) if (path.startsWith(root + '/')) return [root, '', ''];
  return [parent, '', ''];
}
function details(t: Pick<CliTools['tools'][number], 'path' | 'resolved_path' | 'name' | 'source' | 'package'>) {
  const path = t.resolved_path,
    parts = path.split('/');
  for (const root of new Set([dirname(dirname(path)), dirname(dirname(t.path))])) {
    for (const sect of ['1', '8', '6'])
      for (const suffix of ['', '.gz']) {
        const man = metadata(join(root, 'share/man/man' + sect, t.name + '.' + sect + suffix));
        const section = man.match(/^\.(?:SH|Sh)\s+"?NAME"?\s*\n([\s\S]*?)(?=^\.(?:SH|Sh|SS|Ss)\s|(?![\s\S]))/m)?.[1];
        if (!section) continue;
        const nd = section.match(/^\.Nd\s+(.+)/m)?.[1];
        let val = (
          nd ||
          section
            .split('\n')
            .filter((x) => x && !x.startsWith('.'))
            .join(' ')
        )
          .replace(/\\f(?:\[[^\]]*\]|\(..|.)/g, '')
          .replaceAll('\\-', '-')
          .replaceAll('\\&', '')
          .replaceAll('\\.', '.')
          .replaceAll('\\e', '\\');
        if (!nd) val = val.split(' - ').slice(1).join(' - ');
        if (val)
          return [
            val
              .replace(/^"+|"+$/g, '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 500),
            'man · ' + t.name + '(' + sect + ')',
          ];
      }
  }
  let desc = '';
  if (t.source === 'Homebrew' && parts.includes('Cellar'))
    desc =
      metadata(join(parts.slice(0, parts.indexOf('Cellar') + 3).join('/'), '.brew', t.package + '.rb'))
        .match(/^\s*desc\s+(["'])(.*?)\1\s*$/m)?.[2]
        ?.replaceAll('\\"', '"') || '';
  if (t.source === 'npm')
    try {
      const value = JSON.parse(metadata(join(parts.slice(0, parts.lastIndexOf('node_modules') + 1).join('/'), t.package, 'package.json'))).description;
      desc = typeof value === 'string' ? value : ''; // a package.json can hold anything: only text is a description
    } catch {}
  if (['uv', 'pipx'].includes(t.source)) {
    const lib = join(dirname(dirname(path)), 'lib');
    for (const p of ls(lib).filter((n) => n.startsWith('python')))
      for (const f of ls(join(lib, p, 'site-packages'))
        .filter((n) => n.endsWith('.dist-info'))
        .sort()) {
        const data = metadata(join(lib, p, 'site-packages', f, 'METADATA'));
        if (
          data
            .match(/^Name: (.*)$/m)?.[1]
            ?.toLowerCase()
            .replace(/[-_.]+/g, '-') === t.package.toLowerCase().replace(/[-_.]+/g, '-')
        )
          desc = data.match(/^Summary: (.*)$/m)?.[1] || '';
      }
  }
  return [desc.trim().replace(/\s+/g, ' ').slice(0, 500), desc ? t.source + ' · ' + t.package : ''];
}
/**
 * Inventory of the commands on a PATH (the login shell's plus this process's when none is given). `shell` is only
 * for tests: a path, or a function that finds it; either way it is resolved inside the guarded branch, so a failure to
 * find the login shell falls back to this process's PATH with a warning.
 */
export function discover(pathEnv?: string, shell?: string | (() => string)): CliTools {
  const warnings: string[] = [];
  if (pathEnv === undefined) {
    pathEnv = process.env.PATH || '';
    try {
      const out = execFileSync(
        (typeof shell === 'function' ? shell() : shell) ?? (userInfo().shell || '/bin/sh'),
        ['-ilc', 'printf "\\n__TEAM_DASHBOARD_PATH__%s\\n" "$PATH"'],
        { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      const path = out.match(/^__TEAM_DASHBOARD_PATH__(.*)$/m)?.[1];
      if (!path) throw Error();
      pathEnv = path + ':' + pathEnv;
    } catch {
      warnings.push('Không đọc được PATH của login shell; đang dùng PATH của dashboard.');
    }
  }
  const directories = Array.from(new Set(pathEnv.split(':').map((p) => resolve(p.replace(/^~(?=\/|$)/, home) || '.'))));
  const tools = new Map(),
    sources: Record<string, number> = Object.create(null);
  for (const directory of directories) {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push('Không đọc được thư mục: ' + directory);
      continue;
    }
    for (const name of entries)
      try {
        const path = join(directory, name);
        if (!statSync(path).isFile()) continue;
        accessSync(path, constants.X_OK);
        const resolved_path = realpathSync(path),
          [source, pkg, version] = install(resolved_path);
        if (source === 'Hệ thống') continue;
        const item = { path, resolved_path, source, package: pkg, version };
        if (tools.has(name)) tools.get(name).alternatives.push(item);
        else tools.set(name, { name, ...item, alternatives: [] });
      } catch {}
  }
  const rows = [...tools.values()].sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  for (const t of rows) {
    t.install_kind = '';
    if (t.source === 'Homebrew') {
      const parts = t.resolved_path.split('/'),
        cellar = parts.indexOf('Cellar');
      const receipt =
        cellar >= 0
          ? join(parts.slice(0, cellar + 3).join('/'), 'INSTALL_RECEIPT.json')
          : join(parts.slice(0, parts.indexOf('Caskroom') + 2).join('/'), '.metadata/INSTALL_RECEIPT.json');
      let r: { installed_on_request?: unknown; installed_as_dependency?: unknown } | undefined;
      try {
        r = JSON.parse(metadata(receipt));
      } catch {}
      t.install_kind =
        r?.installed_on_request === true ? 'app' : r?.installed_on_request === false || r?.installed_as_dependency === true ? 'dependency' : 'unknown';
    }
    [t.description, t.description_source] = details(t);
    sources[t.source] = (sources[t.source] || 0) + 1;
  }
  return {
    machine: hostname(),
    system: type(),
    generated_at: Date.now() / 1000,
    directories,
    warnings,
    sources,
    tools: rows,
  };
}
