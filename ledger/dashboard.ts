import type { DashboardData } from './protocol.ts';
import { basename, dirname, relative, normalize } from 'node:path';
import type { Store } from './store.ts';
import { PARSER_VERSION } from './derived.ts';
import { featureData, featureDir, median, rounds } from './features.ts';
import { home, checkout, repoOf, roleConfig } from './metadata.ts';
import { aliases, tsOf } from './session.ts';
import { runData } from './run-data.ts';
export const date = (s: number) => {
  const d = new Date(s * 1000);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};
const dict = () => Object.create(null);
const inc = (obj, k, n) => (obj[k] = (obj[k] || 0) + n);
function assign(task, s) {
  if (task?.role) return [aliases[task.role] || task.role, 'orca'];
  if (s.role_line) return [aliases[s.role_line] || s.role_line, 'role-line'];
  if (s.dispatcher) return ['orchestrator', 'dispatch'];
  if ((s.title || '').toLowerCase().includes('orchestrator')) return ['orchestrator', 'title'];
  const names = s.skills.map((e) => e[0]);
  if (names.includes('orchestrator')) return ['orchestrator', 'skill'];
  const team = names.find((n) => n.startsWith('team-'))?.slice(5);
  if (team) return [aliases[team] || team, 'skill'];
  const cmd = names.find((n) => ['solution-architect', 'researcher'].includes(n));
  if (!task && cmd) return [cmd, 'skill'];
  if (!task && s.discussion) return [s.discussion, 'discussion'];
  return task ? ['worker', 'orca'] : ['chat trực tiếp', null];
}
function rtk(db, start): DashboardData['rtk'] {
  if (!db.prepare("SELECT 1 FROM sources WHERE kind='rtk' LIMIT 1").get()) return { available: false };
  const query = (columns, group = '') =>
    db
      .prepare('SELECT ' + columns + ' FROM dashboard_commands WHERE version=? AND timestamp>=? ' + group)
      .all(PARSER_VERSION, start);
  const totals = 'count(*) n,coalesce(sum(saved_tokens),0) saved,coalesce(sum(input_tokens),0) input';
  const percent = (r) => Math.round((r.saved / (r.input || 1)) * 1000) / 10;
  const [r] = query(totals + ',coalesce(sum(output_tokens),0) output,coalesce(sum(exec_time_ms),0) time_ms');
  const pct = (row) => ({ ...row, pct: percent(row) });
  return {
    available: true,
    summary: {
      commands: r.n,
      input: r.input,
      output: r.output,
      saved: r.saved,
      pct: percent(r),
      time_ms: r.time_ms,
    },
    by_cmd: query(
      'rtk_cmd cmd,' + totals + ',coalesce(sum(output_tokens),0) output',
      'GROUP BY rtk_cmd ORDER BY saved DESC LIMIT 15',
    ).map(pct),
    daily: query(
      'substr(timestamp,1,10) date,' + totals + ',coalesce(sum(output_tokens),0) output',
      'GROUP BY date ORDER BY date',
    ).map(pct),
    by_project: query(
      'project_path project,' + totals,
      "AND project_path!='' GROUP BY project_path ORDER BY saved DESC LIMIT 15",
    ).map((r) => ({ project: relative(home, r.project) || '.', n: r.n, saved: r.saved, pct: percent(r) })),
  };
}
export function build({ db }: Store, days: number, now = Date.now() / 1000): DashboardData {
  const begin = performance.now(),
    midnight = new Date(now * 1000);
  midnight.setHours(0, 0, 0, 0);
  midnight.setDate(midnight.getDate() - days + 1);
  const start = midnight.getTime() / 1000;
  const parsed = db
    .prepare('SELECT data FROM dashboard_sessions WHERE version=? ORDER BY source,generation,sid')
    .all(PARSER_VERSION)
    .map((r) => JSON.parse(String(r.data)));
  parsed.sort(
    (a, b) =>
      a.agent.localeCompare(b.agent) ||
      Number(!!b.subagent) - Number(!!a.subagent) ||
      (a.start || 0) - (b.start || 0),
  );
  const fetched = db
    .prepare(
      "SELECT max(recorded_at) stamp FROM ingest_log WHERE source IN (SELECT id FROM sources WHERE kind='orca')",
    )
    .get();
  const orca = runData(
    db.prepare('SELECT path,data FROM dashboard_orca WHERE version=? ORDER BY source').all(PARSER_VERSION),
    now,
    tsOf(String(fetched?.stamp || '')),
  );
  const runs = new Map(orca.runs.map((r) => [r.id, r])),
    seen = new Set(),
    sessionSets = new Map(),
    orchActivity = new Map(),
    tasks = orca.tasks;
  for (const r of runs.values()) {
    Object.assign(r, {
      tokens: dict(),
      window_tokens: dict(),
      orchestrator_by_agent: dict(),
      fix_tokens_by_cause: dict(),
    });
    sessionSets.set(r.id, new Set());
    orchActivity.set(r.id, new Map());
    for (const t of r.tasks) t.tokens = dict();
  }
  const sessions = [],
    parts = [],
    attribution = { total: 0, assigned: 0, unassigned: 0, inferred: 0, aggregate: 0, undated: 0 };
  const repos = new Map(),
    repo = (cwd) => {
      if (!repos.has(cwd)) repos.set(cwd, repoOf(cwd));
      return repos.get(cwd);
    },
    roots = new Map();
  for (const s of parsed) {
    const [repository, wt] = repo(s.cwd),
      root = checkout(s.cwd);
    if (root) roots.set(repository, root);
    const ds = s.cwd
      ? orca.dispatches.filter(
          (d) =>
            d.wt &&
            d.from &&
            d.agent === s.agent &&
            tasks.has(d.task) &&
            normalize(d.wt) === normalize(s.cwd),
        )
      : [];
    const active = (events, ts) => events?.filter((e) => (e[1] || s.start || 0) <= ts).at(-1)?.[0];
    const branchAt = (ts) =>
      s.branch_segments
        ? s.branch_segments.findLast((x) => x.at === null || x.at <= ts) || { cwd: s.cwd, branch: null }
        : { cwd: s.cwd, branch: s.branch };
    const rows = new Map(),
      branches = new Map();
    for (const call of s.calls.sort((a, b) => (a[0] || 0) - (b[0] || 0))) {
      const [
        ts,
        model,
        eff,
        fin,
        cr,
        cw,
        out,
        reason,
        mid,
        prem = 0,
        ctx = { cwd: s.cwd, branch: s.branch },
      ] = call;
      if (mid) {
        const key = JSON.stringify([s.agent, mid]);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const tot = fin + cr + cw + out;
      if (!ts) {
        attribution.undated += tot;
        continue;
      }
      if (ts > now) continue;
      let t,
        rid = null,
        source = 'unassigned';
      if (s.aggregate) {
        const tids = new Set(s.tasks.map((e) => e[0])),
          rids = new Set(s.runs.map((e) => e[0]));
        if (tids.size === 1 && !rids.size) t = tasks.get([...tids][0]);
        else if (rids.size === 1 && !tids.size) rid = [...rids][0];
      } else if (s.tasks.length) t = tasks.get(active(s.tasks, ts));
      else if (s.runs?.length) rid = active(s.runs, ts);
      else if (!s.dispatcher) {
        const ids = new Set(ds.filter((d) => d.from <= ts && ts <= (d.to || now)).map((d) => d.task));
        if (ids.size === 1) {
          t = tasks.get([...ids][0]);
          source = 'dispatch_window';
        }
      }
      rid = t?.run || rid;
      const r = runs.get(rid);
      if (!r) {
        rid = null;
        t = null;
        source = 'unassigned';
      } else if (source === 'unassigned') source = t ? 'task_id' : 'run_id';
      const [role, role_src] = r && !t ? ['orchestrator', 'dispatch'] : assign(t, s);
      if (r) {
        inc(r.tokens, s.agent, tot);
        sessionSets.get(rid).add(JSON.stringify([s.agent, s.id]));
        if (role === 'orchestrator') {
          inc(r.orchestrator_by_agent, s.agent, tot);
          const map = orchActivity.get(rid);
          if (!map.has(s.agent)) map.set(s.agent, { agent: s.agent, start: ts, end: ts, tokens: 0 });
          const a = map.get(s.agent);
          a.start = Math.min(a.start, ts);
          a.end = Math.max(a.end, ts);
          a.tokens += tot;
        }
        if (t) inc(t.tokens, s.agent, tot);
      }
      if (ts < start) continue;
      attribution.total += tot;
      attribution[r ? 'assigned' : 'unassigned'] += tot;
      if (s.aggregate) attribution.aggregate += tot;
      if (source === 'dispatch_window') attribution.inferred += tot;
      if (r) inc(r.window_tokens, s.agent, tot);
      const matches =
        t && !s.aggregate
          ? t.routing.filter(
              (a) =>
                a.dispatch &&
                a.agent === s.agent &&
                ds.some(
                  (d) => d.task === t.id && d.id === a.dispatch && d.from <= ts && ts <= (d.to || Infinity),
                ),
            )
          : [];
      const routing = matches.length === 1 ? matches[0] : null,
        key = JSON.stringify([rid, t?.id, role, source, routing?.dispatch]);
      if (!rows.has(key))
        rows.set(key, {
          id: s.id,
          session_id: s.id,
          agent: s.agent,
          repo: repository,
          worktree: wt,
          branch: s.branch,
          cwd: s.cwd,
          role,
          role_src,
          originator: (s.originator || '?') + (s.subagent ? ' (subagent)' : ''),
          start: s.start,
          end: s.end,
          preview: s.preview,
          title: s.title || '',
          task_id: t?.id ?? null,
          task_title: t?.title ?? null,
          run_id: rid,
          attribution: source,
          aggregate: !!s.aggregate,
          routing,
          calls: 0,
          fin: 0,
          cr: 0,
          cw: 0,
          out: 0,
          reason: 0,
          prem: 0,
          snapshot: s.snapshot ?? null,
          ctx: [],
          days: dict(),
          hours: dict(),
          t0: ts,
          mix: dict(),
          models: dict(),
          skills: dict(),
          search: dict(),
          feature_segments: [],
        });
      const row = rows.get(key),
        branch_source = ctx.branch_source || 'session',
        bk = JSON.stringify([key, ctx.cwd, ctx.branch, branch_source]);
      if (!branches.has(bk)) {
        const p = {
          id: s.id,
          session_id: s.id,
          agent: s.agent,
          cwd: ctx.cwd,
          repo: repo(ctx.cwd)[0],
          branch: ctx.branch,
          run_id: rid,
          role,
          start: call.length > 10 ? ts : s.start,
          end: call.length > 10 ? ts : s.end,
          total: 0,
          skills: dict(),
          hooks: dict(),
          branch_source,
        };
        branches.set(bk, p);
        row.feature_segments.push(p);
        parts.push(p);
      }
      const p = branches.get(bk);
      p.total += tot;
      p.start = Math.min(p.start || ts, ts);
      p.end = Math.max(p.end || ts, ts);
      row.calls++;
      for (const [k, v] of Object.entries({ fin, cr, cw, out, reason, prem })) row[k] += v;
      if (!s.aggregate) row.ctx.push(fin + cr + cw);
      const day = date(ts),
        hour = day + ' ' + String(new Date(ts * 1000).getHours()).padStart(2, '0');
      for (const values of [(row.days[day] ??= [0, 0, 0, 0, 0]), (row.hours[hour] ??= [0, 0, 0, 0, 0])])
        [fin, cr, cw, out, prem].forEach((n, i) => (values[i] += n));
      inc(row.models, model, tot);
      inc(row.mix, model + '|' + (eff || '?'), tot);
    }
    const values = [...rows.values()],
      target = (ts) => {
        const tid = active(s.tasks, ts),
          rid = active(s.runs, ts);
        return values.find((r) => (tid ? r.task_id === tid : rid && r.run_id === rid)) || values[0];
      };
    const same = (p, c) =>
      p.cwd === c.cwd && p.branch === c.branch && p.branch_source === (c.branch_source || 'session');
    for (const [name, ts] of s.skills) {
      const r = target(ts);
      if (!ts || ts < start || !r) continue;
      const p = r.feature_segments.find((p) => same(p, branchAt(ts)));
      for (const group of [r, p].filter(Boolean)) {
        const value = (group.skills[name] ??= [0, 0]);
        value[0]++;
        value[1] = Math.max(value[1], ts);
      }
    }
    for (const [k, at] of s.search || []) {
      const ts = at || s.start,
        r = target(ts);
      if (ts && ts >= start && r) inc(r.search, k, 1);
    }
    for (const [i, r] of values.entries()) {
      if (values.length > 1) r.id += ':part:' + i;
      const hooks = Object.entries(s.hooks || {}).filter(([, h]) => h[0] && h[0] >= start);
      r.hooks = Object.fromEntries(hooks.map(([n, h]) => [n, h[1]]));
      for (const [j, p] of r.feature_segments.entries()) {
        p.id = r.id + ':branch:' + j;
        p.hooks = Object.fromEntries(
          hooks.filter(([, h]) => same(p, branchAt(h[0]))).map(([n, h]) => [n, h[1]]),
        );
      }
      const largest = (obj) => Object.keys(obj).reduce((a, b) => (obj[a] >= obj[b] ? a : b));
      r.model = largest(r.models);
      r.effort = largest(
        Object.fromEntries(Object.entries(r.mix).filter(([k]) => k.startsWith(r.model + '|'))),
      ).split('|')[1];
      r.ctx_med = r.ctx.length ? Math.trunc(median(r.ctx)) : null;
      r.ctx_max = r.ctx.length ? r.ctx.reduce((a, b) => Math.max(a, b)) : null;
      if (s.aggregate) r.calls = null;
      r.total = r.fin + r.cr + r.cw + r.out;
      sessions.push(r);
    }
  }
  for (const r of runs.values()) {
    const sum = (o) => Object.values(o).reduce<number>((a, b) => a + Number(b), 0);
    r.orchestrator_activity = [...orchActivity.get(r.id).values()];
    r.orchestrator_tokens = sum(r.orchestrator_by_agent);
    r.worker_tokens = sum(r.tokens) - r.orchestrator_tokens;
    r.tokens.sessions = sessionSets.get(r.id).size;
    for (const t of r.tasks) {
      if (t.measurement.kind === 'fix') {
        const cause = t.measurement.cause || 'unknown',
          totals = (r.fix_tokens_by_cause[cause] ??= dict());
        for (const [agent, n] of Object.entries(t.tokens)) inc(totals, agent, n);
      }
      const count = rounds(featureDir(roots.get(t.repo), t.worktree));
      if (count !== null && count >= (r.fix_rounds?.count ?? -1)) r.fix_rounds = { count, source: 'reports' };
    }
  }
  sessions.sort((a, b) => (b.start || 0) - (a.start || 0));
  const features = featureData(
    sessions.flatMap((s) => s.feature_segments),
    orca.runs,
    orca.available,
    db,
  );
  return {
    generated_at: now,
    days,
    range_start: start,
    dates: Array.from({ length: days }, (_, i) => date(start + 86400 * i + 3600)),
    sessions,
    attribution,
    features,
    copilot_dirs: new Set(
      db
        .prepare(
          `SELECT path, EXISTS(SELECT 1 FROM versions WHERE source=s.id AND item='directory') AS directory
      FROM sources s WHERE kind='copilot'`,
        )
        .all()
        .map((r) => (r.directory ? String(r.path) : dirname(String(r.path))))
        .filter((path) => !basename(path).startsWith('.')),
    ).size,
    orca: { available: orca.available, error: orca.error, fetched_at: orca.fetched_at, runs: orca.runs },
    ...roleConfig(),
    rtk: rtk(db, date(start)),
    build_ms: Math.trunc(performance.now() - begin),
  };
}
