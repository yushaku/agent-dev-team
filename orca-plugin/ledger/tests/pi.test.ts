import './team-env.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFile } from '../session.ts';
import { Store } from '../store.ts';
import { projections } from '../derived.ts';
import { files, ingestFile } from '../files.ts';
import { build } from '../dashboard.ts';

const at = (n: number) => `2026-11-25T05:00:${String(n).padStart(2, '0')}.000Z`;
const header = { type: 'session', version: 3, id: 'pi-session', cwd: '/repo/bisou', timestamp: at(0) };
const entry = <T extends Record<string, unknown>>(id: string, n: number, rest: T) => ({ id, parentId: null, timestamp: at(n), ...rest });
const assistant = (id: string, n: number, rest: Record<string, unknown> = {}) =>
  entry(id, n, {
    type: 'message',
    message: {
      role: 'assistant',
      provider: 'anthropic',
      model: 'claude-test',
      thinkingLevel: 'medium',
      usage: { input: 2, cacheRead: 3, cacheWrite: 4, output: 5, reasoning: 1, totalTokens: 14 },
      content: [],
      ...rest,
    },
  });
const create = assistant('create', 1, {
  usage: undefined,
  content: [{ type: 'toolCall', id: 'create-call', name: 'bash', arguments: { command: 'orca orchestration run-create --objective Wish --json' } }],
});
const receipt = entry('receipt', 2, {
  type: 'message',
  message: {
    role: 'toolResult',
    toolCallId: 'create-call',
    toolName: 'bash',
    content: [{ type: 'text', text: 'stdout\n{"ok":true,"result":{"runId":"run_aaaa"}}\n' }],
  },
});
const text = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

test('Pi counts assistant and auxiliary usage, keeps provider/model and tracks Run changes', () => {
  const rows = [
    header,
    create,
    receipt,
    assistant('one', 3),
    entry('warm', 4, { type: 'usage', kind: 'future-kind', provider: 'anthropic', model: 'claude-test', usage: { cacheRead: 10 } }),
    entry('compact', 5, { type: 'compaction', tokensBefore: 99999, usage: { input: 1, output: 2 } }),
    entry('switch', 6, {
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'switch-call', name: 'bash', arguments: { command: 'orca orchestration task-create --run run_bbbb --spec Work' } }],
      },
    }),
    assistant('two', 7, { provider: 'openai', model: 'gpt-test', thinkingLevel: 'high' }),
    entry('edit', 8, { type: 'context_edit', targetId: 'one', replacement: null }),
    entry('summary', 9, { type: 'branch_summary', usage: { input: 1, output: 2 } }),
    assistant('one', 3),
  ];
  const s = parseFile('pi', '/logs/pi.jsonl', text(rows));
  assert.equal(s.id, 'pi-session');
  assert.equal(s.cwd, '/repo/bisou');
  assert.equal(s.calls.length, 5);
  assert.deepEqual(s.calls[0].slice(1, 8), ['anthropic/claude-test', 'medium', 2, 3, 4, 5, 1]);
  assert.equal(s.calls[3][1], 'openai/gpt-test');
  assert.equal(s.calls[3][2], 'high');
  assert.equal(
    s.calls.reduce((n, c) => n + c[3] + c[4] + c[5] + c[6], 0),
    44,
  );
  assert.deepEqual(
    s.runs?.map((e) => e[0]),
    ['run_aaaa', 'run_bbbb'],
  );
});

test('Pi ingest, append, replacement, fork and source removal preserve usage and Run attribution', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'pi-ledger-'));
  const store = new Store(join(root, 'ledger'));
  t.after(() => {
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  });
  const folder = join(root, 'pi', 'project');
  mkdirSync(folder, { recursive: true });
  const path = join(folder, 'session.jsonl');
  const rows = [header, create, receipt, assistant('one', 3)];
  writeFileSync(path, text(rows));
  const refresh = projections(store);
  const ingest = async () => {
    for (const path of files(join(root, 'pi'), 'pi', (_, e) => {
      throw e;
    }))
      ingestFile(store, 'pi', path);
    await refresh();
  };
  const data = () => build(store, 7, Date.parse(at(59)) / 1000);
  for (const [cmd, body] of Object.entries({
    'run-list': { runs: [{ id: 'run_aaaa', objective: 'bisou Wish', created_at: at(0) }] },
    'task-list': { tasks: [] },
    'gate-list': { gates: [] },
    'worker-list': { workers: [] },
    inbox: { messages: [] },
  }))
    store.record(
      store.source('orca', JSON.stringify([cmd, ...(cmd === 'run-list' ? [] : ['--run', 'run_aaaa'])])),
      1,
      'result',
      Buffer.from(JSON.stringify(body)),
    );
  await ingest();
  assert.equal(data().orca.runs[0].orchestrator_tokens, 14);
  appendFileSync(path, text([assistant('two', 4)]));
  await ingest();
  assert.equal(data().orca.runs[0].orchestrator_tokens, 28);
  writeFileSync(path, text(rows));
  await ingest();
  assert.equal(data().orca.runs[0].orchestrator_tokens, 28);
  writeFileSync(join(folder, 'fork.jsonl'), text([{ ...header, id: 'fork', parentSession: path }, ...rows.slice(1), assistant('fork-new', 5)]));
  await ingest();
  assert.equal(data().orca.runs[0].orchestrator_tokens, 42);
  assert.ok(data().orca.runs[0].orchestrator_activity.some((a) => a.agent === 'pi'));
  assert.equal(data().sources.find((s) => s.kind === 'pi')?.files, 2);
  unlinkSync(path);
  await ingest();
  assert.equal(data().orca.runs[0].orchestrator_tokens, 42);
  writeFileSync(path, text([assistant('headerless', 6)]));
  await ingest();
  assert.equal(data().orca.runs[0].orchestrator_tokens, 56);
});

test('Pi ignores failed creation and help output, and handles nested codemode receipts', () => {
  const nested = entry('nested', 8, {
    type: 'message',
    message: {
      role: 'toolResult',
      toolCallId: 'nested-call',
      nestedCalls: { calls: [{ name: 'bash', status: 'ok', arguments: { command: 'orca orchestration run-create --objective Nested --json' } }] },
      content: [{ type: 'text', text: '{"ok":true,"result":{"run":{"id":"run_cccc"}}}' }],
    },
  });
  const failed = { ...receipt, message: { ...receipt.message, isError: true } };
  const help = assistant('help', 5, {
    usage: undefined,
    content: [{ type: 'toolCall', id: 'help-call', name: 'bash', arguments: { command: 'orca orchestration run-create --help' } }],
  });
  const helpResult = { ...receipt, id: 'help-result', timestamp: at(6), message: { ...receipt.message, toolCallId: 'help-call' } };
  const s = parseFile('pi', '/logs/pi.jsonl', text([header, create, failed, help, helpResult, nested]));
  assert.deepEqual(
    s.runs?.map((e) => e[0]),
    ['run_cccc'],
  );
});
