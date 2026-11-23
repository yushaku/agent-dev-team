import { closeSync, fstatSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from './store.ts';

export function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }

export function* files(root: string, kind: string, depth = 0): Generator<string> {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); }
  catch (error) { if (missing(error)) return; throw error; }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (kind !== 'jcode' && (kind !== 'copilot' || depth === 0)) yield* files(path, kind, depth+1);
    } else if (entry.isFile()) {
      if (kind === 'copilot' ? depth === 1 && entry.name === 'events.jsonl' :
          entry.name.endsWith(kind === 'jcode' ? '.json' : '.jsonl')) yield path;
    }
  }
}

function stamp(path: string) {
  try {
    const s = statSync(path, { bigint: true });
    return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
  } catch (error) { if (missing(error)) return ''; throw error; }
}

function rows(store: Store, source: number, generation: number, path: string, tables: string[]) {
  const input = new DatabaseSync(path, { readOnly: true });
  try {
    for (const table of tables) {
      const query = input.prepare(`SELECT rowid AS _rowid,* FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT 128`);
      query.setReadBigInts(true);
      const prior = store.db.prepare('SELECT last_id FROM watermarks WHERE source=? AND generation=? AND tbl=?')
        .get(source,generation,table);
      // Recent Hermes messages can be edited, compacted or rewound after insertion.
      const minimum = -9223372036854775808n;
      let last = minimum;
      if (prior && table !== 'sessions') {
        last = BigInt(String(prior.last_id)) - (table === 'messages' ? 256n : 0n);
        if (last < minimum) last = minimum;
      }
      let high = prior ? BigInt(String(prior.last_id)) : minimum;
      while (true) {
        const page = query.all(last);
        if (!page.length) break;
        for (const { _rowid, ...row } of page) {
          last = _rowid as bigint;
          if (last > high) high = last;
          const data = JSON.stringify(row, (_, v) => typeof v === 'bigint' ? JSON.rawJSON(v.toString()) :
            v instanceof Uint8Array ? { base64: Buffer.from(v).toString('base64') } : v);
          store.record(source,generation,`${table}/${last}`,Buffer.from(data));
        }
      }
      if (table !== 'sessions') {
        store.db.prepare('INSERT OR REPLACE INTO watermarks VALUES(?,?,?,?)')
          .run(source,generation,table,String(high));
      }
    }
  } finally { input.close(); }
}

export function ingestFile(store: Store, kind: string, path: string) {
  const fd = openSync(path,'r');
  try {
    const s = fstatSync(fd,{ bigint: true });
    const sqlite = kind === 'hermes' || kind === 'rtk';
    const identity = [s.dev,s.ino,s.birthtimeNs].join(':');
    const signature = [identity,s.size,s.mtimeNs,s.ctimeNs,sqlite ? stamp(path+'-wal') : ''].join('/');
    const id = store.source(kind,path);
    const cursor = store.db.prepare('SELECT c.*,s.source_gone_at FROM cursors c JOIN sources s ON s.id=c.source WHERE source=?').get(id)!;
    if (cursor.signature === signature && !cursor.source_gone_at) return;
    const size = Number(s.size);
    const reset = cursor.identity !== identity || !!cursor.source_gone_at || size < Number(cursor.size);
    const generation = Number(cursor.generation) + Number(reset);
    let offset = reset ? 0 : Number(cursor.offset);
    if (sqlite) {
      rows(store,id,generation,path,kind === 'rtk' ? ['commands'] : ['sessions','messages']);
    } else {
      let position = offset;
      let pending: Buffer[] = [];
      const whole = kind === 'jcode';
      if (whole) position = 0;
      while (position < size) {
        const buffer = Buffer.allocUnsafe(Math.min(1024*1024,size-position));
        const n = readSync(fd,buffer,0,buffer.length,position);
        if (!n) throw Error('source shrank during read');
        position += n;
        const bytes = buffer.subarray(0,n);
        const end = whole ? -1 : bytes.lastIndexOf(10);
        if (end >= 0) {
          pending.push(bytes.subarray(0,end+1));
          store.record(id,generation,String(offset),Buffer.concat(pending));
          offset = position - n + end + 1;
          pending = [];
        }
        if (end+1 < n) pending.push(bytes.subarray(end+1));
      }
      if (whole) store.record(id,generation,'file',Buffer.concat(pending));
    }
    store.db.prepare('UPDATE cursors SET identity=?,generation=?,signature=?,size=?,offset=? WHERE source=?')
      .run(identity,generation,signature,size,offset,id);
    store.db.prepare('UPDATE sources SET source_gone_at=NULL WHERE id=? AND source_gone_at IS NOT NULL').run(id);
  } finally { closeSync(fd); }
}
