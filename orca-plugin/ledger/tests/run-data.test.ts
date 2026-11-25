import './team-env.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runData } from '../run-data.ts';

test('Run coordinator handles and Run mail share the Orchestrator identity', () => {
  for (const coordinator of ['term_coordinator', 'orca_session_id:coordinator']) {
    const date = '2026-11-25T04:02:39Z';
    const rows = [
      { path: ['run-list'], data: { runs: [{ id: 'run_a', coordinator_handle: coordinator, created_at: date }] } },
      { path: ['task-list', '--run', 'run_a'], data: { tasks: [] } },
      { path: ['gate-list', '--run', 'run_a'], data: { gates: [] } },
      { path: ['worker-list', '--run', 'run_a'], data: { workers: [] } },
      {
        path: ['inbox', '--run', 'run_a'],
        data: {
          messages: [
            { id: 'out', from_handle: coordinator, to_handle: 'dispatch:worker', created_at: date },
            { id: 'in', from_handle: 'dispatch:worker', to_handle: coordinator, created_at: date },
            { id: 'run', from_handle: 'run:run_a', to_handle: coordinator, created_at: date },
            { id: 'other', from_handle: 'term_other', to_handle: 'run:run_a', created_at: date },
            { id: 'missing', to_handle: coordinator, created_at: date },
          ],
        },
      },
    ].map(({ path, data }) => ({ path: JSON.stringify(path), data: JSON.stringify(data) }));
    const { runs } = runData(rows, Date.parse(date) / 1000, 1);
    const run = runs[0];
    assert.equal(run.coordinator_handle, coordinator);
    const events = new Map(run.events.map((event) => [event.id, event]));
    assert.equal(events.get('out')?.from, 'Orchestrator');
    assert.equal(events.get('out')?.from_actor, 'coordinator');
    assert.equal(events.get('in')?.to, 'Orchestrator');
    assert.equal(events.get('in')?.to_actor, 'coordinator');
    assert.equal(events.get('run')?.from_actor, events.get('run')?.to_actor);
    assert.equal(events.get('other')?.from, 'term_other');
    assert.equal(events.get('other')?.from_actor, 'term_other');
    assert.equal(events.get('missing')?.from, 'Không rõ');
  }
});
