// node ledger/scripts/parity.ts DIR (or set AGENT_LEDGER_PARITY_DIR).
// Use agent-named subdirectories for arbitrary filenames, or native source layouts.
// All writes, including SQLite backups and the rebuilt ledger, are under a private temporary directory.
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  truncateSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { PARSER_VERSION, projections } from '../derived.ts';
import { ingestFile } from '../files.ts';
import { Store } from '../store.ts';

class InputError extends Error {}

type Agent = 'claude' | 'codex' | 'copilot' | 'jcode' | 'hermes' | 'rtk';

function kind(path: string): Agent | undefined {
  const name = basename(path);
  const directories = dirname(path).split(sep);
  if (name === 'state.db') return 'hermes';
  if (name === 'history.db') return 'rtk';
  if (name === 'events.jsonl') return 'copilot';
  if (name.endsWith('.json') && directories.some((dir) => ['.jcode', 'jcode'].includes(dir))) return 'jcode';
  if (!name.endsWith('.jsonl')) return;
  for (const agent of ['codex', 'claude'] as const) {
    if (directories.some((dir) => dir === agent || dir === '.' + agent) || name.startsWith(agent + '_'))
      return agent;
  }
  if (name.startsWith('rollout-')) return 'codex';
  if (name.startsWith('agent-') || /^[a-f\d-]{36}\.jsonl$/i.test(name)) return 'claude';
  throw new InputError(
    'Unrecognized JSONL filename. Use claude/ or codex/ for arbitrary transcript names and events.jsonl for Copilot.',
  );
}

function* sources(dir: string, scratch: string): Generator<[Agent, string]> {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && path !== scratch) yield* sources(path, scratch);
    if (entry.isFile()) {
      const agent = kind(path);
      if (agent) yield [agent, path];
    }
  }
}

async function parity(dir: string, scratch: string) {
  const store = new Store(join(scratch, 'ledger'));
  let count = 0;
  try {
    for (const [agent, path] of sources(dir, scratch)) {
      // Retain basename and /subagents/ because the legacy parsers derive IDs from them.
      const copy = join(scratch, 'sources', path);
      mkdirSync(dirname(copy), { recursive: true });
      if (agent === 'hermes' || agent === 'rtk') {
        const original = new DatabaseSync(path, { readOnly: true });
        try {
          await backup(original, copy);
        } finally {
          original.close();
        }
      } else copyFileSync(path, copy);
      store.db.exec('BEGIN IMMEDIATE');
      try {
        if (agent === 'copilot') {
          const sidecar = join(dirname(path), 'workspace.yaml');
          if (existsSync(sidecar) && lstatSync(sidecar).isFile()) {
            const metadata = join(dirname(copy), 'workspace.yaml');
            copyFileSync(sidecar, metadata);
            ingestFile(store, agent, metadata);
          }
        }
        ingestFile(store, agent, copy);
        store.db.exec('COMMIT');
      } catch (error) {
        store.db.exec('ROLLBACK');
        throw error;
      }
      if (copy.endsWith('.jsonl')) {
        // Ingest defers a trailing unterminated event until its writer finishes the line.
        const row = store.db
          .prepare('SELECT offset,size FROM cursors JOIN sources ON source=id WHERE path=?')
          .get(copy)!;
        if (row.offset !== row.size) {
          chmodSync(copy, 0o600);
          truncateSync(copy, Number(row.offset));
        }
      }
      count++;
    }
    if (!count) throw new InputError('No recognized source files.');
    projections(store)();
  } finally {
    store.db.close();
  }
  execFileSync(
    'python3',
    [
      join(import.meta.dirname, 'parity.py'),
      join(scratch, 'ledger', 'ledger.sqlite'),
      String(PARSER_VERSION),
    ],
    {
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
}

const dir = process.argv[2] || process.env.AGENT_LEDGER_PARITY_DIR;
if (!dir || process.argv.length > 3) {
  console.error('Usage: node ledger/scripts/parity.ts DIRECTORY');
  process.exitCode = 2;
} else {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'ledger-parity-')));
  try {
    await parity(realpathSync(dir), scratch);
  } catch (error) {
    // OS and parser exceptions can contain private paths, transcript excerpts, and session IDs.
    if (error instanceof InputError) console.error(error.message);
    else if (!(error as { status?: number }).status)
      console.error('Could not snapshot or project source files:', (error as Error).name);
    process.exitCode = 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
