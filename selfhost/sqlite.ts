import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';

type Sqlite = Database.Database;
type Bound = { sql: string; values: unknown[] };

function result<T>(rows: T[], changes: number, lastRowId: number, started: number): D1Result<T> {
  return {
    success: true,
    results: rows,
    meta: {
      duration: performance.now() - started,
      size_after: 0,
      rows_read: rows.length,
      rows_written: changes,
      last_row_id: lastRowId,
      changed_db: changes > 0,
      changes,
    },
  };
}

export function createSqliteBinding(db: Sqlite): D1Database {
  const bound = new WeakMap<D1PreparedStatement, Bound>();

  function execute<T>(statement: D1PreparedStatement): D1Result<T> {
    const params = bound.get(statement);
    if (!params) throw new Error('Instrução SQL fora deste banco.');
    const started = performance.now();
    const prepared = db.prepare(params.sql);
    if (prepared.reader) {
      const rows = prepared.all(...params.values) as T[];
      // SQLite changes() reflects writes made by INSERT/UPDATE/DELETE ... RETURNING.
      const changes = prepared.readonly ? 0 : (db.prepare('SELECT changes() AS n').get() as { n: number }).n;
      return result(rows, changes, 0, started);
    }
    const meta = prepared.run(...params.values);
    return result([], meta.changes, Number(meta.lastInsertRowid), started);
  }

  function prepare(sql: string, values: unknown[] = []): D1PreparedStatement {
    function raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
    function raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
    async function raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
      const prepared = db.prepare(sql);
      const rows = prepared.raw().all(...values) as T[];
      return options?.columnNames ? [prepared.columns().map(item => item.name), ...rows] : rows;
    }
    const statement: D1PreparedStatement = {
      bind: (...next: unknown[]) => prepare(sql, next),
      first: async <T = Record<string, unknown>>(column?: string): Promise<T | null> => {
        const row = db.prepare(sql).get(...values) as Record<string, unknown> | undefined;
        if (!row) return null;
        const value = column === undefined ? row : row[column];
        return value === undefined || value === null ? null : value as T;
      },
      run: async <T = Record<string, unknown>>() => execute<T>(statement),
      all: async <T = Record<string, unknown>>() => execute<T>(statement),
      raw,
    };
    bound.set(statement, { sql, values });
    return statement;
  }

  function batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const transaction = db.transaction(() => statements.map(statement => execute<T>(statement)));
    return Promise.resolve(transaction.immediate());
  }

  return {
    prepare,
    batch,
    exec: async (sql: string) => {
      const started = performance.now();
      db.exec(sql);
      return { count: 1, duration: performance.now() - started };
    },
    withSession: () => ({ prepare, batch, getBookmark: () => null }),
    dump: async () => {
      const bytes = db.serialize();
      const output = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(output).set(bytes);
      return output;
    },
  };
}

export function openSqlite(file: string): Sqlite {
  const db = new Database(file, { timeout: 5_000 });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function migrationStatus(db: Sqlite, directory: string) {
  db.exec('CREATE TABLE IF NOT EXISTS selfhost_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const recorded = new Map((db.prepare('SELECT name, sha256 FROM selfhost_migrations').all() as Array<{ name: string; sha256: string }>).map(item => [item.name, item.sha256]));
  const files = readdirSync(directory).filter(name => /^\d{4}_[a-z0-9_-]+\.sql$/.test(name)).sort();
  const migrations = files.map(name => {
    const sql = readFileSync(join(directory, name), 'utf8');
    const sha256 = createHash('sha256').update(sql).digest('hex');
    if (recorded.has(name) && recorded.get(name) !== sha256) throw new Error(`Migração alterada após aplicação: ${name}`);
    return { name: basename(name), sql, sha256, applied: recorded.has(name) };
  });
  for (const name of recorded.keys()) if (!files.includes(name)) throw new Error(`Migração aplicada não encontrada no código: ${name}`);
  return migrations;
}

export function applyMigrations(db: Sqlite, directory: string): string[] {
  const pending = migrationStatus(db, directory).filter(item => !item.applied);
  for (const item of pending) {
    db.transaction(() => {
      db.exec(item.sql);
      db.prepare('INSERT INTO selfhost_migrations(name, sha256, applied_at) VALUES(?,?,?)').run(item.name, item.sha256, new Date().toISOString());
    }).immediate();
  }
  return pending.map(item => item.name);
}

export function createSqliteLimiter(db: Sqlite): RateLimit {
  const upsert = db.prepare('INSERT INTO request_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count');
  const consume = db.transaction((id: string, expiry: number) => (upsert.get(id, expiry) as { count: number }).count);
  return {
    async limit({ key }) {
      const bucket = Math.floor(Date.now() / 60_000);
      const id = createHash('sha256').update(`ai:${key}:${bucket}`).digest('hex');
      return { success: consume.immediate(id, Date.now() + 120_000) <= 5 };
    },
  };
}
