import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import type { RepositoryMetrics } from './protocol.ts';

export const GIT_METRICS_VERSION = 2;
export const unavailable = (error: string | null): RepositoryMetrics => ({
  features: {},
  unattributed_fix_commits: [],
  error,
});
export const median = (ns: number[]) => {
  const a = ns.slice().sort((a, b) => a - b),
    i = Math.floor(a.length / 2);
  return a.length ? (a[i] + a[(a.length - 1) >> 1]) / 2 : null;
};
function git(repo: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 << 20,
  });
  if ((r.error as NodeJS.ErrnoException)?.code === 'ETIMEDOUT') throw new Error('git_timeout:' + args[0]);
  return r.status === 0 ? r.stdout.trim() : null;
}
function blamed(repo, sha, parent) {
  const names = git(repo, 'diff', '-w', '-M', '-C', '--name-status', '-z', parent, sha);
  if (names === null) return null;
  const fields = names.split('\0'),
    commits = new Set<string>();
  for (let i = 0; fields[i]; ) {
    const status = fields[i++],
      old = fields[i++],
      name = /^[RC]/.test(status) ? fields[i++] : old;
    if (status[0] === 'A') continue;
    const patch = git(repo, 'diff', '-w', '-M', '-C', '--no-ext-diff', '--no-color', '--unified=0', parent, sha, '--', old, name);
    if (patch === null) return null;
    const ranges: string[] = [];
    for (const m of patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
      const n = Number(m[2] ?? 1);
      if (!n) continue;
      ranges.push('-L', m[1] + ',' + (Number(m[1]) + n - 1));
    }
    if (ranges.length) {
      const blame = git(repo, 'blame', '-w', '-M', '-C', '--incremental', ...ranges, parent, '--', old);
      if (blame === null) return null;
      for (const h of blame.matchAll(/^([0-9a-f]{40,64}) \d+ \d+ \d+$/gm)) commits.add(h[1]);
    }
  }
  return commits;
}
export function analyzeDefects(repo: string, head: string): RepositoryMetrics {
  const log = git(repo, 'log', '--first-parent', '--reverse', '--format=%H%x09%ct%x09%P%x09%s', head);
  if (log === null) return unavailable('git_history_unavailable');
  const features = Object.create(null),
    landed = new Map(),
    owners = new Map();
  const graph = git(repo, 'rev-list', '--parents', head);
  if (graph === null) return unavailable('git_ancestry_unavailable');
  const parentsByCommit = new Map(
    graph.split('\n').map((line): [string, string[]] => {
      const [id, ...ancestors] = line.split(' ');
      return [id, ancestors];
    }),
  );
  let order = 0;
  for (const line of log.split('\n')) {
    const [sha, ts, parents, ...rest] = line.split('\t'),
      ps = parents.split(' ').filter(Boolean),
      subject = rest.join('\t');
    const branch = ps.length > 1 && (subject.match(/^Merge branch '([^']+)'/) || subject.match(/^Merge pull request #\d+ from [^/]+\/(.+)/))?.[1];
    // First-parent order assigns each reachable commit to its earliest landing.
    const pending = [sha];
    while (pending.length) {
      const h = pending.pop()!;
      if (landed.has(h)) continue;
      landed.set(h, [Number(ts), order]);
      if (branch) owners.set(h, branch);
      pending.push(...(parentsByCommit.get(h) || []));
    }
    if (branch) features[branch] = { merge_sha: sha, merged_at: Number(ts), order, fix_commits: [] };
    order++;
  }
  const candidates = git(repo, 'log', '--format=%H%x00%ct%x00%P%x00%s%x00%B%x1e', head);
  if (candidates === null) return unavailable('git_fixes_unavailable');
  const unattributed_fix_commits = [];
  for (const entry of candidates.split('\x1e')) {
    if (!entry.trim()) continue;
    const [sha, , parents, subject, body] = entry.replace(/^\n+/, '').split('\0');
    const trailers = Array.from(body.matchAll(/^Fixes-feature:\s*(\S+)\s*$/gim), (m) => m[1]);
    if (!/^fix(?:\([^)]*\))?!?(?::|\s|$)/i.test(subject) && !trailers.length) continue;
    const [at, order] = landed.get(sha),
      targets = new Set<string>(),
      source = trailers.length ? 'trailer' : 'szz';
    if (trailers.length)
      for (const trace of trailers) {
        const matches = Object.keys(features).filter((b) => basename(b) === trace);
        if (Object.hasOwn(features, trace)) targets.add(trace);
        else if (matches.length === 1) targets.add(matches[0]);
      }
    else if (parents) {
      const parent = parents.split(' ')[0];
      if (git(repo, 'diff', '-w', '--stat', parent, sha) === '') continue;
      const set = owners.size ? blamed(repo, sha, parent) : new Set<string>();
      if (!set) return unavailable('git_blame_unavailable');
      for (const h of set) if (owners.has(h)) targets.add(owners.get(h));
    }
    const fix = { sha, subject, date: new Date(at * 1000).toISOString().replace('.000Z', '+00:00'), source };
    for (const branch of targets) {
      const f = features[branch],
        days = Math.max(0, at - f.merged_at) / 86400;
      if (order > f.order && days <= 30) f.fix_commits.push({ ...fix, days_after_merge: days });
    }
    if (!targets.size) unattributed_fix_commits.push(fix);
  }
  for (const k of Object.keys(features)) {
    const f = features[k];
    delete f.order;
    const fixes = f.fix_commits;
    fixes.sort((a, b) => a.date.localeCompare(b.date) || a.sha.localeCompare(b.sha));
    Object.assign(f, {
      escaped_defects: fixes.length,
      median_days_to_surface: median(fixes.map((f) => f.days_after_merge)),
      source: fixes.length && fixes.every((f) => f.source === 'trailer') ? 'trailer' : 'szz',
    });
  }
  const result = { features, unattributed_fix_commits, error: null };
  return result;
}

if (!isMainThread && workerData?.job === 'git-defects') {
  const start = performance.now();
  let metrics: RepositoryMetrics;
  try {
    metrics = analyzeDefects(workerData.repo, workerData.head);
  } catch (error) {
    metrics = unavailable(error instanceof Error ? error.message : 'git_analysis_failed');
  }
  parentPort!.postMessage({ metrics, elapsed_ms: Math.round(performance.now() - start) });
}
