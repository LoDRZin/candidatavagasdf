import { existsSync } from 'node:fs';
import { loadConfig } from './config';
import { migrationStatus, openSqlite } from './sqlite';

const config = loadConfig();
const problems: string[] = [];
const warnings: string[] = [];
if (!existsSync(`${config.assetsDir}/index.html`)) problems.push('Frontend compilado ausente.');
if (!existsSync(config.dbPath)) problems.push('Banco SQLite ausente.');
if (config.appOrigin.startsWith('https:') && !config.trustedClientIpHeader) problems.push('Defina TRUSTED_CLIENT_IP_HEADER para que os limites por IP não virem um limite global atrás do túnel.');
if (config.flags.AUTH_ENABLED !== 'false' && config.flags.LOCAL_MAIL_PREVIEW !== 'true' && (!config.flags.EMAIL_API_KEY || !config.flags.EMAIL_FROM)) problems.push('Cadastro habilitado exige EMAIL_API_KEY e EMAIL_FROM para confirmação.');
if (Boolean(config.flags.GOOGLE_CLIENT_ID) !== Boolean(config.flags.GOOGLE_CLIENT_SECRET)) problems.push('Google OAuth precisa de CLIENT_ID e CLIENT_SECRET juntos.');
if (config.flags.AI_RESUME_STRUCTURE_ENABLED === 'true' && (!config.flags.GEMINI_API_KEY || !config.flags.GEMINI_RESUME_MODEL)) problems.push('IA estruturada exige Gemini configurado.');
if (!config.flags.GEMINI_API_KEY && !config.flags.OPENROUTER_API_KEY) warnings.push('Chatbot de IA sem provedor; ferramentas locais continuam disponíveis.');
if (existsSync(config.dbPath)) {
  const db = openSqlite(config.dbPath);
  try {
    const pending = migrationStatus(db, config.migrationsDir).filter(item => !item.applied);
    if (pending.length) problems.push(`${pending.length} migração(ões) pendente(s).`);
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') problems.push('Integridade do SQLite falhou.');
  } finally { db.close(); }
}
if (problems.length) {
  console.error(`Pré-voo self-host incompleto:\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else console.log('Pré-voo self-host aprovado. Domínio, túnel, e-mail, OAuth, IA real e revisão jurídica ainda exigem homologação humana.');
for (const warning of warnings) console.warn(`Aviso: ${warning}`);
