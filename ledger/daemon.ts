import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Store } from './store.ts';
import { files, ingestFile, missing } from './files.ts';
import { snapshot } from './orca.ts';

export async function cycle(store: Store, env = process.env, timings?: Record<string, number>) {
  const errors: string[] = [];
  const paths = {
    claude: '.claude/projects', codex: '.codex/sessions', copilot: '.copilot/session-state',
    jcode: '.jcode/sessions', hermes: '.hermes/state.db', rtk: 'Library/Application Support/rtk/history.db',
  };
  for (const [kind, fallback] of Object.entries(paths)) {
    const started = performance.now();
    const root = resolve(env['AGENT_LEDGER_'+kind.toUpperCase()] || join(homedir(),fallback));
    const seen = new Set<string>();
    const unreadable: string[] = [];
    try {
      store.db.exec('BEGIN IMMEDIATE');
      for (const path of kind === 'hermes' || kind === 'rtk' ? [root] : files(root,kind,(dir,error) => {
        unreadable.push(dir+sep);
        errors.push(dir+': '+error);
      })) {
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
        if (!seen.has(String(row.path)) && !unreadable.some(dir => String(row.path).startsWith(dir))) store.db.prepare('UPDATE sources SET source_gone_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
      }
      store.db.exec('COMMIT');
    } catch (error) { if (store.db.isTransaction) store.db.exec('ROLLBACK'); errors.push(kind+': '+error); }
    if (timings) timings[kind] = Math.round(performance.now() - started);
  }
  const started = performance.now();
  try {
    await snapshot(store,env.AGENT_LEDGER_ORCA || 'orca',errors);
  } catch (error) { errors.push('orca: '+error); }
  if (timings) timings.orca = Math.round(performance.now()-started);
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
        const timings = once ? {} : undefined;
        const errors = await cycle(store, process.env, timings);
        if (once) console.log(JSON.stringify({wall_ms: timings}));
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
