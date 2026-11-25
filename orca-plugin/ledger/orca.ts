import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { type Store, hash } from './store.ts';

const execute = promisify(execFile);
const endedDispatch = new Set(['completed', 'failed', 'cancelled', 'canceled', 'abandoned']);
const endedTask = new Set(['completed', 'failed', 'cancelled', 'canceled']);
const endedRun = new Set(['merged', 'cancelled', 'canceled', 'completed', 'failed', 'closed', 'done', 'succeeded']);
type RunCache = { paths: string[]; workerHash?: string; dispatches: Record<string, string> };

export async function snapshot(store: Store, binary: string, errors: string[]) {
  const now = Date.now();
  const revision = store.db.prepare('SELECT revision FROM orca_revision').get()!.revision;
  const responses = new Map<string, Buffer>();
  const failed: string[] = [];
  const updates: { id: string; entry: string; terminal: boolean; active: boolean; cache: RunCache }[] = [];
  const initialErrors = errors.length;
  const seen = new Set<string>();
  const listed = new Set<string>();
  const keyOf = (command: string, args: string[]) => JSON.stringify([command, ...args]);
  async function read(command: string, args: string[]) {
    const { stdout } = await execute(binary, ['orchestration', command, ...args, '--json', '--full'], { timeout: 20000, maxBuffer: 64 * 1024 * 1024 });
    const { ok, result } = JSON.parse(stdout);
    if (ok === false || !result) throw Error('Orca request failed: ' + keyOf(command, args));
    return result;
  }
  async function request(command: string, args: string[], paths: string[], key = keyOf(command, args)) {
    const result = await read(command, args);
    responses.set(key, Buffer.from(JSON.stringify(result)));
    seen.add(key);
    paths.push(key);
    return result;
  }
  async function pages(command: string, args: string[], field: string, paths: string[]) {
    const items = [];
    let cursor: string | undefined;
    const visited = new Set<string | undefined>();
    do {
      const argsWithCursor = [...args, '--limit', '100', ...(cursor ? ['--cursor', cursor] : [])];
      const key = keyOf(command, [...args, '--page', String(visited.size)]);
      const page = await request(command, argsWithCursor, paths, key);
      items.push(...page[field]);
      cursor = page.nextCursor ?? page.page?.nextCursor;
      if (cursor && visited.has(cursor)) throw Error('Orca repeated a pagination cursor');
      visited.add(cursor);
    } while (cursor);
    return items;
  }
  const runs = await pages('run-list', [], 'runs', []);
  const pending = runs.flatMap((run) => {
    listed.add(run.id);
    const entry = hash(Buffer.from(JSON.stringify(run)));
    const cached = store.db.prepare('SELECT * FROM orca_runs WHERE id=?').get(run.id);
    const previous: RunCache | undefined = cached && JSON.parse(String(cached.paths));
    if (previous && cached?.entry_hash === entry && Number(cached.next_poll_at) > now) {
      for (const path of previous.paths) seen.add(path);
      return [];
    }
    return [{ run, entry, previous, unchanged: cached?.entry_hash === entry }];
  });

  // A global worker inventory lets several live runs share a change check.
  // A CLI bound to one run can return a narrower scope; fall back to scoped reads.
  async function inventory() {
    if (pending.filter((p) => p.unchanged).length < 4) return;
    const groups = new Map<string, typeof runs>();
    const visited = new Set<string | undefined>();
    let cursor: string | undefined;
    try {
      do {
        const page = await read('worker-list', ['--limit', '100', ...(cursor ? ['--cursor', cursor] : [])]);
        if (page.scope?.source !== 'all' || (page.page?.hasMore && !page.page.nextCursor)) return;
        for (const w of page.workers) {
          if (!groups.has(w.runId)) groups.set(w.runId, []);
          groups.get(w.runId)!.push(w);
        }
        cursor = page.page?.nextCursor;
        if (cursor && visited.has(cursor)) return;
        visited.add(cursor);
      } while (cursor);
      return groups;
    } catch {
      return;
    }
  }
  const inventoryResult = inventory();
  async function poll({ run, entry, previous, unchanged }: (typeof pending)[number]) {
    const args = ['--run', run.id];
    const paths: string[] = [];
    const dispatches: Record<string, string> = {};
    const { tasks } = await request('task-list', args, paths);
    const { gates } = await request('gate-list', args, paths);
    await request('inbox', [...args, '--limit', '500'], paths);
    const groups = await inventoryResult;
    const summary = groups?.get(run.id) ?? [];
    const digestWorkers = (workers: typeof runs) => hash(Buffer.from(JSON.stringify(workers)));
    let workers: typeof summary;
    if (groups && unchanged && previous?.workerHash === digestWorkers(summary)) {
      workers = summary;
      for (const key of previous.paths) {
        if (JSON.parse(key)[0] === 'worker-list') {
          seen.add(key);
          paths.push(key);
        }
      }
    } else {
      workers = await pages('worker-list', args, 'workers', paths);
    }
    const workerHash = digestWorkers(workers);
    for (const w of workers) {
      if (!w.dispatchId) continue;
      const key = keyOf('worker-show', ['--dispatch', w.dispatchId]);
      const digest = hash(Buffer.from(JSON.stringify(w)));
      if (endedDispatch.has(w.dispatchStatus)) dispatches[w.dispatchId] = digest;
      if (unchanged && previous?.dispatches[w.dispatchId] === digest && dispatches[w.dispatchId]) {
        seen.add(key);
        paths.push(key);
      } else {
        await request('worker-show', ['--dispatch', w.dispatchId], paths);
      }
    }
    // Some CLI versions omit run.status. Open gates, ready/blocked tasks and
    // live dispatches must keep polling even when the list entry is unchanged.
    const active = workers.some((w) => !endedDispatch.has(w.dispatchStatus));
    const terminal =
      !active &&
      (run.status
        ? endedRun.has(run.status)
        : tasks?.length > 0 &&
          tasks.every((t: { status: string }) => endedTask.has(t.status)) &&
          gates?.every((g: { status: string }) => g.status === 'resolved'));
    updates.push({ id: run.id, entry, terminal: Boolean(terminal), active, cache: { paths, workerHash, dispatches } });
  }
  const queue = pending.values();
  await Promise.all(
    Array.from({ length: Math.min(8, pending.length) }, async () => {
      for (const job of queue) {
        try {
          await poll(job);
        } catch (error) {
          failed.push(job.run.id);
          errors.push('Orca run ' + job.run.id + ': ' + String(error).split('\n')[0]);
        }
      }
    }),
  );
  store.db.exec('BEGIN IMMEDIATE');
  try {
    // A competing daemon or --once may have committed a newer snapshot while
    // the CLI was running. Never move its schedule or observations backwards.
    if (store.db.prepare('UPDATE orca_revision SET revision=revision+1 WHERE revision=?').run(revision).changes) {
      const changed = new Set<string>();
      for (const [key, bytes] of responses) {
        const id = store.source('orca', key);
        if (store.record(id, 1, 'result', bytes)) changed.add(key);
        store.db.prepare('UPDATE sources SET source_gone_at=NULL WHERE id=? AND source_gone_at IS NOT NULL').run(id);
      }
      for (const { id, entry, terminal, active, cache } of updates) {
        const old = store.db.prepare('SELECT * FROM orca_runs WHERE id=?').get(id);
        const stable =
          old?.entry_hash === entry &&
          old.terminal === Number(terminal) &&
          old.paths === JSON.stringify(cache) &&
          !cache.paths.some((path) => changed.has(path));
        const since = stable && old?.settled_since != null ? Number(old.settled_since) : now;
        const minute = 60000;
        let next = now + minute;
        if (!active) {
          const checkpoints = terminal ? [10, 60, 360] : [5, 20];
          const upcoming = checkpoints.map((m) => since + m * minute).find((at) => at > now);
          next = upcoming ?? now + (terminal ? 1440 : 60) * minute;
        }
        store.db
          .prepare(`INSERT OR REPLACE INTO orca_runs
          (id,entry_hash,terminal,paths,last_polled_at,settled_since,next_poll_at) VALUES(?,?,?,?,?,?,?)`)
          .run(id, entry, Number(terminal), JSON.stringify(cache), now, since, next);
      }
      for (const id of failed) store.db.prepare('DELETE FROM orca_runs WHERE id=?').run(id);
      if (errors.length === initialErrors) {
        for (const row of store.db.prepare('SELECT id FROM orca_runs').all()) {
          if (!listed.has(String(row.id))) store.db.prepare('DELETE FROM orca_runs WHERE id=?').run(row.id);
        }
        for (const row of store.db.prepare("SELECT id,path FROM sources WHERE kind='orca' AND source_gone_at IS NULL").all()) {
          if (!seen.has(String(row.path))) store.db.prepare('UPDATE sources SET source_gone_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
        }
      }
    }
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}
