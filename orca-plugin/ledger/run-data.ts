import { tsOf, role, json } from './session.ts';
import { read, repoOf } from './metadata.ts';
import { realpathSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import type { SQLOutputValue } from 'node:sqlite';
import type { DashboardRun, RunEvent, RunGate, RunTask } from './protocol.ts';

// Orca CLI JSON (`orchestration ... --json --full`), only the fields read here.
type OrcaRunEntry = { id: string; status?: string; objective?: string; created_at?: string };
type OrcaTaskEntry = { id: string; title?: string; task_title?: string; spec?: string; status?: string; created_at?: string; completed_at?: string };
type OrcaGateEntry = { id: string; task_id?: string; question?: string; resolution?: string; status?: string; created_at?: string; resolved_at?: string };
type OrcaWorkerEntry = { dispatchId?: string; taskId?: string; agentTerminalHandle?: string };
type OrcaMessageEntry = { id: string; from_handle?: string; to_handle?: string; created_at?: string; subject?: string; type?: string; body?: string };
type RunDetails = { tasks?: OrcaTaskEntry[]; gates?: OrcaGateEntry[]; workers?: OrcaWorkerEntry[]; messages?: OrcaMessageEntry[] };
type Routing = RunTask['routing'][number];

/** A task as runData builds it; the dashboard adds `tokens`. */
export type OrcaTask = Omit<RunTask, 'tokens'> & Partial<Pick<RunTask, 'tokens'>>;
type Enrichment =
  | 'tokens'
  | 'window_tokens'
  | 'orchestrator_by_agent'
  | 'orchestrator_tokens'
  | 'worker_tokens'
  | 'orchestrator_activity'
  | 'fix_tokens_by_cause';
/** A run as runData builds it; the dashboard adds the token fields. */
export type OrcaRun = Omit<DashboardRun, Enrichment | 'tasks'> & Partial<Pick<DashboardRun, Enrichment>> & { tasks: OrcaTask[] };
export type OrcaDispatch = {
  id: string;
  task: string | undefined;
  agent: string | null;
  model: string | null;
  effort: string | null;
  wt: string | undefined;
  from: number | null;
  to: number | null;
};

function measurement(t: OrcaTaskEntry) {
  const match = /^Measurement:\s*(.+)$/m.exec(t.spec || '');
  const result: RunTask['measurement'] = { kind: 'unknown', round: null, cause: null, source: 'unknown' };
  if (match) {
    const d = json(match[1]);
    if (['build', 'review', 'fix', 're-review', 'delivery', 'close', 'spec', 'qa', 'merge', 'other'].includes(d?.kind))
      Object.assign(result, { kind: d.kind, source: 'metadata' });
    if (Number.isInteger(d?.round) && d.round > 0) result.round = d.round;
    if (['defect', 'requirements', 'scope', 'standards'].includes(d?.cause)) result.cause = d.cause;
  } else {
    const title = (t.task_title || t.title || '').toLowerCase();
    const kind = /\bre-?review\b/.test(title)
      ? 're-review'
      : /\bfix\b/.test(title)
        ? 'fix'
        : (
            {
              builder: 'build',
              build: 'build',
              reviewer: 'review',
              review: 'review',
              verify: 'review',
              delivery: 'delivery',
              deliver: 'delivery',
              close: 'close',
              spec: 'spec',
              qa: 'qa',
            } as Record<string, string>
          )[title.split(':')[0].trim()];
    if (kind) Object.assign(result, { kind, source: 'title' });
  }
  return result;
}
function routing(t: OrcaTaskEntry): Routing[] {
  const raw = Array.from(String(t.spec || '').matchAll(/^Routing:\s*(.+)$/gm), (m) => json(m[1]));
  const path = t.spec?.match(/^Routing-log:\s*(.+)$/m)?.[1].trim();
  if (path && isAbsolute(path) && path.includes('/.team/') && basename(path) === 'routing.jsonl')
    try {
      const real = realpathSync(path),
        team = realpathSync(path.split('/.team/')[0] + '/.team');
      if (real.startsWith(team + '/'))
        raw.push(
          ...read(real)
            .split('\n')
            .map(json)
            .filter((x) => x?.task === t.id),
        );
    } catch {}
  return raw
    .filter(
      (d) =>
        d &&
        ['top', 'work', 'fast'].includes(d.tier) &&
        ['catalog', 'agent'].every((k) => typeof d[k] === 'string' && d[k].trim()) &&
        ['model', 'effort', 'dispatch'].every((k) => d[k] == null || typeof d[k] === 'string'),
    )
    .map((d) => Object.fromEntries(['tier', 'catalog', 'agent', 'model', 'effort', 'dispatch'].map((k) => [k, d[k] ?? null])) as Routing);
}
function stage(r: OrcaRunEntry, ts: OrcaTask[], gs: RunGate[]) {
  if (r.status === 'merged' || r.status === 'cancelled' || r.status === 'canceled') return r.status === 'canceled' ? 'cancelled' : r.status;
  if (ts.some((t) => t.measurement.kind === 'merge' && t.status === 'completed')) return 'merged';
  const pending = gs.filter((g) => g.kind === 'pending');
  if (pending.length) return pending.some((g) => g.stage === 'delivery') ? 'awaiting_delivery' : 'awaiting_approval';
  for (const s of ['failed', 'blocked']) if (ts.some((t) => t.status === s)) return s;
  if (ts.length && ts.every((t) => (['cancelled', 'canceled'] as (string | null)[]).includes(t.status))) return 'cancelled';
  if (ts.some((t) => !(['completed', 'cancelled', 'canceled'] as (string | null)[]).includes(t.status))) return 'in_progress';
  return gs.some((g) => g.stage === 'delivery' && g.kind === 'approve') && ts.some((t) => t.measurement.kind === 'delivery' && t.status === 'completed')
    ? 'delivered'
    : 'unknown';
}
export function runData(rows: readonly Record<string, SQLOutputValue>[], now: number, fetched_at: number | null) {
  const details = new Map<string, RunDetails>(),
    listed = new Map<string, OrcaRunEntry>(),
    dispatches: OrcaDispatch[] = [],
    // Keyed by Orca task id; lookups pass ids that may be missing.
    tasks = new Map<string | undefined, OrcaTask>(),
    runs: OrcaRun[] = [];
  for (const { path, data } of rows) {
    // JSON.parse converts its argument with ToString, as String() does.
    const [cmd, ...args] = JSON.parse(String(path)),
      d = JSON.parse(String(data));
    if (cmd === 'run-list') {
      for (const r of d.runs || []) listed.set(r.id, r);
      continue;
    }
    if (cmd === 'worker-show') {
      const v = d.dispatch || {},
        w = d.worker || {},
        e = w.startOptions?.launch?.effective || {};
      dispatches.push({
        id: args[1],
        task: v.taskId,
        agent: e.agent ?? null,
        model: e.model ?? null,
        effort: e.effort ?? null,
        wt: (w.worktreeId || '').split('::').at(-1),
        from: tsOf(v.dispatchedAt),
        to: tsOf(v.completedAt),
      });
      continue;
    }
    const rid = args[args.indexOf('--run') + 1];
    if (!details.has(rid)) details.set(rid, {});
    const info = details.get(rid)!;
    for (const key of ['tasks', 'gates', 'workers', 'messages'] as const) if (d[key]) (info[key] ??= []).push(...d[key]);
  }
  const errors: string[] = [];
  for (const r of listed.values()) {
    const rid = r.id,
      info = details.get(rid) || {};
    if (!info.tasks || !info.gates || !info.workers) {
      errors.push(rid);
      continue;
    }
    const rtasks = info.tasks.map((t) => {
      const title = t.task_title || t.title || '',
        m = measurement(t),
        text = title.trim().replace(/^[#\s]*(?:task:\s*)?/i, '');
      const head = (text.includes(':') ? text.split(':')[0] : text.split(/\s/)[0]).toLowerCase();
      const roleId = head
        .split(/[\s+/,]+/)
        .map((w) => role(w) || role(w.replace(/-\w*\d\w*$/, '')) || role(w.split('-')[0]))
        .find(Boolean);
      const task: OrcaTask = {
        id: t.id,
        run: rid,
        title: title.slice(0, 120),
        role: roleId || (['qa', 'delivery'].includes(m.kind) ? 'builder' : null),
        status: t.status ?? null,
        created: tsOf(t.created_at),
        completed: tsOf(t.completed_at),
        agent: null,
        model: null,
        effort: null,
        repo: null,
        worktree: null,
        measurement: m,
        routing: routing(t),
      };
      tasks.set(t.id, task);
      return task;
    });
    const gates = info.gates.map((g): RunGate => {
      const answer = (g.resolution || '').trim(),
        kind = g.status !== 'resolved' ? 'pending' : /^approve/i.test(answer) ? 'approve' : /^changes/i.test(answer) ? 'changes' : 'other';
      return {
        id: g.id,
        task: g.task_id ?? null,
        question: g.question || '',
        answer,
        kind,
        stage: tasks.get(g.task_id)?.measurement.kind === 'close' ? 'delivery' : 'other',
        created: tsOf(g.created_at),
        resolved: tsOf(g.resolved_at),
      };
    });
    const events: RunEvent[] = [];
    const workers = info.workers.filter((w): w is OrcaWorkerEntry & { dispatchId: string } => !!w.dispatchId);
    const known = new Map(dispatches.map((d) => [d.id, d]));
    for (const w of workers) {
      const d = known.get(w.dispatchId),
        t = tasks.get(w.taskId);
      if (d?.from)
        events.push({
          id: 'dispatch:' + d.id,
          at: d.from,
          kind: 'dispatch',
          from: 'Orchestrator',
          to: t?.title || d.id,
          text: 'Giao việc',
          body: d.id,
          from_actor: 'coordinator',
          to_actor: w.agentTerminalHandle || d.id,
          to_task: w.taskId ?? null,
        });
    }
    for (const g of gates)
      for (const answer of [false, true]) {
        const at = answer ? g.resolved : g.created;
        if (!at) continue;
        const kind = answer ? 'gate_answer' : 'gate_question';
        events.push({
          id: g.id + ':' + kind,
          at,
          kind,
          from: answer ? 'PO' : 'Orchestrator',
          to: answer ? 'Orchestrator' : 'PO',
          from_actor: answer ? 'po' : 'coordinator',
          to_actor: answer ? 'coordinator' : 'po',
          text: answer ? g.answer : g.question,
          body: answer ? g.question : '',
        });
      }
    function endpoint(handle: string | undefined, at: number): [string, boolean, string | null, string] {
      if (handle === 'run:' + rid) return ['Orchestrator', false, null, 'coordinator'];
      const w =
        workers.find((w) => w.dispatchId === handle?.replace(/^dispatch:/, '')) ||
        workers
          .filter((w) => {
            const from = known.get(w.dispatchId)?.from;
            return w.agentTerminalHandle === handle && from != null && from > 0 && from <= at;
          })
          // The filter kept only workers whose dispatch has a start time.
          .sort((a, b) => (known.get(b.dispatchId)?.from ?? 0) - (known.get(a.dispatchId)?.from ?? 0))[0];
      return w
        ? [tasks.get(w.taskId)?.title || w.dispatchId, true, w.taskId ?? null, w.agentTerminalHandle || w.dispatchId]
        : [handle || 'Không rõ', false, null, handle || 'unknown'];
    }
    for (const m of info.messages || []) {
      const at = tsOf(m.created_at);
      if (!at) continue;
      const [from, sw, from_task, from_actor] = endpoint(m.from_handle, at),
        [to, tw, to_task, to_actor] = endpoint(m.to_handle, at);
      events.push({
        id: m.id,
        at,
        kind: sw && tw ? 'peer' : 'message',
        from,
        to,
        text: m.subject || m.type || 'Tin nhắn',
        body: m.body || '',
        type: m.type ?? null,
        from_task,
        to_task,
        from_actor,
        to_actor,
      });
    }
    events.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    const state = stage(r, rtasks, gates),
      objective = (r.objective || '').slice(0, 160),
      created = tsOf(r.created_at);
    for (const d of dispatches) {
      const t = tasks.get(d.task);
      if (t?.run !== rid) continue;
      Object.assign(t, { agent: d.agent, model: d.model, effort: d.effort });
      if (d.from) t.started = Math.min(t.started || d.from, d.from);
      if (d.to) t.ended = Math.max(t.ended || d.to, d.to);
      [t.repo, t.worktree] = d.wt ? repoOf(d.wt) : [null, null];
    }
    const repos = rtasks.map((t) => t.repo).filter(Boolean);
    const repo = repos.sort((a, b) => repos.filter((r) => r === b).length - repos.filter((r) => r === a).length)[0] || objective.trim().split(/\s+/)[0] || '?';
    const delivery = gates
      .filter((g): g is RunGate & { resolved: number } => g.stage === 'delivery' && g.kind === 'approve' && !!g.resolved)
      .map((g) => g.resolved);
    const delivered_at = ['delivered', 'merged'].includes(state) && delivery.length ? Math.max(...delivery) : null,
      end = delivered_at || now;
    let last = 0,
      wait = 0;
    for (const g of gates.filter((g): g is RunGate & { created: number } => !!g.created && g.created <= end).sort((a, b) => a.created - b.created)) {
      const b = Math.min(end, g.resolved || end);
      wait += Math.max(0, b - Math.max(last, g.created));
      last = Math.max(last, b);
    }
    const attention: DashboardRun['attention'] = gates
      .filter((g) => g.kind === 'pending')
      .map((g) => ({
        kind: 'gate',
        text: g.question,
        waiting_seconds: g.created ? Math.max(0, now - g.created) : null,
      }));
    attention.push(
      ...rtasks
        .filter((t) => (['blocked', 'failed'] as (string | null)[]).includes(t.status))
        .map((t) => ({ kind: 'task', text: t.title, waiting_seconds: null })),
    );
    runs.push({
      id: rid,
      objective,
      created,
      tasks: rtasks,
      gates,
      stage: state,
      events,
      messages_available: !!info.messages,
      messages_limited: (info.messages?.length || 0) >= 500,
      repo,
      delivered_at,
      lead_seconds: created ? Math.max(0, end - created) : null,
      gate_wait_seconds: wait,
      attention,
    });
  }
  return {
    runs,
    tasks,
    dispatches,
    available: fetched_at != null,
    error: errors.length ? 'Thiếu dữ liệu Orca: ' + errors.join(', ') : null,
    fetched_at,
  };
}
