// Real application and API, with an isolated SQLite database and no external providers.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build as bundle } from 'esbuild';
import { build as buildClient } from 'vite';

const temporary = await mkdtemp(join(tmpdir(), 'conectavagasdf-course-e2e-'));
// Native dependencies resolve from the workspace; nothing touches .wrangler or .env files.
const artifactDirectory = resolve('.test-artifacts');
await mkdir(artifactDirectory, { recursive: true });
const buildDirectory = await mkdtemp(join(artifactDirectory, 'courses-build-'));
// Pass operating-system settings, never real provider credentials or Node preload flags.
const systemEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|CI|FORCE_COLOR)$/i.test(key)));
const environment = {
  ...systemEnvironment,
  DB_PATH: join(temporary, 'course-test.sqlite'),
  APP_ORIGIN: 'http://127.0.0.1:4178',
  PORT: '4178',
  BIND_HOST: '127.0.0.1',
  ASSETS_DIR: join(buildDirectory, 'client'),
  MIGRATIONS_DIR: resolve('migrations'),
  SELFHOST_ALLOW_HTTP_LOCAL: 'true',
  AUTH_ENABLED: 'true',
  COURSES_ENABLED: 'true',
  LOCAL_MAIL_PREVIEW: 'true',
  REMINDER_EMAILS_ENABLED: 'false',
  AI_RESUME_STRUCTURE_ENABLED: 'false',
  ADMIN_GATE_USER: 'course-test',
  ADMIN_GATE_PASSWORD: 'senha-ficticia-do-teste-de-cursos-123456',
  ADMIN_TOKEN: 'token-ficticio-do-teste-de-cursos-123456789',
  GEMINI_API_KEY: '',
  OPENROUTER_API_KEY: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  EMAIL_API_KEY: '',
  EMAIL_FROM: '',
  TRUSTED_CLIENT_IP_HEADER: '',
};
let server;
let stopping = false;
const stop = () => { stopping = true; server?.kill(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  await Promise.all([
    bundle({ entryPoints: { server: 'selfhost/server.ts', cli: 'selfhost/cli.ts' }, outdir: buildDirectory, bundle: true, format: 'esm', platform: 'node', target: 'node22', external: ['better-sqlite3'], logLevel: 'silent' }),
    buildClient({ configFile: 'vite.selfhost.config.ts', build: { outDir: environment.ASSETS_DIR }, logLevel: 'warn' }),
  ]);
  if (!stopping) {
    execFileSync(process.execPath, [join(buildDirectory, 'cli.js'), 'migrate'], { env: environment, cwd: process.cwd(), stdio: 'pipe', windowsHide: true });
    server = spawn(process.execPath, [join(buildDirectory, 'server.js')], { env: environment, cwd: process.cwd(), stdio: 'inherit', windowsHide: true });
    await new Promise((resolveExit, reject) => {
      server.once('error', reject);
      server.once('exit', code => { process.exitCode = stopping ? 0 : (code ?? 1); resolveExit(); });
    });
  }
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  // Both exact targets were created by mkdtemp for this run; preserve other test artifacts.
  if (dirname(temporary) !== resolve(tmpdir()) || !basename(temporary).startsWith('conectavagasdf-course-e2e-')) throw new Error('Unsafe test database cleanup path.');
  if (dirname(buildDirectory) !== artifactDirectory || !basename(buildDirectory).startsWith('courses-build-')) throw new Error('Unsafe test build cleanup path.');
  await Promise.all([temporary, buildDirectory].map(path => rm(path, { recursive: true, force: true, maxRetries: 3 })));
}
