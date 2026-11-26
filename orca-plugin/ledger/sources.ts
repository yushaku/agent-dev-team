import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Store } from './store.ts';

/** Where each source lives under the home directory. `AGENT_LEDGER_<KIND>` overrides it (cycle.ts and the dashboard use the same rule). */
export const SOURCE_PATHS = {
  claude: '.claude/projects',
  codex: '.codex/sessions',
  jcode: '.jcode/sessions',
  pi: '.pi/agent/sessions',
  hermes: '.hermes/state.db',
  rtk: 'Library/Application Support/rtk/history.db',
  opencode: '.local/share/opencode/opencode.db',
};
export const rootOf = (kind: keyof typeof SOURCE_PATHS, env: NodeJS.ProcessEnv = process.env) =>
  resolve(env['AGENT_LEDGER_' + kind.toUpperCase()] || join(homedir(), SOURCE_PATHS[kind]));

/** How each parser counts tokens, one short line for the methodology view (Vietnamese, like the rest of the page). */
export const SOURCE_NOTES: Record<string, string> = {
  claude:
    'Mỗi dòng assistant có message.usage (input, cache đọc, cache ghi, output, thinking); cùng message.id lặp lại theo từng khối nội dung nên chỉ đếm một lần, kể cả giữa các file. Gồm cả file subagent.',
  codex:
    'Mỗi bản ghi token_usage_record là một lượt gọi; input trừ cached_input_tokens (input của Codex đã gồm cache). Model và effort lấy từ turn_context của cùng turn.',
  jcode: 'Mỗi phiên là một file JSON; token_usage của từng tin nhắn assistant (input, cache đọc, cache ghi, output). Không có effort.',
  pi: 'JSONL: cộng input, cacheRead, cacheWrite và output của assistant, usage, compaction và branch_summary trên mọi nhánh lịch sử; reasoning nằm trong output. ID và thời điểm bản ghi chống đếm trùng khi fork/replay. Model giữ provider; Run lấy từ lệnh điều phối và biên nhận tạo Run thành công.',
  hermes:
    'SQLite đọc chỉ: một hàng sessions mỗi phiên với token tổng hợp, xếp vào ngày bắt đầu phiên. Không có số lượt gọi hay context mỗi lượt, nên không phân bổ khi phiên chứa nhiều Run hoặc Task.',
  opencode:
    'SQLite đọc chỉ (schema session_v2): mỗi tin nhắn assistant trong session_message là một lượt gọi (input không gồm cache, cache đọc, cache ghi, output; reasoning cộng vào output). Phần chênh giữa tổng của session_v2 và tổng các tin nhắn (vd. lượt đặt tiêu đề) thành một lượt gọi lúc bắt đầu phiên. Tool lấy từ session_part loại tool.',
  rtk: 'SQLite đọc chỉ: mỗi lệnh RTK là một bản ghi commands (token gốc, token tiết kiệm, thời gian chạy, dự án).',
  orca: 'orca orchestration run-list, task-list, gate-list, worker-list, worker-show, inbox --json --full, làm mới ở nền. Orca không chạy thì các tab khác vẫn hoạt động.',
};

/** `files` counts archived log files, and only for sources that are files (a database or Orca's saved CLI answers are not files): null otherwise. `present` says the ledger has archived anything from the source. */
export type SourceInfo = { kind: string; path: string; files: number | null; present: boolean; note: string };
const FILE_KINDS = new Set(['claude', 'codex', 'jcode', 'pi']);

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
  const count = db.prepare('SELECT count(*) n FROM sources WHERE kind=? AND source_gone_at IS NULL');
  const home = homedir();
  const shown = (path: string) => (path === home || path.startsWith(home + '/') ? '~' + path.slice(home.length) : path);
  return [...Object.keys(SOURCE_PATHS), 'orca'].map((kind) => {
    const n = Number(count.get(kind)?.n ?? 0);
    return {
      kind,
      path: shown(saved.get(kind) ?? (kind === 'orca' ? process.env.AGENT_LEDGER_ORCA || 'orca' : rootOf(kind as keyof typeof SOURCE_PATHS))),
      files: FILE_KINDS.has(kind) ? n : null,
      present: n > 0,
      note: SOURCE_NOTES[kind] ?? '',
    };
  });
}
