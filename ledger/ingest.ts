// Host-independent ingest loop: the launchd daemon (daemon.ts) and the Orca plugin worker both
// call start()/stop(). One host at a time ingests into a ledger directory (ingest.lock).
import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, utimesSync, writeSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { Store } from './store.ts';
import { cycle } from './cycle.ts';

export type Pass = { reason: string, startedAt: string, finishedAt: string, ms: number, timings: Record<string, number>, errors: string[] };
export type Options = {
  /** Ledger directory; default AGENT_LEDGER_HOME or ~/.agents/ledger. */
  home?: string,
  env?: NodeJS.ProcessEnv,
  intervalMs?: number,
  /** Debounce for trigger(), ms. */
  debounceMs?: number,
  /** Label written into the lock file and /health, e.g. "orca-plugin" or "launchd". */
  host?: string,
  onPass?: (pass: Pass) => void,
  onState?: (state: Status) => void,
};
export type Status = {
  host: string, home: string, pid: number, node: string, startedAt: string,
  lock: 'held' | 'waiting' | 'stopped', lockedBy?: string,
  running: boolean, passes: number, lastPass?: Pass, lastError?: string,
  counts?: { sources: Record<string, number>, blobs: number, bytes: { ledger: number, archive: number } },
};

const STALE_MS = 5 * 60_000;
type Held = { path: string, token: string };

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
/** Takes ingest.lock, or says who holds it. A lock whose process is gone, or untouched for 5 minutes, is taken over. */
export function acquire(home: string, host: string): { held: Held } | { by: string } {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const path = join(home, 'ingest.lock');
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      writeSync(fd, JSON.stringify({ pid: process.pid, host, token, since: new Date().toISOString() }));
      closeSync(fd);
      return { held: { path, token } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    let info: { pid?: number, host?: string } = {};
    try { info = JSON.parse(readFileSync(path, 'utf8')); } catch { /* unreadable: treat as stale below */ }
    let age = Infinity;
    try { age = Date.now() - statSync(path).mtimeMs; } catch { continue; }
    if (info.pid && info.pid !== process.pid && alive(info.pid) && age < STALE_MS) return { by: `${info.host ?? '?'} pid ${info.pid}` };
    try { unlinkSync(path); } catch { /* raced with another taker: retry */ }
  }
  return { by: 'unknown' };
}
function release(lock: Held) {
  try {
    if (JSON.parse(readFileSync(lock.path, 'utf8')).token === lock.token) unlinkSync(lock.path);
  } catch { /* already gone */ }
}

let current: Runner | undefined;
class Runner {
  store?: Store;
  lock?: Held;
  timer?: NodeJS.Timeout;
  debounce?: NodeJS.Timeout;
  inflight?: Promise<void>;
  again = false;
  stopped = false;
  status: Status;
  o: Required<Pick<Options, 'home' | 'env' | 'intervalMs' | 'debounceMs' | 'host'>> & Options;
  constructor(o: Required<Pick<Options, 'home' | 'env' | 'intervalMs' | 'debounceMs' | 'host'>> & Options) {
    this.o = o;
    this.status = { host: o.host, home: o.home, pid: process.pid, node: process.version, startedAt: new Date().toISOString(),
      lock: 'waiting', running: false, passes: 0 };
  }
  emit() { this.o.onState?.(this.status); }
  schedule(delay: number) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.pass('interval'); }, Math.max(0, delay));
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
      try { const now = new Date(); utimesSync(this.lock.path, now, now); } catch { /* lock heartbeat */ }
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
      this.schedule(this.o.intervalMs - (performance.now() - started));
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

/** Starts ingesting: an immediate pass, then one every intervalMs. Waits (retrying each interval) while another host holds the lock. */
export function start(options: Options = {}): Status {
  if (current) return current.status;
  const env = options.env ?? process.env;
  const runner = new Runner({ ...options, env, host: options.host ?? 'node', intervalMs: options.intervalMs ?? 60_000, debounceMs: options.debounceMs ?? 1_500,
    home: options.home ?? env.AGENT_LEDGER_HOME ?? join(homedir(), '.agents/ledger') });
  current = runner;
  void runner.pass('start');
  return runner.status;
}
/** Asks for a pass soon (debounced); a burst of calls makes one pass. */
export function trigger(reason = 'trigger') {
  const r = current;
  if (!r || r.stopped) return;
  clearTimeout(r.debounce);
  r.debounce = setTimeout(() => { void r.pass(reason); }, r.o.debounceMs);
  r.debounce.unref?.();
}
export function status(): Status | undefined { return current?.status; }
/** Stops the loop, waits for a pass in flight, closes the store and releases the lock. */
export async function stop() {
  const r = current;
  if (!r) return;
  current = undefined;
  r.stopped = true;
  clearTimeout(r.timer); clearTimeout(r.debounce);
  await r.inflight?.catch(() => {});
  r.store?.db.close();
  if (r.lock) release(r.lock);
  r.status.lock = 'stopped'; r.emit();
}
/** One pass under the lock; resolves {by} instead of running when another host holds it. */
export async function once(options: Options = {}) {
  const env = options.env ?? process.env, home = options.home ?? env.AGENT_LEDGER_HOME ?? join(homedir(), '.agents/ledger');
  const got = acquire(home, options.host ?? 'node-once');
  if ('by' in got) return { by: got.by };
  const store = new Store(home);
  try {
    const timings: Record<string, number> = {};
    const errors = await cycle(store, env, timings);
    return { timings, errors };
  } finally { store.db.close(); release(got.held); }
}
