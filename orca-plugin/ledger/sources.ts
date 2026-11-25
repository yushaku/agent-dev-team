import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Store } from './store.ts';

/** Where each source lives under the home directory. `AGENT_LEDGER_<KIND>` overrides it (cycle.ts and the dashboard use the same rule). */
export const SOURCE_PATHS = {
  claude: '.claude/projects',
  codex: '.codex/sessions',
  copilot: '.copilot/session-state',
  jcode: '.jcode/sessions',
  hermes: '.hermes/state.db',
  rtk: 'Library/Application Support/rtk/history.db',
};
export const rootOf = (kind: keyof typeof SOURCE_PATHS, env: NodeJS.ProcessEnv = process.env) =>
  resolve(env['AGENT_LEDGER_' + kind.toUpperCase()] || join(homedir(), SOURCE_PATHS[kind]));

/** How each parser counts tokens, one short line for the methodology view (Vietnamese, like the rest of the page). */
export const SOURCE_NOTES: Record<string, string> = {
  claude:
    'Mỗi dòng assistant có message.usage (input, cache đọc, cache ghi, output, thinking); cùng message.id lặp lại theo từng khối nội dung nên chỉ đếm một lần, kể cả giữa các file. Gồm cả file subagent.',
  codex:
    'Mỗi bản ghi token_usage_record là một lượt gọi; input trừ cached_input_tokens (input của Codex đã gồm cache). Model và effort lấy từ turn_context của cùng turn.',
  copilot:
    'Mỗi sự kiện session.usage_record là một lượt gọi, khóa theo accounting.sourceSessionId và sequence; input trừ cache đọc và cache ghi. workspace.yaml cho cwd, nhánh và client_name.',
  jcode: 'Mỗi phiên là một file JSON; token_usage của từng tin nhắn assistant (input, cache đọc, cache ghi, output). Không có effort.',
  hermes:
    'SQLite đọc chỉ: một hàng sessions mỗi phiên với token tổng hợp, xếp vào ngày bắt đầu phiên. Không có số lượt gọi hay context mỗi lượt, nên không phân bổ khi phiên chứa nhiều Run hoặc Task.',
  rtk: 'SQLite đọc chỉ: mỗi lệnh RTK là một bản ghi commands (token gốc, token tiết kiệm, thời gian chạy, dự án).',
  orca: 'orca orchestration run-list, task-list, gate-list, worker-list, worker-show, inbox --json --full, làm mới ở nền. Orca không chạy thì các tab khác vẫn hoạt động.',
};

/** `files` counts archived log files, and only for sources that are files (a directory marker, a database or Orca's saved CLI answers are not files): null otherwise. `present` says the ledger has archived anything from the source. */
export type SourceInfo = { kind: string; path: string; files: number | null; present: boolean; note: string };
const FILE_KINDS = new Set(['claude', 'codex', 'copilot', 'jcode']);

/** The roots this ledger reads, as resolved by the pass that last ran, so the dashboard shows what ingest used. */
export function recordRoots(store: Store, env: NodeJS.ProcessEnv = process.env) {
  const put = store.db.prepare('INSERT OR REPLACE INTO source_roots(kind,path) VALUES(?,?)');
  for (const kind of Object.keys(SOURCE_PATHS) as (keyof typeof SOURCE_PATHS)[]) put.run(kind, rootOf(kind, env));
  put.run('orca', env.AGENT_LEDGER_ORCA || 'orca');
}

/** The sources the ledger reads: kind, resolved path (home shown as ~), archived file count, accounting note. */
export function readSources(db: DatabaseSync): SourceInfo[] {
  const saved = new Map(
    db
      .prepare('SELECT kind,path FROM source_roots')
      .all()
      .map((r) => [String(r.kind), String(r.path)]),
  );
  // A Copilot session directory with no events yet is recorded as a directory marker, not as a file.
  const count = db.prepare(
    "SELECT count(*) n FROM sources s WHERE kind=? AND source_gone_at IS NULL AND NOT EXISTS (SELECT 1 FROM versions WHERE source=s.id AND item='directory')",
  );
  const home = homedir();
  const shown = (path: string) => (path === home || path.startsWith(home + '/') ? '~' + path.slice(home.length) : path);
  return [...Object.keys(SOURCE_PATHS), 'orca'].map((kind) => {
    const n = Number(count.get(kind)?.n ?? 0);
    const any = Number(db.prepare('SELECT count(*) n FROM sources WHERE kind=? AND source_gone_at IS NULL').get(kind)?.n ?? 0) > 0;
    return {
      kind,
      path: shown(saved.get(kind) ?? (kind === 'orca' ? process.env.AGENT_LEDGER_ORCA || 'orca' : rootOf(kind as keyof typeof SOURCE_PATHS))),
      files: FILE_KINDS.has(kind) ? n : null,
      present: any,
      note: SOURCE_NOTES[kind] ?? '',
    };
  });
}
