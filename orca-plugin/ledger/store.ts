import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ensurePrivateHome, tightenFiles } from './private.ts';

export const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export class Store {
  db: DatabaseSync;
  private version: ReturnType<DatabaseSync['prepare']>;
  private blob: ReturnType<DatabaseSync['prepare']>;
  private log: ReturnType<DatabaseSync['prepare']>;
  constructor(home: string) {
    ensurePrivateHome(home);
    this.db = new DatabaseSync(join(home, 'ledger.sqlite'));
    try {
      this.init(home);
    } catch (error) {
      try {
        this.db.close();
      } catch {
        /* already closed */
      }
      throw error;
    }
  }

  /** All setup after the database opens; the constructor closes the connection if any of it fails. */
  private init(home: string) {
    this.db.exec('PRAGMA busy_timeout=30000');
    this.db.prepare('ATTACH ? AS archive').run(join(home, 'archive.sqlite'));
    // Rollback journals give attached databases a single atomic commit.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL,
        source_gone_at TEXT, UNIQUE(kind,path));
      CREATE TABLE IF NOT EXISTS cursors (
        source INTEGER PRIMARY KEY, identity TEXT, generation INTEGER NOT NULL DEFAULT 0,
        signature TEXT, size INTEGER DEFAULT 0, offset INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS versions (
        source INTEGER, generation INTEGER, item TEXT, hash TEXT,
        PRIMARY KEY(source,generation,item));
      CREATE TABLE IF NOT EXISTS watermarks (
        source INTEGER, generation INTEGER, tbl TEXT, last_id TEXT NOT NULL,
        PRIMARY KEY(source,generation,tbl));
      CREATE TABLE IF NOT EXISTS orca_runs (
        id TEXT PRIMARY KEY, entry_hash TEXT, terminal INTEGER, paths TEXT);
      CREATE TABLE IF NOT EXISTS message_sessions (
        source INTEGER, generation INTEGER, session TEXT, fingerprint TEXT,
        PRIMARY KEY(source,generation,session));
      CREATE TABLE IF NOT EXISTS orca_revision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER);
      INSERT OR IGNORE INTO orca_revision VALUES(1,0);
      CREATE TABLE IF NOT EXISTS ingest_log (
        id INTEGER PRIMARY KEY, source INTEGER, generation INTEGER, item TEXT, hash TEXT,
        recorded_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS archive.blobs (hash TEXT PRIMARY KEY, bytes BLOB NOT NULL);
    `);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.db.prepare("SELECT 1 FROM pragma_table_info('orca_runs') WHERE name='next_poll_at'").get()) {
        this.db.exec(`ALTER TABLE orca_runs ADD COLUMN next_poll_at INTEGER;
          ALTER TABLE orca_runs ADD COLUMN last_polled_at INTEGER;
          ALTER TABLE orca_runs ADD COLUMN settled_since INTEGER;`);
      }
      if (!this.db.prepare("SELECT 1 FROM pragma_table_info('cursors') WHERE name='checksum'").get()) {
        this.db.exec('ALTER TABLE cursors ADD COLUMN checksum TEXT');
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    tightenFiles(home);
    this.version = this.db.prepare(`INSERT INTO versions VALUES(?,?,?,?) ON CONFLICT DO UPDATE
      SET hash=excluded.hash WHERE hash<>excluded.hash`);
    this.blob = this.db.prepare('INSERT OR IGNORE INTO archive.blobs VALUES(?,?)');
    this.log = this.db.prepare('INSERT INTO ingest_log(source,generation,item,hash) VALUES(?,?,?,?)');
  }

  source(kind: string, path: string) {
    const row = this.db.prepare('SELECT * FROM sources WHERE kind=? AND path=?').get(kind, path);
    if (row) return Number(row.id);
    const id = Number(this.db.prepare('INSERT INTO sources(kind,path) VALUES(?,?)').run(kind, path).lastInsertRowid);
    this.db.prepare('INSERT INTO cursors(source) VALUES(?)').run(id);
    return id;
  }

  record(source: number, generation: number, item: string, bytes: Buffer) {
    const digest = hash(bytes);
    const changed = this.version.run(source, generation, item, digest).changes;
    if (!changed) return false;
    this.blob.run(digest, bytes);
    this.log.run(source, generation, item, digest);
    return true;
  }
}
