import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';
import type { Store } from './store.ts';
import { type HermesMessage, type HermesSession, parseFile, parseHermes } from './session.ts';
import { dirname, join, basename } from 'node:path';

export const PARSER_VERSION = 8;

// Match repeated records by occurrence. Place old-only records before the next shared
// record, or before the new tail if the streams have no further common anchor.
function union<T>(older: T[], newer: T[], key: (value: T) => string): T[] {
  const positions = new Map<string, number[]>();
  older.forEach((value, i) => {
    const k = key(value);
    const indexes = positions.get(k);
    if (indexes) indexes.push(i);
    else positions.set(k, [i]);
  });
  const counts = new Map<string, number>();
  const matches = newer.map((value) => {
    const k = key(value);
    const count = counts.get(k) || 0;
    counts.set(k, count + 1);
    return positions.get(k)?.[count];
  });
  const shared = new Set(matches);
  const result: T[] = [];
  let i = 0;
  function copyUntil(end: number) {
    while (i < end) {
      if (!shared.has(i)) result.push(older[i]);
      i++;
    }
  }
  const lastAnchor = matches.findLastIndex((index) => index !== undefined);
  newer.forEach((value, n) => {
    if (n > lastAnchor) copyUntil(older.length);
    else if (matches[n] !== undefined) copyUntil(matches[n]);
    result.push(value);
  });
  copyUntil(older.length);
  return result;
}

function mergeFile(kind: string, old: string, fresh: string) {
  if (kind === 'jcode') {
    const a = JSON.parse(old),
      b = JSON.parse(fresh);
    b.messages = union(a.messages || [], b.messages || [], (m: { id?: unknown }) => (m.id != null ? 'id:' + m.id : JSON.stringify(m)));
    return JSON.stringify(b);
  }
  if (fresh.startsWith(old)) return fresh;
  if (old.startsWith(fresh)) return old;
  return union(old.replace(/\n$/, '').split('\n'), fresh.replace(/\n$/, '').split('\n'), (line) => line).join('\n') + '\n';
}

export function projectionStatus({ db }: Store) {
  const row = db
    .prepare(
      `SELECT (SELECT count(*) FROM dashboard_errors WHERE version=?) AS errors,
    coalesce((SELECT max(id) FROM ingest_log),0) -
    coalesce((SELECT last_id FROM dashboard_cursor WHERE version=?),0) AS lag`,
    )
    .get(PARSER_VERSION, PARSER_VERSION)!;
  return { errors: Number(row.errors), lag: Number(row.lag) };
}

export function projections({ db }: Store, version = PARSER_VERSION) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_git(repo TEXT,head TEXT,version INTEGER,value TEXT,PRIMARY KEY(repo,head,version));
    CREATE TABLE IF NOT EXISTS dashboard_cursor(version INTEGER PRIMARY KEY, last_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS dashboard_jobs(version INTEGER,source INTEGER,generation INTEGER,first_id INTEGER,target INTEGER,
      PRIMARY KEY(version,source,generation));
    CREATE INDEX IF NOT EXISTS dashboard_job_order ON dashboard_jobs(version,first_id);
    CREATE TABLE IF NOT EXISTS dashboard_errors(version INTEGER,source INTEGER,generation INTEGER,error TEXT,at TEXT,
      PRIMARY KEY(version,source,generation));
    CREATE TABLE IF NOT EXISTS dashboard_files(version INTEGER,source INTEGER,generation INTEGER,sid TEXT,end_id INTEGER,
      PRIMARY KEY(version,source,generation));
    CREATE TABLE IF NOT EXISTS dashboard_sessions(version INTEGER,source INTEGER,generation INTEGER,sid TEXT,data TEXT,
      PRIMARY KEY(version,source,generation,sid));
    CREATE INDEX IF NOT EXISTS dashboard_session_identity ON dashboard_sessions(version,source,sid);
    CREATE TABLE IF NOT EXISTS dashboard_hermes(version INTEGER,source INTEGER,generation INTEGER,item TEXT,sid TEXT,hash TEXT,
      PRIMARY KEY(version,source,generation,item));
    CREATE INDEX IF NOT EXISTS dashboard_hermes_logical ON dashboard_hermes(version,source,sid,item,generation);
    CREATE TABLE IF NOT EXISTS dashboard_commands(version INTEGER,source INTEGER,generation INTEGER,item TEXT,
      timestamp TEXT,rtk_cmd TEXT,project_path TEXT,input_tokens INTEGER,output_tokens INTEGER,saved_tokens INTEGER,exec_time_ms INTEGER,
      PRIMARY KEY(version,source,generation,item));
    CREATE INDEX IF NOT EXISTS dashboard_command_identity ON dashboard_commands(version,source,item,timestamp);
    CREATE TABLE IF NOT EXISTS dashboard_orca(version INTEGER,source INTEGER,generation INTEGER,path TEXT,data TEXT,
      PRIMARY KEY(version,source,generation));
    CREATE INDEX IF NOT EXISTS dashboard_ingest_source ON ingest_log(source,generation,id);`);
  const cursor = db.prepare('SELECT last_id FROM dashboard_cursor WHERE version=?');
  const latest = db.prepare('SELECT coalesce(max(id),0) AS id FROM ingest_log');
  const next = db.prepare(`SELECT j.*,s.kind,s.path FROM dashboard_jobs j JOIN sources s ON s.id=j.source
    WHERE version=? ORDER BY first_id LIMIT 1`);
  const parts = db.prepare(`SELECT bytes FROM versions JOIN archive.blobs USING(hash)
    WHERE source=? AND generation=? ORDER BY cast(item AS INTEGER)`);
  // A failed rewrite may have changed versions in an older generation. For merged generations
  // use precisely the archive snapshot that last parsed successfully.
  const historicParts = db.prepare(`SELECT b.bytes FROM (
    SELECT item,hash,max(id) FROM ingest_log WHERE source=? AND generation=? AND id<=? GROUP BY item
    ) r JOIN archive.blobs b USING(hash) ORDER BY cast(r.item AS INTEGER)`);
  const rows = db.prepare(`SELECT item,hash,bytes FROM versions JOIN archive.blobs USING(hash)
    WHERE source=? AND generation=? AND item IN (SELECT item FROM ingest_log WHERE id>? AND source=? AND generation=?)`);
  const save = db.prepare('INSERT OR REPLACE INTO dashboard_sessions VALUES(?,?,?,?,?)');
  const removeSession = db.prepare('DELETE FROM dashboard_sessions WHERE version=? AND source=? AND sid=?');
  const command = db.prepare('INSERT OR REPLACE INTO dashboard_commands VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const removeRestoredCommand = db.prepare(`DELETE FROM dashboard_commands
    WHERE version=? AND source=? AND generation<>? AND item=? AND timestamp IS ? AND rtk_cmd IS ? AND project_path IS ?`);
  const message = db.prepare('INSERT OR REPLACE INTO dashboard_hermes VALUES(?,?,?,?,?,?)');
  const sessionRows = db.prepare(`SELECT item,bytes FROM dashboard_hermes JOIN archive.blobs USING(hash)
    WHERE version=? AND source=? AND sid=? ORDER BY generation,item`);
  const priorSession = db.prepare('SELECT sid FROM dashboard_hermes WHERE version=? AND source=? AND generation=? AND item=?');
  const directory = db.prepare("SELECT 1 FROM versions WHERE source=? AND generation=? AND item='directory'");
  function file(source: SQLInputValue, generation: SQLInputValue, endId?: number) {
    const chunks = endId === undefined ? parts.all(source, generation) : historicParts.all(source, generation, endId);
    return Buffer.concat(chunks.map((r) => Buffer.from(r.bytes as Uint8Array))).toString();
  }
  function sibling(path: string) {
    return db.prepare("SELECT id,generation FROM sources JOIN cursors ON sources.id=cursors.source WHERE kind='copilot' AND path=?").get(path);
  }
  function parse(kind: string, path: string, source: SQLInputValue, generation: SQLInputValue) {
    const meta: Record<string, string> = Object.create(null);
    if (kind === 'copilot') {
      const side = sibling(join(dirname(path), 'workspace.yaml'));
      if (side)
        for (const line of file(side.id, side.generation).split('\n')) {
          const m = /^([^ #\t-][^:]*):\s*(.*)$/.exec(line);
          if (m) meta[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
    }
    const start = performance.now();
    const bytes = file(source, generation);
    let replayBytes = Buffer.byteLength(bytes);
    try {
      let s = parseFile(kind, path, bytes, meta);
      let sid = s.id;
      if (
        (kind === 'codex' && sid === basename(path, '.jsonl') && !/"session_meta"/.test(bytes)) ||
        (kind === 'pi' && sid === basename(path, '.jsonl') && !/"type"\s*:\s*"session"/.test(bytes)) ||
        (kind === 'claude' && !s.sid)
      ) {
        sid = String(
          db
            .prepare('SELECT sid FROM dashboard_files WHERE version=? AND source=? AND generation<? ORDER BY generation DESC LIMIT 1')
            .get(version, source, generation)?.sid ?? sid,
        );
      }
      const previous = db.prepare('SELECT sid FROM dashboard_files WHERE version=? AND source=? AND generation=?').get(version, source, generation);
      const end = Number(db.prepare('SELECT max(id) AS id FROM ingest_log WHERE source=? AND generation=?').get(source, generation)!.id);
      db.prepare('INSERT OR REPLACE INTO dashboard_files VALUES(?,?,?,?,?)').run(version, source, generation, sid, end);
      const history = db
        .prepare('SELECT generation,end_id FROM dashboard_files WHERE version=? AND source=? AND sid=? ORDER BY generation')
        .all(version, source, sid);
      if (history.length > 1) {
        let merged = '';
        for (const old of history) {
          const text = old.generation === generation ? bytes : file(source, old.generation, Number(old.end_id));
          if (old.generation !== generation) replayBytes += Buffer.byteLength(text);
          merged = merged ? mergeFile(kind, merged, text) : text;
        }
        s = parseFile(kind, path, merged, meta);
      }
      if (previous && previous.sid !== sid) removeSession.run(version, source, previous.sid);
      removeSession.run(version, source, sid);
      save.run(version, source, history.at(-1)!.generation, sid, JSON.stringify(s));
    } finally {
      console.info(`dashboard replay source=${source} generation=${generation} bytes=${replayBytes} ms=${Math.round(performance.now() - start)}`);
    }
  }
  function project(job: Record<string, SQLOutputValue>, last: number) {
    const { source, generation } = job;
    // sources.kind and sources.path are TEXT NOT NULL.
    const kind = job.kind as string,
      path = job.path as string;
    if (kind === 'copilot' && directory.get(source, generation)) return;
    if (kind === 'hermes' || kind === 'rtk') {
      const dirty = new Set<string>();
      for (const { item, hash, bytes } of rows.iterate(source, generation, last, source, generation)) {
        const table = String(item).split('/')[0];
        if (!['commands', 'sessions', 'messages'].includes(table)) continue;
        const r = JSON.parse(Buffer.from(bytes as Uint8Array).toString());
        if (kind === 'rtk') {
          removeRestoredCommand.run(version, source, generation, item, r.timestamp ?? null, r.rtk_cmd ?? null, r.project_path ?? null);
          command.run(
            version,
            source,
            generation,
            item,
            ...['timestamp', 'rtk_cmd', 'project_path', 'input_tokens', 'output_tokens', 'saved_tokens', 'exec_time_ms'].map((k) => r[k] ?? null),
          );
        } else {
          const sid = table === 'sessions' ? r.id : r.session_id;
          if (sid == null) continue;
          const old = priorSession.get(version, source, generation, item);
          if (old) dirty.add(String(old.sid));
          message.run(version, source, generation, item, sid, hash);
          dirty.add(String(sid));
        }
      }
      for (const sid of dirty) {
        let session: HermesSession | undefined;
        const messages = new Map<unknown, HermesMessage>();
        for (const row of sessionRows.iterate(version, source, sid)) {
          const r = JSON.parse(Buffer.from(row.bytes as Uint8Array).toString());
          if (String(row.item).startsWith('sessions/')) session = r;
          else messages.set(r.id ?? row.item, r);
        }
        removeSession.run(version, source, sid);
        if (session && session.started_at != null) {
          const active = [...messages.values()].filter((r) => r.active === 1).sort((a, b) => a.timestamp - b.timestamp);
          save.run(version, source, generation, sid, JSON.stringify(parseHermes(session, active)));
        }
      }
    } else if (kind === 'orca')
      db.prepare('INSERT OR REPLACE INTO dashboard_orca VALUES(?,?,?,?,?)').run(version, source, generation, path, file(source, generation));
    else if (kind === 'copilot' && String(path).endsWith('/workspace.yaml')) {
      const events = join(dirname(String(path)), 'events.jsonl'),
        e = sibling(events);
      if (e) parse(kind, events, e.id, e.generation);
    } else parse(kind, path, source, generation);
  }
  let pruned = false;
  function prune() {
    for (const name of ['sessions', 'commands', 'orca', 'hermes', 'files', 'errors', 'jobs', 'cursor'])
      db.prepare(`DELETE FROM dashboard_${name} WHERE version<?`).run(version - 1);
  }
  function step() {
    let last = Number(cursor.get(version)?.last_id || 0);
    if (pruned && last === Number(latest.get()!.id)) return { revision: last, pending: false };
    db.exec('BEGIN IMMEDIATE');
    try {
      last = Number(cursor.get(version)?.last_id || 0);
      const high = Number(latest.get()!.id);
      let job = next.get(version);
      if (!job && high > last) {
        db.prepare(
          `INSERT INTO dashboard_jobs SELECT ?,source,generation,min(id),? FROM ingest_log
          WHERE id>? GROUP BY source,generation`,
        ).run(version, high, last);
        job = next.get(version);
      }
      if (job) {
        const keys = [version, job.source, job.generation];
        const failed = db.prepare('SELECT 1 FROM dashboard_errors WHERE version=? AND source=? AND generation=?').get(...keys);
        db.exec('SAVEPOINT projection');
        try {
          project(job, failed ? 0 : last);
          db.prepare('DELETE FROM dashboard_errors WHERE version=? AND source=? AND generation=?').run(...keys);
        } catch (error) {
          db.exec('ROLLBACK TO projection');
          db.prepare('INSERT OR REPLACE INTO dashboard_errors VALUES(?,?,?,?,CURRENT_TIMESTAMP)').run(...keys, String(error));
        }
        db.exec('RELEASE projection');
        db.prepare('DELETE FROM dashboard_jobs WHERE version=? AND source=? AND generation=?').run(...keys);
        const remaining = next.get(version);
        last = remaining ? Number(remaining.first_id) - 1 : Number(job.target);
        db.prepare('INSERT OR REPLACE INTO dashboard_cursor VALUES(?,?)').run(version, last);
      }
      const caughtUp = high === last;
      if (caughtUp && !pruned) prune();
      db.exec('COMMIT');
      if (caughtUp) pruned = true;
      return { revision: last, pending: !caughtUp };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function refresh() {
    let state = step();
    while (state.pending) state = step();
    return state.revision;
  }
  return Object.assign(refresh, { step });
}
