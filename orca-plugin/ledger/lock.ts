// One host ingests into a ledger directory at a time. The lock is an exclusive SQLite lock held on
// ingest.lock.db for as long as the holder lives: SQLite takes it with fcntl byte-range locks, so the
// OS drops it when the process dies, a second connection in the same process is refused too, and
// there is no stale threshold, owner-record race or PID reuse to reason about. ingest.lock.info is
// only a note about who holds it, for messages.
import { chmodSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { ensurePrivateHome, tightenFiles } from './private.ts';

export type Held = { db: DatabaseSync; info: string; token: string; release(): void };

const busy = (error: unknown) => /locked|busy/i.test(String((error as Error)?.message)) || (error as { errcode?: number }).errcode === 5;

export function holder(home: string) {
  try {
    const { host, pid } = JSON.parse(readFileSync(join(home, 'ingest.lock.info'), 'utf8'));
    return `${host ?? 'another host'} pid ${pid}`;
  } catch {
    return 'another host';
  }
}

/** Takes the lock, or says who holds it. Call before opening the ledger databases; release after closing them. `onLocked` is a test hook that runs right after the lock is taken. */
export function acquire(home: string, host: string, onLocked?: () => void): { held: Held } | { by: string } {
  ensurePrivateHome(home);
  const db = new DatabaseSync(join(home, 'ingest.lock.db'));
  const info = join(home, 'ingest.lock.info'),
    token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (JSON.parse(readFileSync(info, 'utf8')).token === token) unlinkSync(info);
    } catch {
      /* gone or replaced */
    }
    try {
      db.exec('ROLLBACK');
    } catch {
      /* not in a transaction */
    }
    try {
      db.close();
    } catch {
      /* already closed */
    }
  };
  try {
    db.exec('PRAGMA busy_timeout=0');
    db.exec('BEGIN EXCLUSIVE');
  } catch (error) {
    released = true;
    try {
      db.close();
    } catch {
      /* nothing to release */
    }
    if (busy(error)) return { by: holder(home) };
    throw error;
  }
  // Everything after the lock is taken is under cleanup: a failure here closes the connection before it escapes.
  try {
    onLocked?.();
    // `ingest.lock` was the lock file of builds before the SQLite lock. No such host runs any more (a plugin
    // reload starts a new worker process), so a leftover file is only debris: no pid checks, no waiting.
    try {
      unlinkSync(join(home, 'ingest.lock'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; // anything but "not there" means we cannot be sure the way is clear
    }
    tightenFiles(home);
    try {
      writeFileSync(info + '.tmp', JSON.stringify({ pid: process.pid, host, token, since: new Date().toISOString() }), { mode: 0o600 });
      renameSync(info + '.tmp', info);
      chmodSync(info, 0o600);
    } catch {
      /* best effort: the note does not affect exclusion */
    }
    return { held: { db, info, token, release } };
  } catch (error) {
    release();
    throw error;
  }
}
