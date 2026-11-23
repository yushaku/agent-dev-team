import { parentPort, workerData } from 'node:worker_threads';
import { Store } from './store.ts';
import { projections } from './derived.ts';
import { build } from './dashboard.ts';
import { runDetail, summary, markdown } from './insights.ts';
import { skillDoc } from './metadata.ts';
import { discover } from './commands.ts';

const store = new Store(workerData.home),
  refresh = projections(store);
let revision = refresh();
setInterval(() => {
  try {
    revision = refresh();
  } catch (error) {
    console.error('Dashboard projection refresh failed', error);
  }
}, 1000).unref();
const snapshots = new Map<
  number,
  { revision: number; at: number; data: ReturnType<typeof build>; body: string }
>();
const json = 'application/json',
  plain = 'text/plain';
function answer(url: string) {
  const { pathname, searchParams: q } = new URL(url, 'http://localhost');
  if (pathname === '/api/team/skill') {
    const doc = skillDoc(q.get('name') || '');
    return doc ? [200, json, JSON.stringify(doc)] : [400, plain + '; charset=utf-8', 'bad name'];
  }
  if (pathname === '/api/cli-tools') return [200, json, JSON.stringify(discover())];
  const input = q.get('days')?.trim() || '7',
    days = /^[+-]?\d+$/.test(input) ? Math.max(1, Math.min(90, Number(input))) : 7;
  const now = Date.now();
  let snap = snapshots.get(days);
  if (!snap || snap.revision !== revision || now - snap.at >= 30000) {
    const data = build(store, days);
    snap = { revision, at: Date.now(), data, body: JSON.stringify(data) };
    snapshots.set(days, snap);
    if (snapshots.size > 4) snapshots.delete(snapshots.keys().next().value);
  }
  if (pathname === '/api/data') return [200, json, snap.body];
  const result = pathname === '/api/agent/run' ? runDetail(snap.data, q.get('id')) : summary(snap.data, q);
  if (!result) return [404, plain, 'unknown run id'];
  return q.get('format') === 'json'
    ? [200, json, JSON.stringify(result)]
    : [200, 'text/markdown; charset=utf-8', markdown(result)];
}
parentPort!.on('message', ({ id, url }) => {
  try {
    parentPort!.postMessage({ id, response: answer(url) });
  } catch (error) {
    console.error('Dashboard request failed', error);
    parentPort!.postMessage({ id, response: [503, plain, 'Dashboard data is temporarily unavailable'] });
  }
});
