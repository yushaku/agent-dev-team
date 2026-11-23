import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Store } from './store.ts';
import { files, ingestFile, missing } from './files.ts';
import { snapshot } from './orca.ts';

export function cycle(store: Store, env = process.env) {
  const errors: string[] = [];
  const paths = {
    claude: '.claude/projects', codex: '.codex/sessions', copilot: '.copilot/session-state',
    jcode: '.jcode/sessions', hermes: '.hermes/state.db', rtk: 'Library/Application Support/rtk/history.db',
  };
  for (const [kind, fallback] of Object.entries(paths)) {
    const root = resolve(env['AGENT_LEDGER_'+kind.toUpperCase()] || join(homedir(),fallback));
    const seen = new Set<string>();
    store.db.exec('BEGIN IMMEDIATE');
    try {
      for (const path of kind === 'hermes' || kind === 'rtk' ? [root] : files(root,kind)) {
        store.db.exec('SAVEPOINT file');
        try {
          ingestFile(store,kind,path);
          seen.add(path);
        } catch (error) {
          store.db.exec('ROLLBACK TO file');
          if (!missing(error)) { seen.add(path); errors.push(path+': '+error); }
        }
        store.db.exec('RELEASE file');
      }
      for (const row of store.db.prepare('SELECT id,path FROM sources WHERE kind=? AND source_gone_at IS NULL').all(kind)) {
        if (!seen.has(String(row.path))) store.db.prepare('UPDATE sources SET source_gone_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
      }
      store.db.exec('COMMIT');
    } catch (error) { store.db.exec('ROLLBACK'); errors.push(kind+': '+error); }
  }
  store.db.exec('BEGIN IMMEDIATE');
  try {
    snapshot(store,env.AGENT_LEDGER_ORCA || 'orca',errors);
    store.db.exec('COMMIT');
  } catch (error) { store.db.exec('ROLLBACK'); errors.push('orca: '+error); }
  return errors;
}

if (import.meta.main) {
  process.umask(0o077);
  const once = process.argv.includes('--once');
  const store = new Store(process.env.AGENT_LEDGER_HOME || join(homedir(),'.agents/ledger'));
  try {
    do {
      const started = performance.now();
      try {
        const errors = cycle(store);
        for (const message of errors) console.error(message);
        if (once && errors.length) process.exitCode = 1;
      } catch (error) {
        console.error(error);
        if (once) process.exitCode = 1;
      }
      if (!once) await sleep(Math.max(0, 60000 - (performance.now() - started)));
    } while (!once);
  } finally { store.db.close(); }
}
