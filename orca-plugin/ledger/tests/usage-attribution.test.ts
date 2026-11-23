import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from '../dashboard.ts';
import { PARSER_VERSION, projections } from '../derived.ts';
import { Store } from '../store.ts';

// Contracts of the removed Python test_usage.py (token attribution across dispatches and Runs), on temporary
// ledgers: archived Orca CLI answers for Runs, tasks and dispatches, and parsed sessions stored the way the
// projection leaves them. `now` is fixed, so every figure is exact.
const now = Date.parse('2026-11-13T12:00:00Z') / 1000;
const iso = (ts: number) => new Date(ts * 1000).toISOString();
const worktree = '/repo/worktree';

type Task = { id: string; run: string; title?: string; routing?: Record<string, unknown>[] };
type Dispatch = { id: string; task: string; from: number; to?: number; wt?: string; agent?: string };

async function world(t: import('node:test').TestContext, spec: { runs: string[]; tasks?: Task[]; dispatches?: Dispatch[] }) {
  const home = mkdtempSync(join(tmpdir(), 'usage-attribution-'));
  const store = new Store(home);
  t.after(() => {
    store.db.close();
    rmSync(home, { recursive: true, force: true });
  });
  const put = (cmd: string, args: string[], data: unknown) =>
    store.record(store.source('orca', JSON.stringify([cmd, ...args])), 1, 'result', Buffer.from(JSON.stringify(data)));
  const tasks = spec.tasks ?? [],
    dispatches = spec.dispatches ?? [];
  put('run-list', ['--page', '0'], { runs: spec.runs.map((id) => ({ id, created_at: iso(now - 500), objective: id })) });
  for (const run of spec.runs) {
    const mine = tasks.filter((task) => task.run === run);
    put('task-list', ['--run', run], {
      tasks: mine.map((task) => ({
        id: task.id,
        task_title: task.title ?? 'builder: build',
        status: 'in_progress',
        created_at: iso(now - 400),
        spec: (task.routing ?? []).map((r) => 'Routing: ' + JSON.stringify(r)).join('\n'),
      })),
    });
    put('worker-list', ['--run', run], {
      workers: dispatches.filter((d) => mine.some((task) => task.id === d.task)).map((d) => ({ dispatchId: d.id, taskId: d.task, agentTerminalHandle: 'term-' + d.id })),
    });
    put('gate-list', ['--run', run], { gates: [] });
    put('inbox', ['--run', run], { messages: [] });
  }
  for (const d of dispatches)
    put('worker-show', ['--dispatch', d.id], {
      dispatch: { taskId: d.task, dispatchedAt: iso(d.from), ...(d.to ? { completedAt: iso(d.to) } : {}), status: d.to ? 'completed' : 'running' },
      worker: { worktreeId: 'root::' + (d.wt ?? worktree), startOptions: { launch: { effective: { agent: d.agent ?? 'codex' } } } },
    });
  await projections(store)();
  const source = store.source('codex', '/archive/session');
  const session = (calls: [number, number][], extra: Record<string, unknown> = {}) => {
    const id = String(extra.id ?? 'session');
    const row = {
      agent: 'codex', id, cwd: worktree, branch: null, start: calls[0][0], end: calls.at(-1)![0], originator: null,
      skills: [], tasks: [], runs: [], subagent: false, dispatcher: false, hooks: {}, preview: '', role_line: null, discussion: null,
      calls: calls.map(([ts, tokens]) => [ts, 'test-model', 'medium', tokens, 0, 0, 0, 0, null]),
      ...extra,
    };
    store.db.prepare('INSERT OR REPLACE INTO dashboard_sessions VALUES(?,?,?,?,?)').run(PARSER_VERSION, source, 1, id, JSON.stringify(row));
  };
  return { store, session, data: (days = 7) => build(store, days, now) };
}
const run = (data: ReturnType<typeof build>, id: string) => data.orca.runs.find((r) => r.id === id)!;

test('a reused session splits its tokens between tasks and Runs and keeps the unassigned ones', async (t) => {
  const base = now - 100;
  const w = await world(t, { runs: ['run_a', 'run_b'], tasks: [{ id: 'a', run: 'run_a' }, { id: 'b', run: 'run_b' }] });
  w.session([[base, 10], [base + 10, 20], [base + 20, 30], [base + 30, 40]], {
    tasks: [['a', base + 10], ['b', base + 20], ['a', base + 30]],
    skills: [['tdd', base + 10], ['ponytail', base + 20]],
  });
  const data = w.data();
  assert.equal(data.attribution.assigned, 90);
  assert.equal(data.attribution.unassigned, 10, 'the call before the first task is nobody\'s');
  assert.equal(data.sessions.reduce((n, s) => n + s.total, 0), 100);
  assert.equal(run(data, 'run_a').tokens.codex, 60);
  assert.equal(run(data, 'run_b').tokens.codex, 30);
  assert.ok(!('prices' in data));
  assert.ok(!('cost' in data.sessions[0]));
  assert.equal(data.sessions.reduce((n, s) => n + Object.values(s.skills).reduce((m, v) => m + v[0], 0), 0), 2);
});

test('an orchestrator session is attributed by the Run in its commands, not by its worktree', async (t) => {
  const base = now - 100;
  const w = await world(t, { runs: ['run_a', 'run_b'] });
  w.session([[base, 10], [base + 10, 20], [base + 20, 30]], { runs: [['run_a', base + 10], ['run_b', base + 20]], dispatcher: true });
  const data = w.data();
  assert.equal(data.attribution.unassigned, 10);
  assert.deepEqual(data.orca.runs.map((r) => r.orchestrator_tokens), [20, 30]);
  assert.deepEqual(data.orca.runs.map((r) => r.orchestrator_activity), [
    [{ agent: 'codex', start: base + 10, end: base + 10, tokens: 20 }],
    [{ agent: 'codex', start: base + 20, end: base + 20, tokens: 30 }],
  ]);
  assert.deepEqual(new Set(data.sessions.map((s) => s.role)), new Set(['orchestrator']));
});

test('ambiguous dispatch windows and a multi-Run aggregate stay unassigned; one window is inferred', async (t) => {
  const base = now - 100;
  const ambiguous = await world(t, {
    runs: ['run_a'],
    tasks: [{ id: 'a', run: 'run_a' }, { id: 'b', run: 'run_a' }],
    dispatches: [{ id: 'd1', task: 'a', from: base - 5, to: base + 5 }, { id: 'd2', task: 'b', from: base - 5, to: base + 5 }],
  });
  ambiguous.session([[base, 10]]);
  assert.equal(ambiguous.data().attribution.unassigned, 10, 'two tasks in the same window on one worktree: nobody');
  assert.equal(ambiguous.data().attribution.inferred, 0);

  const aggregate = await world(t, { runs: ['run_a', 'run_b'] });
  aggregate.session([[base, 10]], { aggregate: true, dispatcher: true, runs: [['run_a', base], ['run_b', base + 1]] });
  assert.equal(aggregate.data().attribution.unassigned, 10, 'an aggregate that spans two Runs cannot be split');

  const single = await world(t, { runs: ['run_a'], tasks: [{ id: 'a', run: 'run_a' }], dispatches: [{ id: 'd1', task: 'a', from: base - 5, to: base + 5 }] });
  single.session([[base, 10]]);
  const data = single.data();
  assert.equal(data.attribution.assigned, 10);
  assert.equal(data.attribution.inferred, 10, 'one dispatch window is an inference and is counted as one');
  assert.equal(data.sessions[0].attribution, 'dispatch_window');
});

test('rerouting the same task keeps the selection of each dispatch', async (t) => {
  const base = now - 100;
  const record = (tier: string, catalog: string, dispatch: string) => ({ tier, catalog, agent: 'codex', model: 'test-model', effort: 'medium', dispatch });
  const routing = [record('fast', 'quick', 'd1'), record('work', 'code', 'd2')];
  const dispatches = [{ id: 'd1', task: 'a', from: base - 50, to: base - 20 }, { id: 'd2', task: 'a', from: base - 10, to: base + 5 }];
  const task = { id: 'a', run: 'run_a', routing };
  const w = await world(t, { runs: ['run_a'], tasks: [task], dispatches });
  w.session([[base - 40, 10], [base - 15, 7], [base - 5, 20]], { tasks: [['a', base - 50]] });
  const by = Object.fromEntries(w.data().sessions.map((s) => [s.routing?.catalog ?? 'none', s.total]));
  assert.deepEqual(by, { quick: 10, none: 7, code: 20 }, 'a call between the two dispatch windows has no selection');

  const other = await world(t, { runs: ['run_a'], tasks: [task], dispatches });
  other.session([[base - 5, 20]], { agent: 'claude', tasks: [['a', base - 50]] });
  assert.equal(other.data().sessions[0].routing, null, 'another agent than the dispatch\'s is never matched');

  const overlapping = await world(t, { runs: ['run_a'], tasks: [task], dispatches: [dispatches[0], { ...dispatches[1], from: base - 30 }] });
  overlapping.session([[base - 25, 20]], { tasks: [['a', base - 50]] });
  assert.equal(overlapping.data().sessions[0].routing, null, 'two windows that cover the call are ambiguous');
});

test('a session carries the routing resolved for its task, except an aggregate session', async (t) => {
  const base = now - 100;
  const routing = { tier: 'work', catalog: 'my-code', agent: 'codex', model: 'test-model', effort: 'medium', dispatch: 'd1' };
  const spec = { runs: ['run_a'], tasks: [{ id: 'a', run: 'run_a', routing: [routing] }], dispatches: [{ id: 'd1', task: 'a', from: base - 1, to: base + 1 }] };
  const plain = await world(t, spec);
  plain.session([[base, 10]], { tasks: [['a', base]] });
  assert.deepEqual(plain.data().sessions[0].routing, routing);
  const aggregate = await world(t, spec);
  aggregate.session([[base, 10]], { tasks: [['a', base]], aggregate: true });
  assert.equal(aggregate.data().sessions[0].routing, null);
});

test('a Run\'s lifetime tokens and its window tokens are different figures', async (t) => {
  const base = now - 10;
  const w = await world(t, { runs: ['run_a'], tasks: [{ id: 'a', run: 'run_a' }] });
  w.session([[base - 10 * 86400, 40], [base, 10]], { tasks: [['a', base - 11 * 86400]] });
  const data = w.data(7);
  assert.equal(data.attribution.total, 10, 'only the window counts toward the attribution totals');
  assert.equal(run(data, 'run_a').tokens.codex, 50, 'lifetime');
  assert.equal(run(data, 'run_a').window_tokens.codex, 10, 'window');
});

test('role defaults do not depend on a model registry', async (t) => {
  const w = await world(t, { runs: [] });
  const config = w.data().roles_cfg as { tiers: object; roles: Record<string, { tier: string; agent: string | null }> };
  assert.deepEqual(config.tiers, {});
  assert.equal(config.roles.reviewer.tier, 'top');
  assert.equal(config.roles.builder.tier, 'work');
  assert.equal(config.roles.builder.agent ?? null, null);
});
