import type { Store } from './store.ts';
import { parseFile, parseHermes } from './session.ts';
import { dirname, join } from 'node:path';

export const PARSER_VERSION = 5;
export function projections({ db }: Store) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_git(repo TEXT,head TEXT,version INTEGER,value TEXT,PRIMARY KEY(repo,head,version));
    CREATE TABLE IF NOT EXISTS dashboard_cursor(version INTEGER PRIMARY KEY, last_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS dashboard_sessions(version INTEGER,source INTEGER,generation INTEGER,sid TEXT,data TEXT,
      PRIMARY KEY(version,source,generation,sid));
    CREATE TABLE IF NOT EXISTS dashboard_hermes(version INTEGER,source INTEGER,generation INTEGER,item TEXT,sid TEXT,hash TEXT,
      PRIMARY KEY(version,source,generation,item));
    CREATE INDEX IF NOT EXISTS dashboard_hermes_sid ON dashboard_hermes(version,source,generation,sid);
    CREATE TABLE IF NOT EXISTS dashboard_commands(version INTEGER,source INTEGER,generation INTEGER,item TEXT,
      timestamp TEXT,rtk_cmd TEXT,project_path TEXT,input_tokens INTEGER,output_tokens INTEGER,saved_tokens INTEGER,exec_time_ms INTEGER,
      PRIMARY KEY(version,source,generation,item));
    CREATE TABLE IF NOT EXISTS dashboard_orca(version INTEGER,source INTEGER,generation INTEGER,path TEXT,data TEXT,
      PRIMARY KEY(version,source,generation));`);
  const version = PARSER_VERSION;
  const cursor = db.prepare('SELECT last_id FROM dashboard_cursor WHERE version=?');
  const latest = db.prepare('SELECT coalesce(max(id),0) AS id FROM ingest_log');
  const changed =
    db.prepare(`SELECT DISTINCT s.kind,s.path,i.source,i.generation FROM ingest_log i JOIN sources s ON s.id=i.source
    WHERE i.id>? ORDER BY i.source,i.generation`);
  const parts = db.prepare(
    `SELECT bytes FROM versions JOIN archive.blobs USING(hash) WHERE source=? AND generation=? ORDER BY cast(item AS INTEGER)`,
  );
  const rows =
    db.prepare(`SELECT item,hash,bytes FROM versions JOIN archive.blobs USING(hash) WHERE source=? AND generation=? AND item IN
    (SELECT item FROM ingest_log WHERE id>? AND source=? AND generation=?)`);
  const save = db.prepare('INSERT OR REPLACE INTO dashboard_sessions VALUES(?,?,?,?,?)');
  const command = db.prepare('INSERT OR REPLACE INTO dashboard_commands VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const message = db.prepare('INSERT OR REPLACE INTO dashboard_hermes VALUES(?,?,?,?,?,?)');
  const sessionRows = db.prepare(`SELECT item,bytes FROM dashboard_hermes JOIN archive.blobs USING(hash)
    WHERE version=? AND source=? AND generation=? AND sid=?`);
  const priorSession = db.prepare(
    'SELECT sid FROM dashboard_hermes WHERE version=? AND source=? AND generation=? AND item=?',
  );
  const removeSession = db.prepare(
    'DELETE FROM dashboard_sessions WHERE version=? AND source=? AND generation=? AND sid=?',
  );
  const directory = db.prepare("SELECT 1 FROM versions WHERE source=? AND generation=? AND item='directory'");
  function file(source, generation) {
    return Buffer.concat(
      parts.all(source, generation).map((r) => Buffer.from(r.bytes as Uint8Array)),
    ).toString();
  }
  function sibling(path: string) {
    return db
      .prepare(
        "SELECT id,generation FROM sources JOIN cursors ON sources.id=cursors.source WHERE kind='copilot' AND path=?",
      )
      .get(path);
  }
  function parse(kind, path, source, generation) {
    const meta: Record<string, string> = Object.create(null);
    if (kind === 'copilot') {
      const side = sibling(join(dirname(path), 'workspace.yaml'));
      if (side)
        for (const line of file(side.id, side.generation).split('\n')) {
          const m = /^([^ #\t-][^:]*):\s*(.*)$/.exec(line);
          if (m) meta[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
    }
    const bytes = file(source, generation);
    let s;
    try {
      s = parseFile(kind, path, bytes, meta);
    } catch (error) {
      if (kind === 'jcode' && error instanceof SyntaxError) {
        removeSession.run(version, source, generation, 'file');
        return;
      }
      throw error;
    }
    save.run(version, source, generation, 'file', JSON.stringify(s));
  }
  return function refresh() {
    let last = Number(cursor.get(version)?.last_id || 0);
    if (last === Number(latest.get()!.id)) return last;
    db.exec('BEGIN IMMEDIATE');
    try {
      last = Number(cursor.get(version)?.last_id || 0);
      const high = Number(latest.get()!.id);
      for (const { kind, path, source, generation } of changed.all(last)) {
        if (kind === 'copilot' && directory.get(source, generation)) continue;
        if (kind === 'hermes' || kind === 'rtk') {
          const dirty = new Set<string>();
          for (const { item, hash, bytes } of rows.iterate(source, generation, last, source, generation)) {
            const table = String(item).split('/')[0];
            if (!['commands', 'sessions', 'messages'].includes(table)) continue;
            const r = JSON.parse(Buffer.from(bytes as Uint8Array).toString());
            if (kind === 'rtk')
              command.run(
                version,
                source,
                generation,
                item,
                ...[
                  'timestamp',
                  'rtk_cmd',
                  'project_path',
                  'input_tokens',
                  'output_tokens',
                  'saved_tokens',
                  'exec_time_ms',
                ].map((k) => r[k] ?? null),
              );
            else {
              const sid = table === 'sessions' ? r.id : r.session_id;
              if (sid == null) continue;
              const old = priorSession.get(version, source, generation, item);
              if (old) dirty.add(String(old.sid));
              message.run(version, source, generation, item, sid, hash);
              dirty.add(sid);
            }
          }
          for (const sid of dirty) {
            let session;
            const messages = [];
            for (const row of sessionRows.iterate(version, source, generation, sid)) {
              const r = JSON.parse(Buffer.from(row.bytes as Uint8Array).toString());
              if (String(row.item).startsWith('sessions/')) session = r;
              else if (r.active === 1) messages.push(r);
            }
            if (session && session.started_at != null)
              save.run(
                version,
                source,
                generation,
                sid,
                JSON.stringify(
                  parseHermes(
                    session,
                    messages.sort((a, b) => a.timestamp - b.timestamp),
                  ),
                ),
              );
            else removeSession.run(version, source, generation, sid);
          }
        } else if (kind === 'orca')
          db.prepare('INSERT OR REPLACE INTO dashboard_orca VALUES(?,?,?,?,?)').run(
            version,
            source,
            generation,
            path,
            file(source, generation),
          );
        else if (kind === 'copilot' && String(path).endsWith('/workspace.yaml')) {
          const events = join(dirname(String(path)), 'events.jsonl'),
            e = sibling(events);
          if (e) parse(kind, events, e.id, e.generation);
        } else parse(kind, path, source, generation);
      }
      db.prepare('INSERT OR REPLACE INTO dashboard_cursor VALUES(?,?)').run(version, high);
      db.exec('COMMIT');
      return high;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
}
