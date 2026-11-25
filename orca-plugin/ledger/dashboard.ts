import type { GitMetrics } from './git-metrics.ts';
import type { DashboardData, DashboardRun, RunTask, UsageRow } from './protocol.ts';
import { relative, normalize } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Store } from './store.ts';
import { PARSER_VERSION } from './derived.ts';
import { featureData, featureDir, median, rounds } from './features.ts';
import { home, checkout, repoOf, roleConfig } from './metadata.ts';
import { aliases, tsOf, type Session } from './session.ts';
import { readAgents } from './agents.ts';
import { readSources } from './sources.ts';
import { runData } from './run-data.ts';
import { sessionAssignment } from './assignment.ts';
type Segment = UsageRow['feature_segments'][number];
/** A usage row while build() fills it; the fields left out are set once its calls are counted. */
type Row = Omit<UsageRow, 'hooks' | 'model' | 'effort' | 'ctx_med' | 'ctx_max' | 'total' | 'calls'> & { calls: number };
type Activity = DashboardRun['orchestrator_activity'][number];
type Totals = { n: number; saved: number; input: number };
export const date = (s: number) => {
  const d = new Date(s * 1000);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const dict = <T = number>(): Record<string, T> => Object.create(null);
const inc = (obj: Record<string, number>, k: string, n: number) => (obj[k] = (obj[k] || 0) + n);
function assign(task: RunTask | null | undefined, s: Session, assignment: [string, string] | null): [string, string | null] {
  if (task?.role) return [aliases[task.role] || task.role, 'orca'];
  if (s.role_line) return [aliases[s.role_line] || s.role_line, 'role-line'];
  if (assignment) return assignment;
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
function rtk(db: DatabaseSync, start: string): DashboardData['rtk'] {
  if (!db.prepare("SELECT 1 FROM sources WHERE kind='rtk' LIMIT 1").get()) return { available: false };
  // T names the columns the SELECT returns; aggregates over integer columns come back as numbers.
  const query = <T extends Totals>(columns: string, group = '') =>
    db.prepare('SELECT ' + columns + ' FROM dashboard_commands WHERE version=? AND timestamp>=? ' + group).all(PARSER_VERSION, start) as T[];
  const totals = 'count(*) n,coalesce(sum(saved_tokens),0) saved,coalesce(sum(input_tokens),0) input';
  const percent = (r: Totals) => Math.round((r.saved / (r.input || 1)) * 1000) / 10;
  const [r] = query<Totals & { output: number; time_ms: number }>(totals + ',coalesce(sum(output_tokens),0) output,coalesce(sum(exec_time_ms),0) time_ms');
  const pct = <T extends Totals>(row: T) => ({ ...row, pct: percent(row) });
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
    by_cmd: query<Totals & { cmd: string; output: number }>(
      'rtk_cmd cmd,' + totals + ',coalesce(sum(output_tokens),0) output',
      'GROUP BY rtk_cmd ORDER BY saved DESC LIMIT 15',
    ).map(pct),
    daily: query<Totals & { date: string; output: number }>(
      'substr(timestamp,1,10) date,' + totals + ',coalesce(sum(output_tokens),0) output',
      'GROUP BY date ORDER BY date',
    ).map(pct),
    by_project: query<Totals & { project: string }>(
      'project_path project,' + totals,
      "AND project_path!='' GROUP BY project_path ORDER BY saved DESC LIMIT 15",
    ).map((r) => ({
      project: relative(home, r.project) || '.',
      n: r.n,
      saved: r.saved,
      pct: percent(r),
    })),
  };
}
export function build({ db }: Store, days: number, now = Date.now() / 1000, gitMetrics?: GitMetrics): DashboardData {
  const begin = performance.now(),
    midnight = new Date(now * 1000);
  midnight.setHours(0, 0, 0, 0);
  midnight.setDate(midnight.getDate() - days + 1);
  const start = midnight.getTime() / 1000;
  const parsed = db
    .prepare('SELECT data FROM dashboard_sessions WHERE version=? ORDER BY source,generation,sid')
    .all(PARSER_VERSION)
    .map((r): Session => JSON.parse(String(r.data)));
  parsed.sort((a, b) => a.agent.localeCompare(b.agent) || Number(!!b.subagent) - Number(!!a.subagent) || (a.start || 0) - (b.start || 0));
  const assignments = new Map(parsed.map((s) => [s, sessionAssignment(s)]));
  const fetched = db.prepare("SELECT max(recorded_at) stamp FROM ingest_log WHERE source IN (SELECT id FROM sources WHERE kind='orca')").get();
  const orca = runData(
    db.prepare('SELECT path,data FROM dashboard_orca WHERE version=? ORDER BY source').all(PARSER_VERSION),
    now,
    tsOf(String(fetched?.stamp || '')),
  );
  // runData leaves out the token fields; the loops below add them to these same objects before anything reads them.
  const orcaRuns = orca.runs as DashboardRun[],
    tasks = orca.tasks as Map<string | undefined, RunTask>;
  const runs = new Map<string | null | undefined, DashboardRun>(orcaRuns.map((r) => [r.id, r])),
    seen = new Set<string>(),
    sessionSets = new Map<string, Set<string>>(),
    orchActivity = new Map<string, Map<string, Activity>>();
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
  const sessions: UsageRow[] = [],
    parts: Segment[] = [],
    attribution = { total: 0, assigned: 0, unassigned: 0, inferred: 0, aggregate: 0, undated: 0 };
  // repoOf and checkout treat '' like a missing cwd.
  const repos = new Map<string | null, string[]>(),
    repo = (cwd: string | null) => {
      let found = repos.get(cwd);
      if (!found) repos.set(cwd, (found = repoOf(cwd ?? '')));
      return found;
    },
    roots = new Map<string | null, string>();
  for (const s of parsed) {
    const [repository, wt] = repo(s.cwd),
      root = checkout(s.cwd ?? '');
    if (root) roots.set(repository, root);
    const cwd = s.cwd;
    const ds = cwd ? orca.dispatches.filter((d) => d.wt && d.from && d.agent === s.agent && tasks.has(d.task) && normalize(d.wt) === normalize(cwd)) : [];
    const active = (events: Session['tasks'] | undefined, ts: number) => events?.filter((e) => (e[1] || s.start || 0) <= ts).at(-1)?.[0];
    const branchAt = (ts: number) =>
      s.branch_segments ? s.branch_segments.findLast((x) => x.at === null || x.at <= ts) || { cwd: s.cwd, branch: null } : { cwd: s.cwd, branch: s.branch };
    const rows = new Map<string, Row>(),
      branches = new Map<string, Segment>();
    for (const call of s.calls.sort((a, b) => (a[0] || 0) - (b[0] || 0))) {
      const [ts, model, eff, fin, cr, cw, out, reason, mid, , ctx = { cwd: s.cwd, branch: s.branch }] = call;
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
      let t: RunTask | null | undefined,
        rid: string | null | undefined = null,
        source = 'unassigned';
      if (s.aggregate) {
        // Aggregate (Hermes) sessions always carry a runs list.
        const tids = new Set(s.tasks.map((e) => e[0])),
          rids = new Set((s.runs || []).map((e) => e[0]));
        if (tids.size === 1 && !rids.size) t = tasks.get([...tids][0]);
        else if (rids.size === 1 && !tids.size) rid = [...rids][0];
      } else if (s.tasks.length) t = tasks.get(active(s.tasks, ts));
      else if (s.runs?.length) rid = active(s.runs, ts);
      else if (!s.dispatcher) {
        // ds keeps only dispatches with a start time, so the null check never drops one.
        const ids = new Set(ds.filter((d) => d.from !== null && d.from <= ts && ts <= (d.to || now)).map((d) => d.task));
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
      // From here rid is null or the id of run r (run ids are strings), so `rid ?? null` below never changes it.
      const [role, role_src] = r && !t ? ['orchestrator', 'dispatch'] : assign(t, s, assignments.get(s) || null);
      if (r) {
        // r came from runs.get(rid), so r.id === rid, and every run has a session set and an activity map.
        inc(r.tokens, s.agent, tot);
        sessionSets.get(r.id)?.add(JSON.stringify([s.agent, s.id]));
        const map = orchActivity.get(r.id);
        if (role === 'orchestrator' && map) {
          inc(r.orchestrator_by_agent, s.agent, tot);
          let a = map.get(s.agent);
          if (!a) map.set(s.agent, (a = { agent: s.agent, start: ts, end: ts, tokens: 0 }));
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
        t && !s.aggregate && !s.auxiliary
          ? t.routing.filter(
              (a) =>
                a.dispatch &&
                a.agent === s.agent &&
                ds.some((d) => d.task === t.id && d.id === a.dispatch && d.from !== null && d.from <= ts && ts <= (d.to || Infinity)),
            )
          : [];
      const routing = matches.length === 1 ? matches[0] : null,
        key = JSON.stringify([rid, t?.id, role, source, routing?.dispatch]);
      let row = rows.get(key);
      if (!row) {
        row = {
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
          run_id: rid ?? null,
          attribution: source,
          aggregate: !!s.aggregate,
          routing,
          calls: 0,
          fin: 0,
          cr: 0,
          cw: 0,
          out: 0,
          reason: 0,
          ctx: [],
          days: dict(),
          hours: dict(),
          t0: ts,
          mix: dict(),
          models: dict(),
          skills: dict(),
          search: dict(),
          feature_segments: [],
        };
        rows.set(key, row);
      }
      const branch_source = ctx.branch_source || 'session',
        bk = JSON.stringify([key, ctx.cwd, ctx.branch, branch_source]);
      let p = branches.get(bk);
      if (!p) {
        // A missing session start/end becomes ts: the two lines after this block do the same with `|| ts`.
        p = {
          id: s.id,
          session_id: s.id,
          agent: s.agent,
          cwd: ctx.cwd,
          repo: repo(ctx.cwd)[0],
          branch: ctx.branch,
          run_id: rid ?? null,
          role,
          start: (call.length > 10 ? ts : s.start) ?? ts,
          end: (call.length > 10 ? ts : s.end) ?? ts,
          total: 0,
          skills: dict(),
          hooks: dict(),
          branch_source,
        };
        branches.set(bk, p);
        row.feature_segments.push(p);
        parts.push(p);
      }
      p.total += tot;
      p.start = Math.min(p.start || ts, ts);
      p.end = Math.max(p.end || ts, ts);
      row.calls++;
      row.fin += fin;
      row.cr += cr;
      row.cw += cw;
      row.out += out;
      row.reason += reason;
      if (!s.aggregate) row.ctx.push(fin + cr + cw);
      const day = date(ts),
        hour = day + ' ' + String(new Date(ts * 1000).getHours()).padStart(2, '0');
      for (const values of [(row.days[day] ??= [0, 0, 0, 0]), (row.hours[hour] ??= [0, 0, 0, 0])]) [fin, cr, cw, out].forEach((n, i) => (values[i] += n));
      inc(row.models, model, tot);
      inc(row.mix, model + '|' + (eff || '?'), tot);
    }
    const values = [...rows.values()],
      target = (ts: number) => {
        const tid = active(s.tasks, ts),
          rid = active(s.runs, ts);
        return values.find((r) => (tid ? r.task_id === tid : rid && r.run_id === rid)) || values[0];
      };
    const same = (p: Segment, c: { cwd: string | null; branch: string | null; branch_source?: string }) =>
      p.cwd === c.cwd && p.branch === c.branch && p.branch_source === (c.branch_source || 'session');
    for (const [name, ts] of s.skills) {
      if (!ts || ts < start) continue;
      const r = target(ts);
      if (!r) continue;
      const p = r.feature_segments.find((p) => same(p, branchAt(ts)));
      for (const group of [r, p].filter((g) => g !== undefined)) {
        const value = (group.skills[name] ??= [0, 0]);
        value[0]++;
        value[1] = Math.max(value[1], ts);
      }
    }
    for (const [k, at] of s.search || []) {
      const ts = at || s.start,
        r = ts ? target(ts) : undefined;
      if (ts && ts >= start && r) inc(r.search, k, 1);
    }
    for (const [i, r] of values.entries()) {
      if (values.length > 1) r.id += ':part:' + i;
      const hooks = Object.entries(s.hooks || {}).filter((e): e is [string, [number, string]] => Boolean(e[1][0] && e[1][0] >= start));
      const rowHooks = Object.fromEntries(hooks.map(([n, h]) => [n, h[1]]));
      for (const [j, p] of r.feature_segments.entries()) {
        p.id = r.id + ':branch:' + j;
        p.hooks = Object.fromEntries(hooks.filter(([, h]) => same(p, branchAt(h[0]))).map(([n, h]) => [n, h[1]]));
      }
      const largest = (obj: Record<string, number>) => Object.keys(obj).reduce((a, b) => (obj[a] >= obj[b] ? a : b));
      const model = largest(r.models);
      // Math.trunc(Number(x)) equals Math.trunc(x); median is never null for a non-empty list.
      // Object.assign appends the new keys in the order the row has always had them.
      const row: UsageRow = Object.assign(r, {
        hooks: rowHooks,
        model,
        effort: largest(Object.fromEntries(Object.entries(r.mix).filter(([k]) => k.startsWith(model + '|')))).split('|')[1],
        ctx_med: r.ctx.length ? Math.trunc(Number(median(r.ctx))) : null,
        ctx_max: r.ctx.length ? r.ctx.reduce((a, b) => Math.max(a, b)) : null,
        total: r.fin + r.cr + r.cw + r.out,
      });
      if (s.aggregate) row.calls = null;
      sessions.push(row);
    }
  }
  for (const r of runs.values()) {
    const sum = (o: Record<string, number>) => Object.values(o).reduce<number>((a, b) => a + Number(b), 0);
    // Every run got its activity map and session set in the first loop.
    r.orchestrator_activity = [...(orchActivity.get(r.id)?.values() ?? [])];
    r.orchestrator_tokens = sum(r.orchestrator_by_agent);
    r.worker_tokens = sum(r.tokens) - r.orchestrator_tokens;
    r.tokens.sessions = sessionSets.get(r.id)?.size ?? 0;
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
    orcaRuns,
    orca.available,
    db,
    gitMetrics,
  );
  return {
    generated_at: now,
    days,
    range_start: start,
    dates: Array.from({ length: days }, (_, i) => date(start + 86400 * i + 3600)),
    sessions,
    attribution,
    features,
    agents: readAgents(db, now * 1000),
    sources: readSources(db),
    orca: { available: orca.available, error: orca.error, fetched_at: orca.fetched_at, runs: orcaRuns },
    ...roleConfig(),
    rtk: rtk(db, date(start)),
    build_ms: Math.trunc(performance.now() - begin),
  };
}
