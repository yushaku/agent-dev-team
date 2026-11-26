import './team-env.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFile } from '../session.ts';

// bin/team runs the orca commands for the coordinator and prints one marker line per Run-scoped step.
// The coordinator session attaches to that Run only from a tool result, after it called `team init|task|dispatch|start|fix|rereview`.
const at = (n: number) => `2026-11-26T06:00:${String(n).padStart(2, '0')}.000Z`;
const marker = (run: string, step = 'dispatch') => JSON.stringify({ team: step, run, task: 'task_1', dispatch: 'ctx_1' });
const output = (run: string, step?: string) => ['{"task":"task_1","dispatch":"ctx_1"}', marker(run, step), ''].join('\n');
const call = '/Users/me/.agents/teams/bin/team start greet .team/greet/specs/01-builder.md --title one';
const lines = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
const runs = (agent: string, rows: unknown[]) => parseFile(agent, '/logs/s.jsonl', lines(rows)).runs?.map((r) => r[0]) ?? [];

function pi(command: string, result: string, extra: Record<string, unknown> = {}) {
  return [
    { type: 'session', version: 3, id: 'pi-coord', cwd: '/repo', timestamp: at(0) },
    {
      type: 'message',
      id: 'a',
      timestamp: at(1),
      message: { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: { command } }] },
    },
    {
      type: 'message',
      id: 'r',
      timestamp: at(2),
      message: { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: result }], ...extra },
    },
  ];
}
function claude(command: string, result: string) {
  const base = { sessionId: 'claude-coord', cwd: '/repo', gitBranch: 'main' };
  return [
    { ...base, type: 'assistant', timestamp: at(1), message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command } }] } },
    { ...base, type: 'user', timestamp: at(2), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: result }] } },
  ];
}
function codex(command: string, result: string) {
  return [
    { timestamp: at(0), type: 'session_meta', payload: { id: 'codex-coord', cwd: '/repo' } },
    {
      timestamp: at(1),
      type: 'response_item',
      payload: { type: 'function_call', name: 'exec_command', call_id: 'k1', arguments: JSON.stringify({ cmd: command }) },
    },
    // Codex wraps exec output in JSON inside a text item, so the marker arrives escaped twice.
    {
      timestamp: at(2),
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'k1',
        output: [{ type: 'input_text', text: 'Output:\n' + JSON.stringify({ exit_code: 0, output: result }) }],
      },
    },
  ];
}

test('a team call followed by its marker attaches the coordinator to the Run (pi, claude, codex)', () => {
  assert.deepEqual(runs('pi', pi(call, output('run_aaaa'))), ['run_aaaa']);
  assert.deepEqual(runs('claude', claude(call, output('run_bbbb'))), ['run_bbbb']);
  assert.deepEqual(runs('codex', codex(call, output('run_cccc'))), ['run_cccc']);
  assert.equal(parseFile('pi', '/logs/s.jsonl', lines(pi(call, output('run_aaaa')))).dispatcher, true);
});

test('init, task, fix and rereview markers count; status, board and other commands do not make a team call', () => {
  assert.deepEqual(runs('pi', pi('team init greet --objective "Greet"', output('run_dddd', 'init'))), ['run_dddd']);
  assert.deepEqual(runs('pi', pi('bin/team task greet s.md --title x', output('run_eeee', 'task'))), ['run_eeee']);
  assert.deepEqual(runs('pi', pi('team fix greet --cause defect', output('run_abab'))), ['run_abab']);
  assert.deepEqual(runs('pi', pi('team rereview', output('run_cdcd'))), ['run_cdcd']);
  assert.deepEqual(runs('pi', pi('team status greet', output('run_ffff'))), []);
  assert.deepEqual(runs('pi', pi('cat routing.jsonl', output('run_ffff'))), []);
});

test('a marker in a failed result, inline in other text or only in the call arguments does not count', () => {
  assert.deepEqual(runs('pi', pi(call, output('run_aaaa'), { isError: true })), []);
  assert.deepEqual(runs('pi', pi(call, 'quoted: ' + marker('run_aaaa') + '\n')), []);
  assert.deepEqual(runs('claude', claude(call + ' && echo ' + JSON.stringify(marker('run_aaaa')), 'nothing printed\n')), []);
});

test('a later team call on another Run starts a new attribution boundary', () => {
  const rows = [...pi(call, output('run_aaaa')), ...pi(call, output('run_bbbb')).slice(1)];
  assert.deepEqual(runs('pi', rows), ['run_aaaa', 'run_bbbb']);
});
