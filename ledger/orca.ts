import { execFileSync } from 'node:child_process';
import { Store } from './store.ts';

export function snapshot(store: Store, binary: string, errors: string[]) {
  const seen = new Set<string>();
  let complete = true;
  function request(command: string, args: string[]) {
    const key = JSON.stringify([command,...args]);
    let result;
    try {
      const output = execFileSync(binary,['orchestration',command,...args,'--json','--full'],
        { timeout: 20000, maxBuffer: 64*1024*1024, stdio: ['ignore','pipe','pipe'] });
      const response = JSON.parse(output.toString());
      result = response.result;
      if (response.ok === false || !result) throw Error('missing result');
    } catch {
      complete = false;
      errors.push('Orca request failed: '+key);
      return;
    }
    const id = store.source('orca',key);
    store.record(id,1,'result',Buffer.from(JSON.stringify(result)));
    store.db.prepare('UPDATE sources SET source_gone_at=NULL WHERE id=? AND source_gone_at IS NOT NULL').run(id);
    seen.add(key);
    return result;
  }
  function pages(command: string, args: string[], field: string) {
    const items = [];
    let cursor;
    const visited = new Set<string>();
    do {
      const page = request(command,[...args,'--limit','100',...(cursor ? ['--cursor',cursor] : [])]);
      if (!page) break;
      items.push(...page[field]);
      cursor = page.nextCursor ?? page.page?.nextCursor;
      if (cursor && visited.has(cursor)) throw Error('Orca repeated a pagination cursor');
      visited.add(cursor);
    } while (cursor);
    return items;
  }
  for (const run of pages('run-list',[],'runs')) {
    const args = ['--run',run.id];
    request('task-list',args);
    request('gate-list',args);
    request('inbox',[...args,'--limit','500']);
    for (const worker of pages('worker-list',args,'workers')) {
      if (worker.dispatchId) request('worker-show',['--dispatch',worker.dispatchId]);
    }
  }
  if (complete) {
    for (const row of store.db.prepare("SELECT id,path FROM sources WHERE kind='orca' AND source_gone_at IS NULL").all()) {
      if (!seen.has(String(row.path))) store.db.prepare('UPDATE sources SET source_gone_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
    }
  }
}
