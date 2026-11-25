// The ledger holds raw conversations: keep its directory and files private to this user, even when
// the directory already existed (mkdir leaves an existing mode alone) or the process umask is 022.
import { chmodSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FILES = ['ledger.sqlite', 'archive.sqlite', 'ingest.lock.db', 'ingest.lock.info'];

export function ensurePrivateHome(home: string) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const me = process.getuid?.();
  const dir = statSync(home);
  if (me !== undefined && dir.uid !== me) {
    throw new Error(`ledger home ${home} is owned by uid ${dir.uid}, not by you (uid ${me}); set AGENT_LEDGER_HOME to a directory you own`);
  }
  if (dir.mode & 0o077) chmodSync(home, 0o700);
  tightenFiles(home);
}
/** Files SQLite created with the process umask, and any left by an older run, drop to 0600. Journals inherit the database's mode. */
export function tightenFiles(home: string) {
  for (const name of FILES.flatMap((f) => [f, f + '-journal', f + '-wal', f + '-shm'])) {
    const path = join(home, name);
    try {
      if (statSync(path).mode & 0o077) chmodSync(path, 0o600);
    } catch (error) {
      // A closing holder may remove its note between the inspection and the chmod.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
