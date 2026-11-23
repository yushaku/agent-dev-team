// Host-independent ingest loop: the launchd daemon (daemon.ts) and the Orca plugin worker both
// call start()/stop(). One host at a time ingests into a ledger directory (lock.ts).
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.ts';
import { cycle } from './cycle.ts';
import { acquire, type Held } from './lock.ts';
import type { IngestApi, Options, Pass, Status } from './types.ts';

export type { IngestApi, Options, Pass, Status } from './types.ts';
export { acquire } from './lock.ts';

type Settings = Required<Pick<Options, 'home' | 'env' | 'intervalMs' | 'debounceMs' | 'minGapMs' | 'host'>> & Options;
let current: Runner | undefined;
let stopping: Promise<void> | undefined;

class Runner {
  o: Settings;
  store?: Store;
  lock?: Held;
  timer?: NodeJS.Timeout;
  debounce?: NodeJS.Timeout;
  inflight?: Promise<void>;
  periodicAt = 0;
  lastStart = 0;
  again = false;
  stopped = false;
  status: Status;
  constructor(o: Settings) {
    this.o = o;
    this.status = { host: o.host, home: o.home, pid: process.pid, node: process.version, startedAt: new Date().toISOString(),
      lock: 'waiting', running: false, passes: 0 };
  }
  emit() { this.o.onState?.(this.status); }
  /** The periodic pass keeps its own fixed deadlines: event passes neither move nor replace it. */
  armPeriodic() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.periodicAt += this.o.intervalMs;
      if (this.periodicAt <= Date.now()) this.periodicAt = Date.now() + this.o.intervalMs; // slept or stalled past several periods
      this.armPeriodic();
      void this.pass('interval');
    }, Math.max(0, this.periodicAt - Date.now()));
    this.timer.unref?.();
  }
  /** One pass at most in flight; a request during a pass queues exactly one more. */
  pass(reason: string): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.inflight) { this.again = true; return this.inflight; }
    this.inflight = this.run(reason).finally(() => {
      this.inflight = undefined;
      if (this.again && !this.stopped) { this.again = false; void this.pass('queued'); }
    });
    return this.inflight;
  }
  async run(reason: string) {
    const started = performance.now(), startedAt = new Date().toISOString();
    this.lastStart = Date.now();
    try {
      if (!this.lock) {
        const got = acquire(this.o.home, this.o.host);
        if ('by' in got) {
          this.status.lock = 'waiting'; this.status.lockedBy = got.by;
          this.emit();
          return;
        }
        this.lock = got.held; this.status.lock = 'held'; delete this.status.lockedBy;
      }
      this.store ??= new Store(this.o.home);
      this.status.running = true; this.emit();
      const timings: Record<string, number> = {};
      const errors = await cycle(this.store, this.o.env, timings);
      const pass: Pass = { reason, startedAt, finishedAt: new Date().toISOString(), ms: Math.round(performance.now() - started), timings, errors };
      this.status.passes++; this.status.lastPass = pass;
      this.status.counts = this.counts();
      this.o.onPass?.(pass);
    } catch (error) {
      this.status.lastError = String(error);
      this.status.lastPass = { reason, startedAt, finishedAt: new Date().toISOString(), ms: Math.round(performance.now() - started), timings: {}, errors: [String(error)] };
      this.o.onPass?.(this.status.lastPass);
    } finally {
      this.status.running = false; this.emit();
    }
  }
  counts(): NonNullable<Status['counts']> {
    const db = this.store!.db, sources: Record<string, number> = {};
    for (const row of db.prepare('SELECT kind, COUNT(*) AS n FROM sources GROUP BY kind').all()) sources[String(row.kind)] = Number(row.n);
    const size = (name: string) => { try { return statSync(join(this.o.home, name)).size; } catch { return 0; } };
    return { sources, blobs: Number(db.prepare('SELECT COUNT(*) AS n FROM archive.blobs').get()!.n),
      bytes: { ledger: size('ledger.sqlite'), archive: size('archive.sqlite') } };
  }
}

/** Starts ingesting: an immediate pass, then one every intervalMs on a fixed schedule. Waits (retrying each interval) while another host holds the lock. */
export function start(options: Options = {}): Status {
  if (stopping) throw new Error('ingest is still stopping; await stop() first');
  if (current) return current.status;
  const env = options.env ?? process.env;
  const runner = new Runner({ ...options, env, host: options.host ?? 'node', intervalMs: options.intervalMs ?? 60_000,
    debounceMs: options.debounceMs ?? 1_500, minGapMs: options.minGapMs ?? 5_000,
    home: options.home ?? env.AGENT_LEDGER_HOME ?? join(homedir(), '.agents/ledger') });
  current = runner;
  runner.periodicAt = Date.now() + runner.o.intervalMs;
  runner.armPeriodic();
  void runner.pass('start');
  return runner.status;
}
/** Asks for a pass soon. Calls inside the wait coalesce into one pass, and event passes start at least minGapMs apart. */
export function trigger(reason = 'trigger') {
  const r = current;
  if (!r || r.stopped || r.debounce) return;
  const at = Math.max(Date.now() + r.o.debounceMs, r.lastStart + r.o.minGapMs);
  r.debounce = setTimeout(() => { r.debounce = undefined; void r.pass(reason); }, at - Date.now());
  r.debounce.unref?.();
}
export function status(): Status | undefined { return current?.status; }
/** Stops the loop, waits for a pass in flight, closes the store, then releases the lock. Every caller gets the same promise. */
export function stop(): Promise<void> {
  if (stopping) return stopping;
  const r = current;
  if (!r) return Promise.resolve();
  r.stopped = true;
  clearTimeout(r.timer); clearTimeout(r.debounce);
  stopping = (async () => {
    await r.inflight?.catch(() => {});
    try { r.store?.db.close(); } finally { r.lock?.release(); }
    r.status.lock = 'stopped'; r.emit();
  })().finally(() => { current = undefined; stopping = undefined; });
  return stopping;
}
/** One pass under the lock; resolves {by} instead of running when another host holds it. */
export async function once(options: Options = {}) {
  const env = options.env ?? process.env, home = options.home ?? env.AGENT_LEDGER_HOME ?? join(homedir(), '.agents/ledger');
  const got = acquire(home, options.host ?? 'node-once');
  if ('by' in got) return { by: got.by };
  let store: Store | undefined;
  try {
    store = new Store(home);
    const timings: Record<string, number> = {};
    const errors = await cycle(store, env, timings);
    return { timings, errors };
  } finally { try { store?.db.close(); } finally { got.held.release(); } }
}

const _shape: IngestApi = { start, stop, status, trigger };
void _shape;
