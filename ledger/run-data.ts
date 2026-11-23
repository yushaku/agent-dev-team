import { tsOf, role, json } from './session.ts';
import { read, repoOf } from './metadata.ts';
import { realpathSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
function measurement(t) {
  const match = /^Measurement:\s*(.+)$/m.exec(t.spec || '');
  const result = { kind: 'unknown', round: null, cause: null, source: 'unknown' };
  if (match) {
    const d = json(match[1]);
    if (
      ['build', 'review', 'fix', 're-review', 'delivery', 'close', 'spec', 'qa', 'merge', 'other'].includes(
        d?.kind,
      )
    )
      Object.assign(result, { kind: d.kind, source: 'metadata' });
    if (Number.isInteger(d?.round) && d.round > 0) result.round = d.round;
    if (['defect', 'requirements', 'scope', 'standards'].includes(d?.cause)) result.cause = d.cause;
  } else {
    const title = (t.task_title || t.title || '').toLowerCase();
    const kind = /\bre-?review\b/.test(title)
      ? 're-review'
      : /\bfix\b/.test(title)
        ? 'fix'
        : {
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
          }[title.split(':')[0].trim()];
    if (kind) Object.assign(result, { kind, source: 'title' });
  }
  return result;
}
function routing(t) {
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
    .map((d) =>
      Object.fromEntries(
        ['tier', 'catalog', 'agent', 'model', 'effort', 'dispatch'].map((k) => [k, d[k] ?? null]),
      ),
    );
}
function stage(r, ts, gs) {
  if (['merged', 'cancelled', 'canceled'].includes(r.status))
    return r.status === 'canceled' ? 'cancelled' : r.status;
  if (ts.some((t) => t.measurement.kind === 'merge' && t.status === 'completed')) return 'merged';
  const pending = gs.filter((g) => g.kind === 'pending');
  if (pending.length)
    return pending.some((g) => g.stage === 'delivery') ? 'awaiting_delivery' : 'awaiting_approval';
  for (const s of ['failed', 'blocked']) if (ts.some((t) => t.status === s)) return s;
  if (ts.length && ts.every((t) => ['cancelled', 'canceled'].includes(t.status))) return 'cancelled';
  if (ts.some((t) => !['completed', 'cancelled', 'canceled'].includes(t.status))) return 'in_progress';
  return gs.some((g) => g.stage === 'delivery' && g.kind === 'approve') &&
    ts.some((t) => t.measurement.kind === 'delivery' && t.status === 'completed')
    ? 'delivered'
    : 'unknown';
}
export function runData(rows, now: number, fetched_at: number | null) {
  const details = new Map(),
    listed = new Map(),
    dispatches = [],
    tasks = new Map(),
    runs = [];
  for (const { path, data } of rows) {
    const [cmd, ...args] = JSON.parse(path),
      d = JSON.parse(data);
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
    const info = details.get(rid);
    for (const key of ['tasks', 'gates', 'workers', 'messages'])
      if (d[key]) (info[key] ??= []).push(...d[key]);
  }
  const errors = [];
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
      const task = {
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
    const gates = info.gates.map((g) => {
      const answer = (g.resolution || '').trim(),
        kind =
          g.status !== 'resolved'
            ? 'pending'
            : /^approve/i.test(answer)
              ? 'approve'
              : /^changes/i.test(answer)
                ? 'changes'
                : 'other';
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
    const events = [];
    const workers = info.workers.filter((w) => w.dispatchId);
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
    function endpoint(handle, at) {
      if (handle === 'run:' + rid) return ['Orchestrator', false, null, 'coordinator'];
      const w =
        workers.find((w) => w.dispatchId === handle?.replace(/^dispatch:/, '')) ||
        workers
          .filter(
            (w) =>
              w.agentTerminalHandle === handle &&
              known.get(w.dispatchId)?.from > 0 &&
              known.get(w.dispatchId).from <= at,
          )
          .sort((a, b) => known.get(b.dispatchId).from - known.get(a.dispatchId).from)[0];
      return w
        ? [
            tasks.get(w.taskId)?.title || w.dispatchId,
            true,
            w.taskId ?? null,
            w.agentTerminalHandle || w.dispatchId,
          ]
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
    const repo =
      repos.sort((a, b) => repos.filter((r) => r === b).length - repos.filter((r) => r === a).length)[0] ||
      objective.trim().split(/\s+/)[0] ||
      '?';
    const delivery = gates
      .filter((g) => g.stage === 'delivery' && g.kind === 'approve' && g.resolved)
      .map((g) => g.resolved);
    const delivered_at =
        ['delivered', 'merged'].includes(state) && delivery.length ? Math.max(...delivery) : null,
      end = delivered_at || now;
    let last = 0,
      wait = 0;
    for (const g of gates
      .filter((g) => g.created && g.created <= end)
      .sort((a, b) => a.created - b.created)) {
      const b = Math.min(end, g.resolved || end);
      wait += Math.max(0, b - Math.max(last, g.created));
      last = Math.max(last, b);
    }
    const attention = gates
      .filter((g) => g.kind === 'pending')
      .map((g) => ({
        kind: 'gate',
        text: g.question,
        waiting_seconds: g.created ? Math.max(0, now - g.created) : null,
      }));
    attention.push(
      ...rtasks
        .filter((t) => ['blocked', 'failed'].includes(t.status))
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
