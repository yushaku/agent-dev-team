import { parentPort, Worker, workerData } from 'node:worker_threads';
import { Store } from './store.ts';
import { projections, projectionStatus } from './derived.ts';
import { build } from './dashboard.ts';
import { runDetail, summary, markdown } from './insights.ts';
import { skillDoc } from './metadata.ts';
import { GitMetrics } from './git-metrics.ts';

const store = new Store(workerData.home);
const refresh = projections(store);
const git = new GitMetrics(store.db);
let revision = -1;
function tick() {
  let delay = 1000;
  try {
    const step = refresh.step();
    // On a fresh ledger, warm repository metrics once the startup projection has caught up.
    if (!step.pending && revision !== step.revision) git.warm();
    revision = step.revision;
    if (step.pending) delay = 0;
  } catch (error) {
    console.error('Dashboard projection refresh failed', error);
  }
  setTimeout(tick, delay).unref();
}
tick();

let cliResult: string | undefined;
let cliExpires = 0;
let cliPending: Promise<string> | undefined;
function cliTools() {
  if (cliResult && Date.now() < cliExpires) return cliResult;
  return (cliPending ??= new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./cli-worker.ts', import.meta.url));
    worker.once('error', reject);
    worker.once('message', (body: string) => {
      cliResult = body;
      cliExpires = Date.now() + 60000;
      resolve(body);
    });
    worker.once('exit', (code) => reject(new Error('CLI discovery exited with code ' + code)));
  }).finally(() => {
    cliPending = undefined;
  }));
}

const snapshots = new Map<number, { revision: number; gitRevision: number; at: number; body: string; errors: number; lag: number }>();
const json = 'application/json',
  plain = 'text/plain';
async function answer(url: string) {
  const { pathname, searchParams: q } = new URL(url, 'http://localhost');
  if (pathname === '/api/team/skill') {
    const doc = skillDoc(q.get('name') || '');
    return doc ? [200, json, JSON.stringify(doc)] : [400, plain + '; charset=utf-8', 'bad name'];
  }
  if (pathname === '/api/cli-tools') return [200, json, await cliTools()];
  const input = q.get('days')?.trim() || '7',
    days = /^[+-]?\d+$/.test(input) ? Math.max(1, Math.min(90, Number(input))) : 7;
  const now = Date.now();
  const projection = projectionStatus(store);
  let snap = snapshots.get(days);
  if (
    !snap ||
    snap.revision !== revision ||
    snap.gitRevision !== git.revision ||
    snap.errors !== projection.errors ||
    snap.lag !== projection.lag ||
    now - snap.at >= 30000
  ) {
    const data = build(store, days, undefined, git);
    snap = {
      revision,
      gitRevision: git.revision,
      at: Date.now(),
      ...projection,
      body: JSON.stringify({ ...data, projection }),
    };
    snapshots.set(days, snap);
    if (snapshots.size > 4) snapshots.delete(snapshots.keys().next().value!);
  }
  if (pathname === '/api/data') return [200, json, snap.body];
  const data = JSON.parse(snap.body);
  const result = pathname === '/api/agent/run' ? runDetail(data, q.get('id')) : summary(data, q);
  if (!result) return [404, plain, 'unknown run id'];
  return q.get('format') === 'json' ? [200, json, JSON.stringify(result)] : [200, 'text/markdown; charset=utf-8', markdown(result)];
}
parentPort!.on('message', async ({ id, url }) => {
  try {
    parentPort!.postMessage({ id, response: await answer(url) });
  } catch (error) {
    console.error('Dashboard request failed', error);
    parentPort!.postMessage({ id, response: [503, plain, 'Dashboard data is temporarily unavailable'] });
  }
});
