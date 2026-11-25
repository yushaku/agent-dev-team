import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Store } from './store.ts';

/** The installed-agent inventory changes rarely: fetch it at most this often, whether the last try worked or not. */
export const AGENT_INVENTORY_TTL_MS = 10 * 60 * 1000;
/** A hung `orca agent installed` is killed after this long. */
export const INVENTORY_TIMEOUT_MS = 5000;
export type AgentLabel = { id: string; name: string };

/** Runs `binary agent installed --json`; resolves with its stdout, or null on failure, after `ms`, or when `signal` aborts (the child is then killed with SIGKILL and not waited for). */
function installed(binary: string, ms: number, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    let child: ReturnType<typeof spawn> | undefined;
    const finish = (value: Buffer | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (value === null) {
        child?.kill('SIGKILL');
        child?.stdout?.destroy();
      }
      resolve(value === null ? null : value.toString('utf8'));
    };
    const abort = () => finish(null);
    const timer = setTimeout(abort, ms);
    if (signal.aborted) return finish(null);
    signal.addEventListener('abort', abort);
    try {
      child = spawn(binary, ['agent', 'installed', '--json'], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return finish(null);
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 1024 * 1024) finish(null);
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code === 0 ? Buffer.concat(chunks) : null));
  });
}

/** The one short write of a successful answer, on its own connection that never waits for a lock (the ingest connection waits up to 30 s). Busy: the caller retries later. */
function save(home: string, agents: AgentLabel[], now: number): boolean {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(join(home, 'ledger.sqlite'));
    db.exec('PRAGMA busy_timeout=0');
    db.prepare('INSERT OR REPLACE INTO agent_inventory(id,fetched_at,data) VALUES(1,?,?)').run(now, JSON.stringify(agents));
    return true;
  } catch {
    return false;
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

/**
 * Orca's installed agents (`orca agent installed --json`), cached in the ledger. It is optional metadata owned by whoever runs the ingest pass:
 * `refresh()` starts the command without touching the database (so a busy ledger cannot delay the pass) and returns at once; only a successful
 * answer is written, in one short step on its own non-waiting connection, and only while still open. `close()` aborts and kills the child.
 * The cooldown (TTL) is in memory and starts when an attempt finishes, so abandoned work leaves no cooldown. `fetched_at` is the last success.
 */
export class Inventory {
  private tried = Number.NEGATIVE_INFINITY;
  private running: Promise<void> | undefined;
  private closed = false;
  private readonly abort = new AbortController();
  private readonly home: string;
  constructor(home: string) {
    this.home = home;
  }
  /** Starts a refresh when none is running and the last attempt is older than the TTL. Never throws and never waits. */
  refresh(binary: string, now = Date.now(), timeoutMs = INVENTORY_TIMEOUT_MS) {
    if (this.closed || this.running || now - this.tried < AGENT_INVENTORY_TTL_MS) return;
    this.running = this.run(binary, now, timeoutMs)
      .catch(() => {})
      .finally(() => {
        this.running = undefined;
      });
  }
  private async run(binary: string, now: number, timeoutMs: number) {
    const stdout = await installed(binary, timeoutMs, this.abort.signal);
    if (this.abort.signal.aborted) return;
    this.tried = now;
    let agents: AgentLabel[] | null = null;
    try {
      const parsed = stdout === null ? null : JSON.parse(stdout);
      if (parsed && parsed.ok !== false && Array.isArray(parsed.result?.agents)) {
        agents = parsed.result.agents
          .filter((a: { id?: unknown; name?: unknown }) => typeof a?.id === 'string' && a.id && typeof a.name === 'string' && a.name)
          .map((a: AgentLabel) => ({ id: a.id, name: a.name }));
      }
    } catch {}
    if (!agents) return;
    // Busy ledger: try again shortly, without blocking the thread; give up (no cooldown) if closed meanwhile.
    for (let attempt = 0; attempt < 20 && !this.abort.signal.aborted; attempt++) {
      if (save(this.home, agents, now)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.tried = Number.NEGATIVE_INFINITY;
  }
  /** Resolves when the running refresh (if any) has ended. */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }
  /** Gives a running refresh up to `graceMs` to finish, then aborts it (killing the child), waits for it to settle and refuses new ones. */
  async close(graceMs = 0) {
    if (this.running && graceMs > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      // The grace timer must not outlive a refresh that settles first: a pending timer would keep a one-shot process alive for its full length.
      await Promise.race([this.running, new Promise((resolve) => (timer = setTimeout(resolve, graceMs)))]);
      clearTimeout(timer);
    }
    this.closed = true;
    this.abort.abort();
    await this.running;
  }
}

const owners = new WeakMap<Store, Inventory>();
/** The inventory refresher of this store; the runner that owns the store closes it before closing the database. */
export function inventoryOf(store: Store): Inventory {
  let inventory = owners.get(store);
  if (!inventory) owners.set(store, (inventory = new Inventory(store.home)));
  return inventory;
}

/** Labels older than this (since the last success) are not shown: the dashboard falls back to raw ids. */
export const AGENT_LABELS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The cached labels while the last successful answer is at most 24 h old (`now` in ms); empty when Orca never answered or the answer is older. */
export function readAgents(db: DatabaseSync, now = Date.now()): AgentLabel[] {
  const row = db.prepare('SELECT fetched_at, data FROM agent_inventory WHERE id=1').get();
  if (!row || now - Number(row.fetched_at) > AGENT_LABELS_MAX_AGE_MS) return [];
  try {
    return JSON.parse(String(row.data));
  } catch {
    return [];
  }
}
