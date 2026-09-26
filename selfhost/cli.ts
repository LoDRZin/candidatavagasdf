import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { databasePath } from './config';
import { applyMigrations, migrationStatus, openSqlite } from './sqlite';

const action = process.argv[2];
if (!['migrate', 'check', 'backup'].includes(action ?? '')) throw new Error('Use migrate, check ou backup.');
const dbPath = databasePath();
const directory = resolve(process.env.MIGRATIONS_DIR || 'migrations');
if (action === 'migrate') mkdirSync(dirname(dbPath), { recursive: true });
else if (!existsSync(dbPath)) throw new Error('Banco não encontrado. Execute migrate primeiro.');
const db = openSqlite(dbPath);
try {
  if (action === 'migrate') {
    const applied = applyMigrations(db, directory);
    console.log(JSON.stringify({ event: 'selfhost_migrations', applied }));
  } else if (action === 'check') {
    const pending = migrationStatus(db, directory).filter(item => !item.applied).map(item => item.name);
    const integrity = db.pragma('integrity_check', { simple: true });
    console.log(JSON.stringify({ event: 'selfhost_db_check', integrity, pending }));
    if (integrity !== 'ok' || pending.length) process.exitCode = 1;
  } else {
    const destination = process.argv[3];
    if (!destination || !isAbsolute(destination)) throw new Error('Informe um caminho absoluto para o backup.');
    const output = resolve(destination);
    if (output === dbPath || existsSync(output)) throw new Error('O destino do backup já existe ou é o próprio banco.');
    mkdirSync(dirname(output), { recursive: true });
    await db.backup(output);
    console.log(JSON.stringify({ event: 'selfhost_backup_complete', output }));
  }
} finally {
  db.close();
}
