import type { AgentSummary, AgentRun, DashboardData, DashboardRun } from './protocol.ts';
import type { RunTask, UsageRow } from './protocol.ts';
import { join } from 'node:path';
import { teams, read, installed } from './metadata.ts';
import { loaded, median } from './features.ts';
type RunSummary = AgentSummary['runs'][number];
type Issue = AgentSummary['issues'][number];
type Routed = UsageRow & { routing: NonNullable<UsageRow['routing']> };
const sum = <K extends string>(rows: { [P in K]?: number | null }[], key: K) => rows.reduce((n, r) => n + (r[key] || 0), 0);
const by = <T, K>(rows: T[], key: (row: T) => K) => Map.groupBy(rows, key);
const count = <T>(rows: T[], key: (row: T) => string) => Object.fromEntries([...by(rows, key)].map(([k, v]) => [k, v.length]));
const sid = (s: Pick<UsageRow, 'agent' | 'session_id' | 'id'>) => s.agent + ':' + (s.session_id || s.id);
const share = (x: number, y: number) => (y ? Number((x / y).toFixed(4)) : 0);
const fmt = (n: number | null | undefined) => {
  if (n == null) return '?';
  for (const [d, s] of [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ] as const)
    if (Math.abs(n) >= d) return Number((n / d).toFixed(1)) + s;
  return String(Math.trunc(n));
};
const dur = (n: number | null | undefined) => {
  if (n == null) return '?';
  const m = Math.round(n / 60);
  return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + 'm';
};
const ids = (xs: string[]) => xs.slice(0, 3).join(', ') + (xs.length > 3 ? ' +' + (xs.length - 3) : '');
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function featureScope(d: DashboardData, repo: string | null, run: string | null) {
  const runs = d.features.runs.filter((f) => (!repo || f.repo === repo) && (!run || f.run_ids.includes(run)));
  return {
    orca_loading: d.features.orca_loading,
    runs,
    repositories: Object.fromEntries(
      Object.entries(d.features.repositories).filter(([name]) => (!repo || name === repo) && (!run || runs.some((r) => r.repo === name))),
    ),
  };
}
function runSummary(r: DashboardRun): RunSummary {
  const fixes = r.tasks.filter((t) => t.measurement.kind === 'fix'),
    unknown = fixes.filter((t) => !t.measurement.round).length;
  return {
    id: r.id,
    objective: r.objective,
    repo: r.repo,
    stage: r.stage,
    tasks: r.tasks.length,
    kinds: count(r.tasks, (t) => t.measurement.kind),
    fix_rounds: r.fix_rounds?.count ?? new Set(fixes.map((t) => t.measurement.round).filter(Boolean)).size + unknown,
    fix_causes: count(fixes, (t) => t.measurement.cause || 'unknown'),
    fix_rounds_source: r.fix_rounds?.source || 'measurement',
    fix_rounds_estimated: r.fix_rounds?.source === 'code-review' || ((r.fix_rounds?.source || 'measurement') === 'measurement' && !!unknown),
    gate_wait_seconds: r.gate_wait_seconds,
    lead_seconds: r.lead_seconds,
    delivered: Object.hasOwn(r, 'delivered') ? (r.delivered ?? null) : !!r.delivered_at || r.stage === 'merged',
    worker_tokens: r.worker_tokens,
    orchestrator_tokens: r.orchestrator_tokens,
  };
}
function issues(data: DashboardData, sessions: UsageRow[], runs: DashboardRun[]): Issue[] {
  const out: Issue[] = [],
    severity: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const issue = (
    id: string,
    severity: 'high' | 'medium' | 'low',
    title: string,
    evidence: string,
    suggestion: string,
    filter: Record<string, string | null | undefined>,
  ) =>
    out.push({
      id,
      severity,
      title,
      evidence,
      suggestion,
      filter: Object.fromEntries(Object.entries(filter).filter((e): e is [string, string] => !!e[1])),
    });
  const cards = new Map<string, { required: string[]; name: string }>();
  for (const name of installed(join(teams, 'skills')).filter((n) => n.startsWith('team-') || ['researcher', 'solution-architect'].includes(n))) {
    const line = read(join(teams, 'skills', name, 'SKILL.md')).match(/^- \*\*Skills:\*\*\s*(.+)$/m)?.[1];
    if (!line) continue;
    const required: string[] = [];
    for (const segment of line.replace(/\([^)]*\)/g, '').split(';')) {
      if (/^load /i.test(segment.trim())) continue;
      for (const clause of segment.split(','))
        if (!/\bwhen\b|on demand|\bwith\b/.test(clause)) for (const m of clause.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)) required.push(m[1]);
    }
    cards.set(name.replace(/^team-/, ''), { required, name });
  }
  // Keyed by task id; `string | null` only so a session's nullable task_id can be looked up (it never matches).
  const tasks = new Map<string | null, RunTask>(data.orca.runs.flatMap((r) => r.tasks.map((t) => [t.id, t]))),
    top = new Set(data.sessions.filter((s) => s.routing?.tier === 'top').map((s) => s.model));
  const reviewers = sessions.filter((s) => {
    const m = tasks.get(s.task_id)?.measurement;
    return (
      s.role === 'reviewer' && m && (m.kind === 're-review' || (m.round ?? 0) > 1) && (s.routing?.tier === 'top' || (!s.routing?.tier && top.has(s.model)))
    );
  });
  for (const [run, x] of by(reviewers, (s) => s.run_id)) {
    const tok = sum(x, 'total');
    issue(
      'top-rereview:' + run,
      tok >= 5e6 ? 'high' : 'medium',
      'Reviewer chạy tier top cho re-review hẹp',
      x.length + ' phiên reviewer, ' + fmt(tok) + ' token trên tier top/model top (' + ids(x.map((s) => s.id)) + ') trong Run ' + run,
      'Re-review hẹp phải dùng tier của Builder (tối thiểu work); chỉ review đầy đủ mới dùng top (skills/team-reviewer/SKILL.md).',
      { run, role: 'reviewer', repo: x[0].repo },
    );
  }
  for (const [, x] of by(sessions, (s) => JSON.stringify([s.run_id, s.role]))) {
    const { role, run_id: run } = x[0],
      card = cards.get(role);
    if (run && card) {
      const have = new Set(x.flatMap((s) => Object.keys(loaded(s)))),
        missing = card.required.filter((k) => !have.has(k));
      if (missing.length)
        issue(
          'missing-skill:' + run + ':' + role,
          'medium',
          'Vai ' + role + ' không nạp skill bắt buộc',
          'Run ' + run + ': ' + x.length + ' phiên ' + role + ' không nạp ' + missing.join(', ') + ' (' + ids(x.map((s) => s.id)) + ')',
          'Nhắc trong Task spec nạp skill theo skills/' + card.name + '/SKILL.md, hoặc sửa skill vai nếu skill không còn bắt buộc.',
          { run, role, repo: x[0].repo },
        );
    }
    const hit = x.filter((s) => s.search.rg_symbol),
      n = hit.reduce((n, s) => n + s.search.rg_symbol, 0);
    if (n >= 3)
      issue(
        'symbol-rg:' + (run || '-') + ':' + role,
        'medium',
        'Vai ' + role + ' dùng rg tìm symbol thay vì codegraph',
        n +
          ' lần rg/grep tìm symbol trong repo đã index, codegraph ' +
          x.reduce((n, s) => n + (s.search.codegraph || 0), 0) +
          ' lần; phiên: ' +
          ids(hit.map(sid)),
        'Tra symbol bằng `codegraph explore <symbol>`, còn quan hệ gọi bằng `codegraph callers|impact <symbol>`; chỉ dùng rg cho chuỗi thường.',
        { run, role, repo: hit[0].repo },
      );
  }
  for (const [role, x] of by(
    sessions.filter((s) => s.total && s.role !== 'chat trực tiếp'),
    (s) => s.role,
  )) {
    if (x.length < 5) continue;
    // median() is null only for an empty list; x has at least 5 rows here.
    const med = median(x.map((s) => s.total)) ?? 0,
      big = x.filter((s) => s.total > 3 * med).sort((a, b) => b.total - a.total),
      t = big[0];
    if (!t) continue;
    issue(
      'outlier:' + role,
      t.total > 10 * med ? 'high' : 'medium',
      'Phiên ' + role + ' tốn token bất thường',
      big.length +
        '/' +
        x.length +
        ' phiên > 3x trung vị ' +
        fmt(med) +
        '; lớn nhất ' +
        t.id +
        ' (' +
        fmt(t.total) +
        ', ' +
        (t.total / med).toFixed(1) +
        'x), ctx_max ' +
        fmt(t.ctx_max) +
        ', cache đọc ' +
        Math.round((100 * t.cr) / t.total) +
        '%; còn lại: ' +
        (ids(big.slice(1).map((s) => s.id)) || 'không'),
      'Mở phiên lớn nhất, tách phiên khi context phình hoặc giao việc nhỏ hơn.',
      { role },
    );
  }
  const efforts: (string | null)[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
  for (const [run, x] of by(
    sessions.filter((s): s is Routed => !!s.routing),
    (s) => s.run_id,
  )) {
    const groups: [Routed[], Routed[]] = [[], []];
    for (const s of x) {
      const r = s.routing;
      if (r.agent !== s.agent || (r.model && !s.model.toLowerCase().includes(r.model.toLowerCase()))) groups[0].push(s);
      else if (r.model && efforts.includes(r.effort) && efforts.indexOf(s.effort) > efforts.indexOf(r.effort)) groups[1].push(s);
    }
    const bad = groups.flat();
    if (!bad.length) continue;
    const parts = groups.flatMap((g, i) =>
      g.map((s) => {
        const r = s.routing;
        return (
          (i ? 'effort cao hơn đã chọn' : 'khác agent/model đã chọn') +
          ': chọn ' +
          [r.agent, r.model || '?', r.effort || '?'].join('/') +
          ', thực tế ' +
          [s.agent, s.model || '?', s.effort || '?'].join('/') +
          ' (' +
          s.id +
          ')'
        );
      }),
    );
    issue(
      'routing:' + run,
      groups[0].length ? 'medium' : 'low',
      'Phiên chạy khác routing đã chọn',
      'Run ' + run + ', ' + bad.length + ' phiên: ' + parts.slice(0, 3).join('; '),
      'Kiểm tra dispatch đã áp đúng agent/model/effort từ Routing của Task; ghi lại routing.jsonl khi đổi.',
      { run, repo: bad[0].repo },
    );
  }
  for (const r of runs) {
    const s = runSummary(r),
      run = r.id,
      repo = r.repo;
    if (s.fix_rounds > 2)
      issue(
        'fix-rounds:' + run,
        s.fix_rounds >= 4 ? 'high' : 'medium',
        'Run có hơn 2 vòng sửa',
        'Run ' +
          run +
          ': ' +
          s.fix_rounds +
          ' vòng sửa' +
          (s.fix_rounds_estimated ? ' (ước tính, thiếu round)' : '') +
          ', nguyên nhân: ' +
          Object.entries(s.fix_causes)
            .sort()
            .map(([k, v]) => k + ' ' + v)
            .join(', '),
        'Xem nguyên nhân chính (defect, requirements, scope, standards) và siết spec hoặc review sớm hơn.',
        { run, repo },
      );
    // A null lead_seconds coerces to 0 in arithmetic and comparison; `?? 0` keeps that behaviour explicit.
    const ratio = r.gate_wait_seconds / (r.lead_seconds ?? 0);
    if ((r.lead_seconds ?? 0) >= 600 && ratio > 0.5)
      issue(
        'gate-wait:' + run,
        ratio > 0.8 ? 'high' : 'medium',
        'Chờ PO chiếm phần lớn thời gian Run',
        'Run ' +
          run +
          ': chờ gate ' +
          dur(r.gate_wait_seconds) +
          ' trên ' +
          dur(r.lead_seconds) +
          ' tổng (' +
          Math.round(100 * ratio) +
          '%)' +
          (r.delivered_at ? '' : ', Run chưa giao'),
        'Gom câu hỏi vào ít gate hơn và nêu rõ việc PO cần quyết; làm việc song song khi gate đang mở.',
        { run, repo },
      );
  }
  return out.sort((a, b) => severity[a.severity] - severity[b.severity] || compare(a.id, b.id));
}
export function summary(d: DashboardData, q: URLSearchParams): AgentSummary {
  const repo = q.get('repo') || null,
    run = q.get('run') || null,
    role = q.get('role') || null,
    agent = q.get('agent') || null;
  const scope = d.sessions.filter((s) => (!repo || s.repo === repo) && (!run || s.run_id === run));
  const sessions: UsageRow[] = scope.filter((s) => (!role || s.role === role) && (!agent || s.agent === agent)),
    total = sum(sessions, 'total');
  const runs = d.orca.runs.filter((r) => (run ? r.id === run : (!repo || r.repo === repo) && scope.some((s) => s.run_id === r.id)));
  const tokens_by_role: AgentSummary['tokens_by_role'] = [],
    search_by_role: AgentSummary['search_by_role'] = [],
    skills_by_role: AgentSummary['skills_by_role'] = Object.create(null);
  for (const [role, x] of by(sessions, (s) => s.role)) {
    const tokens = sum(x, 'total'),
      mix = new Map<string, number>(),
      skills = new Map<string, { loads: number; ids: Set<string> }>();
    let cg = 0,
      rg = 0,
      symbol = 0;
    for (const s of x) {
      for (const [k, n] of Object.entries(s.mix)) {
        const key = s.agent + '|' + k;
        mix.set(key, (mix.get(key) || 0) + n);
      }
      for (const [name, n] of Object.entries(loaded(s))) {
        if (!skills.has(name)) skills.set(name, { loads: 0, ids: new Set() });
        const v = skills.get(name)!;
        v.loads += n;
        v.ids.add(sid(s));
      }
      cg += s.search.codegraph || 0;
      rg += (s.search.rg || 0) + (s.search.grep || 0);
      symbol += s.search.rg_symbol || 0;
    }
    tokens_by_role.push({
      role,
      tokens,
      sessions: new Set(x.map(sid)).size,
      share: share(tokens, total),
      mix: [...mix.entries()]
        .filter(([, v]) => v)
        .sort((a, b) => b[1] - a[1])
        .map(([key, tokens]) => ({ key, tokens })),
    });
    if (cg + rg)
      search_by_role.push({
        role,
        codegraph: cg,
        rg_grep: rg,
        rg_symbol: symbol,
        codegraph_share: share(cg, cg + rg),
      });
    if (skills.size)
      skills_by_role[role] = [...skills.entries()]
        .map(([skill, v]) => ({ skill, loads: v.loads, sessions: v.ids.size }))
        .sort((a, b) => b.loads - a.loads || compare(a.skill, b.skill));
  }
  return {
    scope: { days: d.days, repo, run, role, agent, generated_at: d.generated_at },
    totals: {
      tokens: total,
      sessions: new Set(sessions.map(sid)).size,
      assigned_tokens: sum(
        sessions.filter((s) => s.run_id),
        'total',
      ),
      in: sum(sessions, 'fin'),
      cache_read: sum(sessions, 'cr'),
      cache_write: sum(sessions, 'cw'),
      out: sum(sessions, 'out'),
    },
    features: featureScope(d, repo, run),
    tokens_by_role: tokens_by_role.sort((a, b) => b.tokens - a.tokens),
    search_by_role: search_by_role.sort((a, b) => b.rg_symbol - a.rg_symbol || b.codegraph + b.rg_grep - a.codegraph - a.rg_grep),
    skills_by_role,
    runs: runs.map(runSummary),
    issues: issues(d, sessions, runs),
  };
}
export function runDetail(d: DashboardData, id: string | null): AgentRun | null {
  const r = d.orca.runs.find((r) => r.id === id);
  if (!r) return null;
  const sessions = d.sessions.filter((s) => s.run_id === id),
    now = Date.now() / 1000;
  const tasks = r.tasks
    .slice()
    .sort((a, b) => (a.created || 0) - (b.created || 0))
    .map((t) => {
      const skills: Record<string, number> = Object.create(null);
      for (const s of sessions.filter((s) => s.task_id === t.id)) for (const [k, v] of Object.entries(loaded(s))) skills[k] = (skills[k] || 0) + v;
      const start = t.started || t.created,
        end = t.ended || t.completed;
      return {
        id: t.id,
        title: t.title,
        role: t.role,
        kind: t.measurement.kind,
        round: t.measurement.round,
        cause: t.measurement.cause,
        status: t.status,
        agent: t.agent,
        model: t.model,
        effort: t.effort,
        tier: t.routing.at(-1)?.tier || null,
        tokens: Object.values(t.tokens).reduce<number>((a, b) => a + Number(b), 0),
        duration_seconds: start && end && end >= start ? end - start : null,
        skills,
      };
    });
  return {
    run: runSummary(r),
    features: featureScope(d, null, id),
    tasks,
    gates: r.gates.map((g) => ({
      id: g.id,
      kind: g.kind,
      stage: g.stage,
      task: g.task,
      wait_seconds: g.created ? (g.resolved || now) - g.created : null,
      question: g.question.slice(0, 120),
    })),
    issues: issues(d, sessions, [r]),
    skills_window_days: d.days,
  };
}
const table = (head: string[], rows: unknown[][]) =>
  [
    '| ' + head.join(' | ') + ' |',
    '|' + '---|'.repeat(head.length),
    ...rows.map(
      (row) =>
        '| ' +
        row
          .map((x) =>
            String(x ?? '')
              .replaceAll('|', '/')
              .replaceAll('\n', ' ')
              .replace(/[—–]/g, '-'),
          )
          .join(' | ') +
        ' |',
    ),
  ].join('\n');
const issueText = (items: Issue[]) =>
  items.length
    ? items
        .map(
          (i) =>
            '- **[' +
            i.severity +
            ']** ' +
            i.title +
            ': ' +
            i.evidence +
            '. Suggestion: ' +
            i.suggestion.replace(/\.+$/, '') +
            '. Filter: `' +
            JSON.stringify(i.filter).replace(/":/g, '": ').replace(/,"/g, ', "') +
            '`',
        )
        .join('\n')
    : 'No issues detected.';
export function markdown(s: AgentSummary | AgentRun) {
  // Only an AgentRun has a top-level `run` (always an object), so this matches the old `if (s.run)`.
  if ('run' in s) {
    const r = s.run;
    return [
      '# Run ' + r.id,
      '',
      r.objective +
        ' | repo ' +
        r.repo +
        ' | stage ' +
        r.stage +
        ' | lead ' +
        dur(r.lead_seconds) +
        ' | gate wait ' +
        dur(r.gate_wait_seconds) +
        ' | worker ' +
        fmt(r.worker_tokens) +
        ' tok, orchestrator ' +
        fmt(r.orchestrator_tokens) +
        ' tok | fix rounds ' +
        r.fix_rounds,
      '',
      '## Tasks',
      '',
      table(
        ['#', 'Role', 'Kind', 'Round', 'Agent/model/effort', 'Tier', 'Tokens', 'Duration', 'Status', 'Skills'],
        s.tasks.map((t, i) => [
          i + 1,
          t.role,
          t.kind,
          t.round,
          [t.agent || '?', t.model || '?', t.effort || '?'].join('/'),
          t.tier,
          fmt(t.tokens),
          dur(t.duration_seconds),
          t.status,
          Object.keys(t.skills).sort().join(', ') || '-',
        ]),
      ),
      '',
      'Skills cover sessions in the last ' + s.skills_window_days + ' days only.',
      '',
      '## Gates',
      '',
      s.gates.length
        ? table(
            ['Gate', 'Kind', 'Stage', 'Wait', 'Question'],
            s.gates.map((g) => [g.id, g.kind, g.stage, dur(g.wait_seconds), g.question]),
          )
        : 'No gates.',
      '',
      '## Issues (' + s.issues.length + ')',
      '',
      issueText(s.issues),
      '',
    ].join('\n');
  }
  const t = s.totals,
    sc = s.scope,
    filters =
      (['repo', 'run', 'role', 'agent'] as const)
        .filter((k) => sc[k])
        .map((k) => k + '=' + sc[k])
        .join(', ') || 'none';
  return [
    '# Team dashboard summary',
    '',
    'Scope: last ' + sc.days + ' days, filters: ' + filters,
    '',
    '## Totals',
    '',
    fmt(t.tokens) +
      ' tokens in ' +
      t.sessions +
      ' sessions (' +
      fmt(t.assigned_tokens) +
      ' assigned to Runs). Input ' +
      fmt(t.in) +
      ', cache read ' +
      fmt(t.cache_read) +
      ', cache write ' +
      fmt(t.cache_write) +
      ', output ' +
      fmt(t.out) +
      '.',
    '',
    '## Tokens by role',
    '',
    table(
      ['Role', 'Tokens', 'Share', 'Sessions', 'Top agent/model/effort'],
      s.tokens_by_role.map((r) => [
        r.role,
        fmt(r.tokens),
        (100 * r.share).toFixed(1) + '%',
        r.sessions,
        r.mix
          .slice(0, 2)
          .map((m) => m.key + ' ' + fmt(m.tokens))
          .join(', '),
      ]),
    ),
    '',
    '## Code search by role',
    '',
    s.search_by_role.length
      ? table(
          ['Role', 'codegraph', 'rg/grep', 'rg_symbol', 'codegraph share'],
          s.search_by_role.map((r) => [r.role, r.codegraph, r.rg_grep, r.rg_symbol, (100 * r.codegraph_share).toFixed(0) + '%']),
        )
      : 'No code searches.',
    '',
    '## Skills by role',
    '',
    Object.keys(s.skills_by_role).length
      ? table(
          ['Role', 'Skills (loads)'],
          Object.keys(s.skills_by_role)
            .sort()
            .map((role) => {
              const sk = s.skills_by_role[role];
              return [
                role,
                sk
                  .slice(0, 8)
                  .map((x) => x.skill + ' ' + x.loads)
                  .join(', ') + (sk.length > 8 ? ' +' + (sk.length - 8) + ' more' : ''),
              ];
            }),
        )
      : 'No skill loads.',
    '',
    '## Runs',
    '',
    s.runs.length
      ? table(
          ['Run', 'Repo', 'Stage', 'Tasks', 'Fix rounds', 'Gate wait', 'Lead', 'Worker tok', 'Orch tok', 'Objective'],
          s.runs.map((r) => [
            r.id,
            r.repo,
            r.stage,
            Object.entries(r.kinds)
              .sort()
              .map(([k, v]) => k + ' ' + v)
              .join(', '),
            r.fix_rounds,
            dur(r.gate_wait_seconds),
            dur(r.lead_seconds),
            fmt(r.worker_tokens),
            fmt(r.orchestrator_tokens),
            (r.objective || '').slice(0, 60),
          ]),
        )
      : 'No Runs in scope.',
    '',
    '## Feature Runs',
    '',
    table(
      ['Repo / branch', 'Variant', 'Escaped defects', 'Median days', 'Source'],
      s.features.runs.map((f) => [f.repo + ' / ' + f.branch, f.variant, f.escaped_defects, f.median_days_to_surface, f.source]),
    ),
    '',
    '## Issues (' + s.issues.length + ')',
    '',
    issueText(s.issues),
    '',
  ].join('\n');
}
