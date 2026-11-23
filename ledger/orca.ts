import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store, hash } from './store.ts';

const execute = promisify(execFile);
const ended = new Set(['completed','failed','cancelled','canceled','abandoned','merged']);
type RunCache = { paths: string[], workerHash?: string, dispatches: Record<string,string> };

export async function snapshot(store: Store, binary: string, errors: string[]) {
  const initialErrors = errors.length;
  const seen = new Set<string>();
  const listed = new Set<string>();
  const keyOf = (command: string, args: string[]) => JSON.stringify([command,...args]);
  async function read(command: string, args: string[]) {
    const { stdout } = await execute(binary,['orchestration',command,...args,'--json','--full'],
      { timeout: 20000, maxBuffer: 64*1024*1024 });
    const { ok,result } = JSON.parse(stdout);
    if (ok === false || !result) throw Error('Orca request failed: '+keyOf(command,args));
    return result;
  }
  async function request(command: string, args: string[], paths: string[]) {
    const key = keyOf(command,args);
    const result = await read(command,args);
    const id = store.source('orca',key);
    store.record(id,1,'result',Buffer.from(JSON.stringify(result)));
    store.db.prepare('UPDATE sources SET source_gone_at=NULL WHERE id=? AND source_gone_at IS NOT NULL').run(id);
    seen.add(key);
    paths.push(key);
    return result;
  }
  async function pages(command: string, args: string[], field: string, paths: string[]) {
    const items = [];
    let cursor;
    const visited = new Set<string>();
    do {
      const page = await request(command,[...args,'--limit','100',...(cursor ? ['--cursor',cursor] : [])],paths);
      items.push(...page[field]);
      cursor = page.nextCursor ?? page.page?.nextCursor;
      if (cursor && visited.has(cursor)) throw Error('Orca repeated a pagination cursor');
      visited.add(cursor);
    } while (cursor);
    return items;
  }
  const runs = await pages('run-list',[],'runs',[]);
  const pending = runs.flatMap(run => {
    listed.add(run.id);
    const entry = hash(Buffer.from(JSON.stringify(run)));
    const cached = store.db.prepare('SELECT * FROM orca_runs WHERE id=?').get(run.id);
    const previous: RunCache | undefined = cached && JSON.parse(String(cached.paths));
    if (previous && cached?.terminal && cached.entry_hash === entry) {
      for (const path of previous.paths) seen.add(path);
      return [];
    }
    return [{run, entry, previous, unchanged: cached?.entry_hash === entry}];
  });

  // A global worker inventory lets several live runs share a change check.
  // A CLI bound to one run can return a narrower scope; fall back to scoped reads.
  async function inventory() {
    if (pending.filter(p => p.unchanged).length < 4) return;
    const groups = new Map<string, typeof runs>();
    const visited = new Set<string>();
    let cursor;
    try {
      do {
        const page = await read('worker-list',['--limit','100',...(cursor ? ['--cursor',cursor] : [])]);
        if (page.scope?.source !== 'all' || (page.page?.hasMore && !page.page.nextCursor)) return;
        for (const w of page.workers) {
          if (!groups.has(w.runId)) groups.set(w.runId,[]);
          groups.get(w.runId)!.push(w);
        }
        cursor = page.page?.nextCursor;
        if (cursor && visited.has(cursor)) return;
        visited.add(cursor);
      } while (cursor);
      return groups;
    } catch { return; }
  }
  const inventoryResult = inventory();
  async function poll({run,entry,previous,unchanged}: typeof pending[number]) {
    const args = ['--run',run.id];
    const paths: string[] = [];
    const dispatches: Record<string,string> = {};
    const {tasks} = await request('task-list',args,paths);
    const {gates} = await request('gate-list',args,paths);
    await request('inbox',[...args,'--limit','500'],paths);
    const groups = await inventoryResult;
    const summary = groups?.get(run.id) ?? [];
    const digestWorkers = (workers: typeof runs) => hash(Buffer.from(JSON.stringify(workers)));
    let workers;
    if (groups && unchanged && previous?.workerHash === digestWorkers(summary)) {
      workers = summary;
      for (const key of previous.paths) {
        if (JSON.parse(key)[0] === 'worker-list') { seen.add(key); paths.push(key); }
      }
    } else {
      workers = await pages('worker-list',args,'workers',paths);
    }
    const workerHash = digestWorkers(workers);
    for (const w of workers) {
      if (!w.dispatchId) continue;
      const key = keyOf('worker-show',['--dispatch',w.dispatchId]);
      const digest = hash(Buffer.from(JSON.stringify(w)));
      if (ended.has(w.dispatchStatus)) dispatches[w.dispatchId] = digest;
      if (unchanged && previous?.dispatches[w.dispatchId] === digest && dispatches[w.dispatchId]) {
        seen.add(key);
        paths.push(key);
      } else {
        await request('worker-show',['--dispatch',w.dispatchId],paths);
      }
    }
    // Some CLI versions omit run.status. Open gates, ready/blocked tasks and
    // live dispatches must keep polling even when the list entry is unchanged.
    const terminal = run.status ? ended.has(run.status) :
      tasks?.length > 0 && tasks.every((t: {status:string}) => ended.has(t.status)) &&
      gates?.every((g: {status:string}) => g.status === 'resolved') &&
      workers.every(w => ended.has(w.dispatchStatus));
    store.db.prepare('INSERT OR REPLACE INTO orca_runs VALUES(?,?,?,?)')
      .run(run.id,entry,Number(Boolean(terminal)),JSON.stringify({paths,workerHash,dispatches}));
  }
  const queue = pending.values();
  await Promise.all(Array.from({length: Math.min(8,pending.length)}, async () => {
    for (const job of queue) {
      try { await poll(job); }
      catch (error) {
        store.db.prepare('DELETE FROM orca_runs WHERE id=?').run(job.run.id);
        errors.push('Orca run '+job.run.id+': '+String(error).split('\n')[0]);
      }
    }
  }));
  if (errors.length !== initialErrors) return;
  for (const row of store.db.prepare('SELECT id FROM orca_runs').all()) {
    if (!listed.has(String(row.id))) store.db.prepare('DELETE FROM orca_runs WHERE id=?').run(row.id);
  }
  for (const row of store.db.prepare("SELECT id,path FROM sources WHERE kind='orca' AND source_gone_at IS NULL").all()) {
    if (!seen.has(String(row.path))) store.db.prepare('UPDATE sources SET source_gone_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
  }
}
