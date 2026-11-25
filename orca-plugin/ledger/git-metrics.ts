import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { Worker } from 'node:worker_threads';
import { PARSER_VERSION } from './derived.ts';
import { GIT_METRICS_VERSION as version, unavailable } from './git-defects.ts';
import { checkout, dir, home, repoOf } from './metadata.ts';
import type { RepositoryMetrics } from './protocol.ts';

const run = promisify(execFile);
const retryMs = 5 * 60_000;
const probeMs = 30_000;
interface Repository {
  metrics: RepositoryMetrics;
  refs: Set<string>;
  mergedBranches: Set<string> | null;
}
function empty(): Repository {
  return { metrics: unavailable('default_branch_unavailable'), refs: new Set(), mergedBranches: null };
}
function latest(db: DatabaseSync, repo: string) {
  return db.prepare('SELECT head,value FROM dashboard_git WHERE repo=? AND version=? ORDER BY rowid DESC LIMIT 1').get(repo, version);
}
export function cachedRepository(db: DatabaseSync, repo: string | null): Repository {
  const row = repo && latest(db, repo);
  const result = empty();
  if (row) result.metrics = JSON.parse(String(row.value));
  return result;
}
async function git(repo: string, ...args: string[]) {
  try {
    return (await run('git', ['-C', repo, ...args], { timeout: 30_000, maxBuffer: 32 << 20 })).stdout.trim();
  } catch (error) {
    if (error.killed || error.code === 'ETIMEDOUT') throw new Error('git_timeout:' + args[0]);
    return null;
  }
}
async function inspect(repo: string) {
  const branches = await git(repo, 'for-each-ref', '--format=%(refname:lstrip=2) %(objectname)', 'refs/heads/');
  const heads = new Map<string, string>();
  for (const line of (branches || '').split('\n')) {
    const [name, sha] = line.split(' ');
    if (sha) heads.set(name, sha);
  }
  const def =
    (await git(repo, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'))?.replace(/^refs\/remotes\/origin\//, '') ||
    ['main', 'master'].find((n) => heads.has(n));
  const head = heads.get(def);
  if (!head) throw new Error('default_branch_unavailable');
  const merged = await git(repo, 'for-each-ref', '--merged=' + head, '--format=%(refname:lstrip=2)', 'refs/heads/');
  return {
    head,
    refs: new Set(heads.keys()),
    mergedBranches: merged === null ? null : new Set(merged.split('\n')),
  };
}
interface Entry extends Repository {
  repo: string;
  head: string;
  cachedHead: string;
  checked: number;
}
interface Result {
  metrics: RepositoryMetrics;
  elapsed_ms: number;
}

export class GitMetrics {
  private states = new Map<string, Entry>();
  private checks = new Set<Entry>();
  private jobs = new Map<Entry, string>();
  private worker: Worker | null = null;
  private checking = false;
  private closed = false;
  private timer: NodeJS.Timeout;
  private db: DatabaseSync;
  revision = 0;
  constructor(db: DatabaseSync) {
    this.db = db;
    db.exec(
      'CREATE TABLE IF NOT EXISTS dashboard_git_attempts(repo TEXT,head TEXT,version INTEGER,checked_at INTEGER,elapsed_ms INTEGER,error TEXT,PRIMARY KEY(repo,head,version))',
    );
    this.timer = setInterval(() => {
      for (const repo of this.states.keys()) this.lookup(repo);
    }, probeMs).unref();
  }
  lookup(repo: string | null): Repository {
    if (!repo || this.closed) {
      const state = empty();
      state.metrics = { ...state.metrics, stale: false, loading: false };
      return state;
    }
    let state = this.states.get(repo);
    if (!state) {
      const row = latest(this.db, repo);
      state = { ...empty(), repo, cachedHead: row ? String(row.head) : '', head: '', checked: 0 };
      state.metrics = {
        ...(row ? JSON.parse(String(row.value)) : unavailable(null)),
        stale: !!row,
        loading: true,
      };
      this.states.set(repo, state);
      const failed = this.attempt(repo, '');
      if (failed) {
        this.failed(state, String(failed.error), Number(failed.elapsed_ms));
        state.checked = Number(failed.checked_at) + retryMs - probeMs;
      }
    }
    if (Date.now() - state.checked >= probeMs) {
      state.checked = Date.now();
      this.checks.add(state);
      void this.probe();
    }
    return state;
  }
  private warmed = false;
  warm() {
    if (this.closed || this.warmed) return;
    const rows = this.db
      .prepare(
        `SELECT json_extract(data,'$.cwd') AS cwd FROM dashboard_sessions WHERE version=?
      UNION SELECT json_extract(segment.value,'$.cwd') AS cwd FROM dashboard_sessions,
        json_each(data,'$.branch_segments') segment WHERE version=?`,
      )
      .all(PARSER_VERSION, PARSER_VERSION);
    this.warmed = rows.some((row) => typeof row.cwd === 'string' && row.cwd.length > 0);
    for (const { cwd } of rows) {
      if (typeof cwd !== 'string' || !cwd) continue;
      const root = checkout(cwd);
      const fallback = root || join(home, 'orca/projects', repoOf(cwd)[0]);
      if (root || dir(fallback)) this.lookup(fallback);
    }
  }
  private attempt(repo: string, head: string) {
    return this.db
      .prepare('SELECT * FROM dashboard_git_attempts WHERE repo=? AND head=? AND version=? AND error IS NOT NULL AND checked_at>?')
      .get(repo, head, version, Date.now() - retryMs);
  }
  private saveAttempt(repo: string, head: string, error: string | null, elapsed: number) {
    this.db.prepare('INSERT OR REPLACE INTO dashboard_git_attempts VALUES(?,?,?,?,?,?)').run(repo, head, version, Date.now(), elapsed, error);
    console.error('[ledger/git]', JSON.stringify({ repo, head, elapsed_ms: elapsed, outcome: error || 'ok' }));
  }
  private failed(state: Entry, error: string, elapsed: number) {
    state.metrics = {
      ...state.metrics,
      error,
      stale: !!state.cachedHead,
      loading: false,
      analysis_ms: elapsed,
    };
    this.revision++;
  }
  private async probe() {
    if (this.checking) return;
    this.checking = true;
    try {
      while (!this.closed && this.checks.size) {
        const state = this.checks.values().next().value!;
        this.checks.delete(state);
        const start = performance.now();
        try {
          const info = await inspect(state.repo);
          if (this.closed) return;
          if (
            [...state.refs].join('\n') !== [...info.refs].join('\n') ||
            [...(state.mergedBranches || [])].join('\n') !== [...(info.mergedBranches || [])].join('\n')
          )
            this.revision++;
          Object.assign(state, info);
          if (state.cachedHead === info.head && !state.metrics.loading && !state.metrics.error) continue;
          const row = this.db.prepare('SELECT value FROM dashboard_git WHERE repo=? AND head=? AND version=?').get(state.repo, info.head, version);
          if (row) {
            const timing = this.db
              .prepare('SELECT elapsed_ms FROM dashboard_git_attempts WHERE repo=? AND head=? AND version=?')
              .get(state.repo, info.head, version);
            state.metrics = {
              ...JSON.parse(String(row.value)),
              stale: false,
              loading: false,
              ...(timing ? { analysis_ms: timing.elapsed_ms } : {}),
            };
            state.cachedHead = info.head;
            this.revision++;
          } else {
            const failed = this.attempt(state.repo, state.head);
            if (failed) {
              if (state.metrics.error !== failed.error || state.metrics.loading) this.failed(state, String(failed.error), Number(failed.elapsed_ms));
              continue;
            }
            if (!state.metrics.loading || state.metrics.error) {
              state.metrics = { ...state.metrics, loading: true, stale: !!state.cachedHead, error: null };
              this.revision++;
            }
            if (this.active?.state !== state || this.active.head !== state.head) this.jobs.set(state, state.head);
            this.analyze();
          }
        } catch (error) {
          if (this.closed) return;
          const elapsed = Math.round(performance.now() - start),
            message = error.message;
          state.head = '';
          this.jobs.delete(state);
          this.saveAttempt(state.repo, '', message, elapsed);
          this.failed(state, message, elapsed);
          state.checked = Date.now() + retryMs - probeMs;
        }
      }
    } finally {
      this.checking = false;
    }
  }
  private active: { state: Entry; head: string } | null = null;
  private analyze() {
    if (this.active || this.closed || !this.jobs.size) return;
    const [state, head] = this.jobs.entries().next().value!;
    this.jobs.delete(state);
    if (state.head !== head) {
      this.analyze();
      return;
    }
    this.active = { state, head };
    const start = performance.now();
    const worker = (this.worker = new Worker(new URL('./git-defects.ts', import.meta.url), {
      workerData: { job: 'git-defects', repo: state.repo, head },
    }));
    const finish = ({ metrics, elapsed_ms }: Result) => {
      if (this.worker !== worker || this.closed) return;
      this.active = null;
      this.worker = null;
      this.saveAttempt(state.repo, head, metrics.error, elapsed_ms);
      if (!metrics.error) this.db.prepare('INSERT OR REPLACE INTO dashboard_git VALUES(?,?,?,?)').run(state.repo, head, version, JSON.stringify(metrics));
      if (state.head === head) {
        if (metrics.error) this.failed(state, metrics.error, elapsed_ms);
        else {
          state.cachedHead = head;
          state.metrics = { ...metrics, stale: false, loading: false, analysis_ms: elapsed_ms };
          this.revision++;
        }
      }
      this.analyze();
    };
    worker.once('message', finish);
    const failure = () =>
      finish({
        metrics: unavailable('git_worker_failed'),
        elapsed_ms: Math.round(performance.now() - start),
      });
    worker.once('error', failure);
    worker.once('exit', failure);
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
    this.checks.clear();
    this.jobs.clear();
    if (this.worker) void this.worker.terminate();
  }
}
