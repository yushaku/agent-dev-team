import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { home, checkout, dir, read, ls } from './metadata.ts';
const GIT_METRICS_VERSION = 2;
export const median = (ns: number[]) => {
  const a = ns.slice().sort((a, b) => a - b),
    i = Math.floor(a.length / 2);
  return a.length ? (a[i] + a[(a.length - 1) >> 1]) / 2 : null;
};
export function featureDir(repo, branch) {
  const name = basename(branch || '');
  return repo && !['', '.', '..'].includes(name) ? join(repo, '.team', name) : null;
}
export function rounds(folder) {
  if (!folder || !dir(join(folder, 'reports'))) return null;
  return new Set(
    ls(join(folder, 'reports'))
      .filter((n) => /.*-builder-r.*\.md$/.test(n))
      .map((n) => n.match(/-builder-r(\d+)/)?.[1])
      .filter(Boolean)
      .map(Number),
  ).size;
}
function git(repo, ...args: string[]) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 2000, maxBuffer: 32 << 20 });
  return r.status === 0 ? r.stdout.trim() : null;
}
function blamed(repo, sha, parent) {
  const names = git(repo, 'diff', '-w', '-M', '-C', '--name-status', '-z', parent, sha);
  if (names === null) return null;
  const fields = names.split('\0'),
    commits = new Set<string>();
  for (let i = 0; fields[i];) {
    const status = fields[i++],
      old = fields[i++],
      name = /^[RC]/.test(status) ? fields[i++] : old;
    if (status[0] === 'A') continue;
    const patch = git(
      repo,
      'diff',
      '-w',
      '-M',
      '-C',
      '--no-ext-diff',
      '--no-color',
      '--unified=0',
      parent,
      sha,
      '--',
      old,
      name,
    );
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
const cache = new Map();
function defects(repo, head, db) {
  const error = (msg) => ({ features: {}, unattributed_fix_commits: [], error: msg });
  if (!head) return error('default_branch_unavailable');
  const key = JSON.stringify([repo, head]);
  if (cache.has(key)) return structuredClone(cache.get(key));
  const cached = db
    ?.prepare('SELECT value FROM dashboard_git WHERE repo=? AND head=? AND version=?')
    .get(repo, head, GIT_METRICS_VERSION);
  if (cached) {
    const parsed = JSON.parse(String(cached.value));
    cache.set(key, parsed);
    return structuredClone(parsed);
  }
  const log = git(repo, 'log', '--first-parent', '--reverse', '--format=%H%x09%ct%x09%P%x09%s', head);
  if (log === null) return error('git_history_unavailable');
  const features = Object.create(null),
    landed = new Map(),
    owners = new Map();
  const graph = git(repo, 'rev-list', '--parents', head);
  if (graph === null) return error('git_ancestry_unavailable');
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
    const branch =
      ps.length > 1 &&
      (subject.match(/^Merge branch '([^']+)'/) ||
        subject.match(/^Merge pull request #\d+ from [^/]+\/(.+)/))?.[1];
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
  if (candidates === null) return error('git_fixes_unavailable');
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
      if (!set) return error('git_blame_unavailable');
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
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  db?.prepare('INSERT OR REPLACE INTO dashboard_git VALUES(?,?,?,?)').run(
    repo,
    head,
    GIT_METRICS_VERSION,
    JSON.stringify(result),
  );
  return structuredClone(result);
}
export function loaded(s) {
  return Object.fromEntries([
    ...Object.keys(s.hooks || {}).map((k) => [k, 1]),
    ...Object.entries(s.skills || {}).map(([k, v]) => [k, v[0]]),
  ]);
}
export function featureData(parts, runs, available, db) {
  const groups = new Map(),
    repos = new Map(),
    repositories = Object.create(null),
    assigned = new Set(),
    features = [];
  for (const s of parts) {
    const branch = (s.branch || '').trim();
    if (['', 'main', 'master', 'HEAD'].includes(branch) || s.repo === '?') continue;
    const key = JSON.stringify([s.repo, branch]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  for (const [key, rows] of groups) {
    const [repo, branch] = JSON.parse(key);
    let root = rows.map((s) => checkout(s.cwd)).find(Boolean),
      checkoutSource = root ? 'git' : 'unavailable';
    if (!root && dir(join(home, 'orca/projects', repo))) {
      root = join(home, 'orca/projects', repo);
      checkoutSource = 'orca_project';
    }
    if (!repos.has(repo)) {
      const refs =
        (root && git(root, 'for-each-ref', '--format=%(refname:lstrip=2) %(objectname)', 'refs/heads/')) ||
        '';
      const heads = new Map(
        refs.split('\n').map((line): [string, string] => {
          const [key, val] = line.split(' ');
          return [key, val];
        }),
      );
      const def =
        (root && git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD'))?.replace(
          /^refs\/remotes\/origin\//,
          '',
        ) || ['main', 'master'].find((n) => heads.has(n));
      repos.set(repo, { heads, head: heads.get(def) });
      repositories[repo] = defects(root, heads.get(def), db);
    }
    const { heads, head } = repos.get(repo);
    const ids = [...new Set(rows.map((s) => s.run_id).filter(Boolean))].sort(),
      linked = runs.filter((r) => ids.includes(r.id));
    const skills = Object.create(null);
    for (const s of rows) for (const [k, v] of Object.entries(loaded(s))) skills[k] = (skills[k] || 0) + v;
    const folder = featureDir(root, branch),
      count = rounds(folder),
      source =
        count !== null ? 'reports' : skills['code-review'] || !linked.length ? 'code-review' : 'measurement';
    const fix_rounds = {
      source,
      count:
        count ??
        (skills['code-review']
          ? skills['code-review'] - 1
          : new Set(
              linked
                .flatMap((r) => r.tasks)
                .filter((t) => ['fix', 're-review'].includes(t.measurement.kind) && t.measurement.round)
                .map((t) => t.measurement.round),
            ).size),
    };
    const first = Math.min(...rows.map((s) => s.start).filter(Boolean)),
      last = Math.max(...rows.map((s) => s.end || s.start).filter(Boolean));
    const members = new Set(rows),
      tokenRows = parts.filter((s) => members.has(s) || ids.includes(s.run_id));
    let total = 0,
      orch = 0;
    for (const s of tokenRows) {
      assigned.add(s);
      total += s.total;
      if (s.run_id && s.role === 'orchestrator') orch += s.total;
    }
    const decisions = folder ? read(join(folder, 'decisions.md')) : '',
      n = Array.from(decisions.matchAll(/^- Gate 2 finding:/gm)).length;
    const findings = n || (/^- Gate 2: no findings\s*$/m.test(decisions) ? 0 : null);
    const metrics = repositories[repo].features[branch];
    const merged = metrics
      ? true
      : heads.get(branch) && head
        ? spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', heads.get(branch), head], {
            timeout: 2000,
          }).status
        : null;
    features.push({
      id: key,
      repo,
      branch,
      variant: available ? (ids.length ? 'orca' : 'direct') : null,
      orca_loading: !available,
      run_ids: ids,
      first_activity: first,
      last_activity: last,
      lead_seconds: last - first,
      tokens: total,
      orchestrator_tokens: ids.length ? orch : null,
      worker_tokens: ids.length ? total - orch : null,
      session_count: new Set(rows.map((s) => JSON.stringify([s.agent, s.session_id]))).size,
      agents: [...new Set(rows.map((s) => s.agent))].sort(),
      loaded_skills: skills,
      fix_rounds,
      gate2_findings: findings,
      delivered: merged === true || merged === 0 ? true : merged === 1 ? false : null,
      ...(metrics || { escaped_defects: null, fix_commits: [], median_days_to_surface: null, source: null }),
      sources: {
        checkout: checkoutSource,
        tokens: ids.length ? 'branch_segments_and_linked_run_ids' : 'session_usage',
        activity: 'branch_activity_bounds',
        branch: [...new Set(rows.map((s) => s.branch_source))].sort(),
        loaded_skills: 'session_skill_loads_and_hooks',
        gate2_convention_start: 1795392000,
        gate2_findings: findings === null ? 'unavailable' : 'decisions',
        delivered: 'local_git_ancestry',
      },
      heuristics: [
        'repo_basename_identity',
        'branch_last_segment',
        ...(checkoutSource === 'orca_project' ? ['orca_project_path'] : []),
        ...(source === 'code-review' ? ['code_review_loads_minus_one'] : []),
      ],
    });
  }
  for (const r of runs) {
    const linked = features.filter((f) => f.run_ids.includes(r.id));
    if (!linked.length) continue;
    r.feature_runs = linked.map(({ repo, branch }) => ({ repo, branch }));
    const metrics = linked.map((f) => f.fix_rounds).concat(r.fix_rounds ? [r.fix_rounds] : []),
      reports = metrics.filter((m) => m.source === 'reports');
    r.fix_rounds = (reports.length ? reports : metrics).sort((a, b) => b.count - a.count)[0];
    if (r.stage === 'unknown') {
      r.delivered = linked.every((f) => f.delivered === true)
        ? true
        : linked.some((f) => f.delivered === false)
          ? false
          : null;
      if (r.delivered) r.stage = 'merged';
    }
  }
  const comparison = ['direct', 'orca'].map((variant) => {
    const rows = features.filter((f) => f.variant === variant),
      findings = rows.map((f) => f.gate2_findings).filter((x) => x !== null);
    return {
      variant,
      count: rows.length,
      median_tokens: median(rows.map((f) => f.tokens)),
      median_fix_rounds: median(rows.map((f) => f.fix_rounds.count)),
      gate2_findings: findings.length ? findings.reduce((a, b) => a + b, 0) : null,
      gate2_known: findings.length,
    };
  });
  const sum = (xs) => xs.reduce((n, s) => n + s.total, 0),
    total = sum(parts),
    included = sum([...assigned]);
  return {
    repositories,
    orca_loading: !available,
    runs: features.sort((a, b) => b.last_activity - a.last_activity),
    comparison,
    attribution: { total, assigned: included, unassigned: total - included },
  };
}
