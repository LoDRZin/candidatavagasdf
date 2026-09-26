import { isAbsolute, relative, resolve } from 'node:path';

export type SelfhostConfig = {
  bindHost: string;
  port: number;
  appOrigin: string;
  dbPath: string;
  adminUser: string;
  adminPassword: string;
  adminToken: string;
  trustedClientIpHeader: 'cf-connecting-ip' | 'x-real-ip' | null;
  migrationsDir: string;
  assetsDir: string;
  flags: Record<string, string | undefined>;
};

export function databasePath(input: NodeJS.ProcessEnv = process.env): string {
  if (!input.DB_PATH || !isAbsolute(input.DB_PATH)) throw new Error('DB_PATH deve ser um caminho absoluto fora da pasta pública.');
  const path = resolve(input.DB_PATH);
  const fromDist = relative(resolve('dist'), path);
  if (fromDist === '' || (!fromDist.startsWith('..') && !isAbsolute(fromDist))) throw new Error('DB_PATH não pode ficar dentro de dist.');
  return path;
}

export function loadConfig(input: NodeJS.ProcessEnv = process.env): SelfhostConfig {
  const app = new URL(input.APP_ORIGIN ?? '');
  if (app.href !== `${app.origin}/` || (app.protocol !== 'https:' && !(input.SELFHOST_ALLOW_HTTP_LOCAL === 'true' && app.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(app.hostname)))) {
    throw new Error('APP_ORIGIN deve ser uma origem HTTPS; HTTP só para teste local explícito.');
  }
  if (app.hostname.endsWith('.exemplo.com') || app.hostname.endsWith('.example.com') || app.hostname.endsWith('.invalid')) throw new Error('Troque o domínio de exemplo em APP_ORIGIN.');
  const bindHost = input.BIND_HOST || '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(bindHost)) throw new Error('BIND_HOST deve ser loopback; o túnel aponta para essa porta local.');
  const port = Number(input.PORT || 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
  const adminUser = input.ADMIN_GATE_USER ?? '';
  const adminPassword = input.ADMIN_GATE_PASSWORD ?? '';
  const adminToken = input.ADMIN_TOKEN ?? '';
  if (adminUser.length < 3 || adminPassword.length < 20 || adminToken.length < 32 || adminPassword === adminToken) throw new Error('Configure ADMIN_GATE_USER, ADMIN_GATE_PASSWORD (20+ caracteres) e ADMIN_TOKEN distinto (32+ caracteres).');
  if ([adminPassword, adminToken].some(value => /substitua|changeme|replace|exemplo|example/i.test(value))) throw new Error('Troque os segredos de exemplo antes de iniciar.');
  if (input.LOCAL_MAIL_PREVIEW === 'true' && !(input.SELFHOST_ALLOW_HTTP_LOCAL === 'true' && app.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(app.hostname))) throw new Error('LOCAL_MAIL_PREVIEW só é permitido em teste local por HTTP.');
  if (input.REMINDER_EMAILS_ENABLED === 'true' && (!input.EMAIL_API_KEY || !input.EMAIL_FROM)) throw new Error('Lembretes exigem EMAIL_API_KEY e EMAIL_FROM.');
  const dbPath = databasePath(input);
  const assetsDir = resolve(input.ASSETS_DIR || 'dist/selfhost/client');
  const fromAssets = relative(assetsDir, dbPath);
  if (fromAssets === '' || (!fromAssets.startsWith('..') && !isAbsolute(fromAssets))) throw new Error('DB_PATH não pode ficar dentro dos assets públicos.');
  const trustedClientIpHeader = input.TRUSTED_CLIENT_IP_HEADER?.toLowerCase() || null;
  if (trustedClientIpHeader && !['cf-connecting-ip', 'x-real-ip'].includes(trustedClientIpHeader)) throw new Error('TRUSTED_CLIENT_IP_HEADER aceita somente cf-connecting-ip ou x-real-ip.');
  if (app.protocol === 'https:' && !trustedClientIpHeader) throw new Error('TRUSTED_CLIENT_IP_HEADER é obrigatório atrás do túnel HTTPS.');
  if (input.AUTH_ENABLED !== 'false' && input.LOCAL_MAIL_PREVIEW !== 'true' && (!input.EMAIL_API_KEY || !input.EMAIL_FROM)) throw new Error('Cadastro público exige EMAIL_API_KEY e EMAIL_FROM.');
  return {
    bindHost,
    port,
    appOrigin: app.origin,
    dbPath,
    adminUser,
    adminPassword,
    adminToken,
    trustedClientIpHeader: trustedClientIpHeader as SelfhostConfig['trustedClientIpHeader'],
    migrationsDir: resolve(input.MIGRATIONS_DIR || 'migrations'),
    assetsDir,
    flags: {
      AUTH_ENABLED: input.AUTH_ENABLED || 'true',
      COURSES_ENABLED: input.COURSES_ENABLED || 'true',
      AI_RESUME_STRUCTURE_ENABLED: input.AI_RESUME_STRUCTURE_ENABLED || 'false',
      LOCAL_MAIL_PREVIEW: input.LOCAL_MAIL_PREVIEW || 'false',
      REMINDER_EMAILS_ENABLED: input.REMINDER_EMAILS_ENABLED || 'false',
      GEMINI_API_KEY: input.GEMINI_API_KEY,
      GEMINI_MODEL: input.GEMINI_MODEL,
      GEMINI_MODELS: input.GEMINI_MODELS,
      GEMINI_BASE_URL: input.GEMINI_BASE_URL,
      GEMINI_RESUME_MODEL: input.GEMINI_RESUME_MODEL,
      OPENROUTER_API_KEY: input.OPENROUTER_API_KEY,
      OPENROUTER_MODEL: input.OPENROUTER_MODEL,
      OPENROUTER_MODELS: input.OPENROUTER_MODELS,
      OPENROUTER_BASE_URL: input.OPENROUTER_BASE_URL,
      OPENROUTER_SITE_URL: input.OPENROUTER_SITE_URL,
      OPENROUTER_APP_NAME: input.OPENROUTER_APP_NAME,
      GOOGLE_CLIENT_ID: input.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: input.GOOGLE_CLIENT_SECRET,
      EMAIL_API_KEY: input.EMAIL_API_KEY,
      EMAIL_FROM: input.EMAIL_FROM,
    },
  };
}
