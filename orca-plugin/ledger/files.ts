import { type Dirent, closeSync, fstatSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type Store, hash } from './store.ts';

declare global {
  interface JSON {
    /** JSON.rawJSON (Node 21+): not in TypeScript's lib yet. */
    rawJSON(text: string): unknown;
  }
}

export function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function* files(root: string, kind: string, onError: (dir: string, error: unknown) => void): Generator<string> {
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (!missing(error)) onError(root, error);
    return;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (kind !== 'jcode') yield* files(path, kind, onError);
    } else if (entry.isFile() && entry.name.endsWith(kind === 'jcode' ? '.json' : '.jsonl')) yield path;
  }
}

function stamp(path: string) {
  try {
    const s = statSync(path, { bigint: true });
    return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':');
  } catch (error) {
    if (missing(error)) return '';
    throw error;
  }
}

/** The tables each SQLite source archives. Tables listed in FULL are rescanned whole on every change; the others continue from a rowid watermark. */
const SQLITE_TABLES: Record<string, string[]> = {
  hermes: ['sessions', 'messages', 'system_prompts', 'session_model_usage'],
  rtk: ['commands'],
  opencode: ['session_v2', 'session_message', 'session_part'],
};
const FULL = new Set(['sessions', 'session_model_usage', 'session_v2']);
/** Rows of these OpenCode tables are updated in place (an assistant message gets its tokens when it completes, a tool part its result), so a session whose row count or latest time_updated changed is rescanned. */
const UPDATED: Record<string, string> = { session_message: '', session_part: " AND type='tool'" };

function rows(store: Store, source: number, generation: number, path: string, tables: string[]) {
  const input = new DatabaseSync(path, { readOnly: true });
  try {
    for (const table of tables) {
      if (!input.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table)) {
        if (table === 'system_prompts' || table === 'session_model_usage') continue;
        throw Error('missing source table ' + table);
      }
      const prior = store.db.prepare('SELECT last_id FROM watermarks WHERE source=? AND generation=? AND tbl=?').get(source, generation, table);
      const minimum = -9223372036854775808n;
      let high = prior ? BigInt(String(prior.last_id)) : minimum;
      let floor = high;
      if (table === 'messages') floor = high > minimum + 256n ? high - 256n : minimum;
      const only = UPDATED[table] ?? '';
      function scan(after: bigint, filter = '', params: (string | bigint | null)[] = []) {
        const query = input.prepare(`SELECT rowid AS _rowid,* FROM ${table}
          WHERE rowid > ? ${only} ${filter} ORDER BY rowid LIMIT 128`);
        query.setReadBigInts(true);
        while (true) {
          const page = query.all(after, ...params);
          if (!page.length) break;
          for (const { _rowid, ...row } of page) {
            after = _rowid as bigint;
            if (after > high) high = after;
            const data = JSON.stringify(row, (_, v) =>
              typeof v === 'bigint' ? JSON.rawJSON(v.toString()) : v instanceof Uint8Array ? { base64: Buffer.from(v).toString('base64') } : v,
            );
            store.record(source, generation, `${table}/${after}`, Buffer.from(data));
          }
        }
      }
      if (table === 'messages') {
        const columns = input
          .prepare('PRAGMA table_info(messages)')
          .all()
          .map((c) => c.name);
        if (['session_id', 'active', 'compacted'].every((c) => columns.includes(c))) {
          const groups = input
            .prepare(`SELECT session_id,count(*) AS n,sum(active) AS active,
            sum(compacted) AS compacted,CAST(max(rowid) AS TEXT) AS latest FROM messages GROUP BY session_id`)
            .all();
          const save = store.db.prepare(`INSERT INTO message_sessions VALUES(?,?,?,?) ON CONFLICT
            DO UPDATE SET fingerprint=excluded.fingerprint WHERE fingerprint<>excluded.fingerprint`);
          for (const { session_id, ...counts } of groups) {
            const changed = save.run(source, generation, JSON.stringify(session_id), JSON.stringify(counts)).changes;
            if (changed && prior) scan(minimum, 'AND rowid <= ? AND session_id IS ?', [floor, session_id as string | null]);
          }
        }
      }
      if (Object.hasOwn(UPDATED, table)) {
        const groups = input.prepare(`SELECT session_id,count(*) AS n,max(time_updated) AS updated FROM ${table} WHERE 1=1 ${only} GROUP BY session_id`).all();
        const save = store.db.prepare(`INSERT INTO message_sessions VALUES(?,?,?,?) ON CONFLICT
          DO UPDATE SET fingerprint=excluded.fingerprint WHERE fingerprint<>excluded.fingerprint`);
        for (const { session_id, ...counts } of groups) {
          const changed = save.run(source, generation, JSON.stringify([table, session_id]), JSON.stringify(counts)).changes;
          if (changed && prior) scan(minimum, 'AND rowid <= ? AND session_id IS ?', [floor, session_id as string | null]);
        }
      }
      scan(floor);
      if (!FULL.has(table)) {
        store.db.prepare('INSERT OR REPLACE INTO watermarks VALUES(?,?,?,?)').run(source, generation, table, String(high));
      }
    }
  } finally {
    input.close();
  }
}

function cursorTail(fd: number, offset: number) {
  const tail = Buffer.alloc(Math.min(offset, 64));
  if (readSync(fd, tail, 0, tail.length, offset - tail.length) !== tail.length) throw Error('source shrank during checksum');
  return tail;
}

export function ingestFile(store: Store, kind: string, path: string) {
  const fd = openSync(path, 'r');
  try {
    const s = fstatSync(fd, { bigint: true });
    const sqlite = kind === 'hermes' || kind === 'rtk' || kind === 'opencode';
    const identity = (sqlite ? [s.dev, s.ino] : [s.dev, s.ino, s.birthtimeNs]).join(':');
    const signature = [identity, s.size, s.mtimeNs, s.ctimeNs, sqlite ? 'v2:' + stamp(path + '-wal') : ''].join('/');
    const id = store.source(kind, path);
    const cursor = store.db.prepare('SELECT c.*,s.source_gone_at FROM cursors c JOIN sources s ON s.id=c.source WHERE source=?').get(id)!;
    if (cursor.signature === signature && !cursor.source_gone_at) return;
    const size = Number(s.size);
    const oldIdentity = sqlite ? String(cursor.identity).split(':').slice(0, 2).join(':') : cursor.identity;
    let reset = oldIdentity !== identity || (!sqlite && size < Number(cursor.size));
    const whole = kind === 'jcode';
    const jsonl = !sqlite && !whole;
    const priorOffset = Number(cursor.offset);
    let tail: Buffer = Buffer.alloc(0);
    if (jsonl && !reset && priorOffset > 0) {
      let checksum = cursor.checksum;
      if (!checksum) {
        // Old ledgers already contain the committed bytes needed for this first comparison.
        const tails = store.db
          .prepare(`SELECT substr(bytes,-64) AS tail FROM versions JOIN archive.blobs USING(hash)
          WHERE source=? AND generation=? ORDER BY CAST(item AS INTEGER) DESC LIMIT 64`)
          .all(id, cursor.generation);
        checksum = hash(Buffer.concat(tails.reverse().map((r) => Buffer.from(r.tail as Uint8Array))).subarray(-64));
      }
      tail = cursorTail(fd, priorOffset);
      reset = hash(tail) !== checksum;
      if (reset) tail = Buffer.alloc(0);
    }
    const generation = Number(cursor.generation) + Number(reset);
    let offset = reset ? 0 : Number(cursor.offset);
    if (sqlite) {
      rows(store, id, generation, path, SQLITE_TABLES[kind]);
    } else {
      let position = offset;
      let pending: Buffer[] = [];
      if (whole) position = 0;
      while (position < size) {
        const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, size - position));
        const n = readSync(fd, buffer, 0, buffer.length, position);
        if (!n) throw Error('source shrank during read');
        position += n;
        const bytes = buffer.subarray(0, n);
        const end = whole ? -1 : bytes.lastIndexOf(10);
        if (end >= 0) {
          pending.push(bytes.subarray(0, end + 1));
          const chunk = Buffer.concat(pending);
          store.record(id, generation, String(offset), chunk);
          tail = Buffer.from(chunk.length >= 64 ? chunk.subarray(-64) : Buffer.concat([tail, chunk]).subarray(-64));
          offset = position - n + end + 1;
          pending = [];
        }
        if (end + 1 < n) pending.push(bytes.subarray(end + 1));
      }
      if (whole) store.record(id, generation, 'file', Buffer.concat(pending));
    }
    store.db
      .prepare('UPDATE cursors SET identity=?,generation=?,signature=?,size=?,offset=?,checksum=? WHERE source=?')
      .run(identity, generation, signature, size, offset, jsonl ? hash(tail) : null, id);
    store.db.prepare('UPDATE sources SET source_gone_at=NULL WHERE id=? AND source_gone_at IS NOT NULL').run(id);
  } finally {
    closeSync(fd);
  }
}
