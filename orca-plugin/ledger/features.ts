import { cachedRepository, type GitMetrics } from './git-metrics.ts';
import { median } from './git-defects.ts';
export { median };
import { basename, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { home, checkout, dir, read, ls } from './metadata.ts';
import type { DashboardData, DashboardRun, FeatureRun, UsageRow } from './protocol.ts';
type Segment = UsageRow['feature_segments'][number];
/** featureData always knows both activity bounds of a feature. */
type Feature = FeatureRun & { first_activity: number; last_activity: number };
export function featureDir(repo: string | null | undefined, branch: string | null | undefined) {
  const name = basename(branch || '');
  return repo && !['', '.', '..'].includes(name) ? join(repo, '.team', name) : null;
}
export function rounds(folder: string | null) {
  if (!folder || !dir(join(folder, 'reports'))) return null;
  return new Set(
    ls(join(folder, 'reports'))
      .filter((n) => /.*-builder-r.*\.md$/.test(n))
      .map((n) => n.match(/-builder-r(\d+)/)?.[1])
      .filter(Boolean)
      .map(Number),
  ).size;
}
export function loaded(s: Pick<UsageRow, 'hooks' | 'skills'>): Record<string, number> {
  return Object.fromEntries([
    ...Object.keys(s.hooks || {}).map((k): [string, number] => [k, 1]),
    ...Object.entries(s.skills || {}).map(([k, v]): [string, number] => [k, v[0]]),
  ]);
}
export function featureData(parts: Segment[], runs: DashboardRun[], available: boolean, db: DatabaseSync, service?: GitMetrics): DashboardData['features'] {
  const groups = new Map<string, Segment[]>(),
    repos = new Map<string, ReturnType<typeof cachedRepository>>(),
    repositories: DashboardData['features']['repositories'] = Object.create(null),
    assigned = new Set<Segment>(),
    features: Feature[] = [];
  for (const s of parts) {
    const branch = (s.branch || '').trim();
    if (['', 'main', 'master', 'HEAD'].includes(branch) || s.repo === '?') continue;
    const key = JSON.stringify([s.repo, branch]);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    group.push(s);
  }
  for (const [key, rows] of groups) {
    const [repo, branch]: [string, string] = JSON.parse(key);
    // checkout treats '' like a missing cwd; `?? null` only turns "no row had a checkout" into null, which both lookups read the same way.
    let root = rows.map((s) => checkout(s.cwd ?? '')).find(Boolean) ?? null,
      checkoutSource = root ? 'git' : 'unavailable';
    if (!root && dir(join(home, 'orca/projects', repo))) {
      root = join(home, 'orca/projects', repo);
      checkoutSource = 'orca_project';
    }
    let state = repos.get(repo);
    if (!state) {
      state = service ? service.lookup(root) : cachedRepository(db, root);
      repos.set(repo, state);
      repositories[repo] = state.metrics;
    }
    const { refs, mergedBranches } = state;
    const ids = [...new Set(rows.map((s) => s.run_id).filter((id): id is string => Boolean(id)))].sort(),
      linked = runs.filter((r) => ids.includes(r.id));
    const skills: Record<string, number> = Object.create(null);
    for (const s of rows) for (const [k, v] of Object.entries(loaded(s))) skills[k] = (skills[k] || 0) + v;
    const folder = featureDir(root, branch),
      count = rounds(folder),
      source = count !== null ? 'reports' : skills['code-review'] || !linked.length ? 'code-review' : 'measurement';
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
      tokenRows = parts.filter((s) => members.has(s) || (s.run_id !== null && ids.includes(s.run_id)));
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
    const delivered = metrics ? true : refs.has(branch) && mergedBranches ? mergedBranches.has(branch) : null;
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
      delivered,
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
      r.delivered = linked.every((f) => f.delivered === true) ? true : linked.some((f) => f.delivered === false) ? false : null;
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
  const sum = (xs: Segment[]) => xs.reduce((n, s) => n + s.total, 0),
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
