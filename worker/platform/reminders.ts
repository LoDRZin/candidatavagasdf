import { z } from 'zod';
import { requireUser } from './auth';
import { assertMethod, fail, hash, json, limit, readJson, type PlatformEnv } from './http';

type PreferenceRow = {
  user_id: string;
  email_enabled: number;
  window_days: number;
  revision: number;
  updated_at: string;
};

type ReminderRow = {
  kind: 'application' | 'interview';
  source_id: string;
  title: string;
  subtitle: string;
  due_at: string;
  href: string;
};

type RecipientRow = {
  user_id: string;
  name: string;
  email: string;
  window_days: number;
};

const preferenceSchema = z.object({
  email_enabled: z.boolean(),
  window_days: z.number().int().min(1).max(14),
  revision: z.number().int().min(0),
});

const now = () => new Date().toISOString();

function deliveryAvailable(env: PlatformEnv) {
  return env.REMINDER_EMAILS_ENABLED === 'true' && Boolean(env.EMAIL_API_KEY && env.EMAIL_FROM && validAppOrigin(env.APP_ORIGIN));
}

function validAppOrigin(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? url.origin : null;
  } catch { return null; }
}

function publicPreference(row: PreferenceRow | null, env: PlatformEnv) {
  return {
    email_enabled: Boolean(row?.email_enabled),
    window_days: row?.window_days ?? 3,
    revision: row?.revision ?? 0,
    updated_at: row?.updated_at ?? null,
    delivery_available: deliveryAvailable(env),
  };
}

async function findReminders(env: PlatformEnv, userId: string, from: string, until: string, limitRows = 12) {
  const result = await env.DB.prepare(`
    SELECT 'application' kind,a.id source_id,a.role title,a.company subtitle,a.next_action_at due_at,
      '/candidaturas/' || a.id href
    FROM job_applications a
    WHERE a.user_id=? AND a.next_action_at IS NOT NULL
      AND a.status NOT IN ('hired','rejected','withdrawn')
      AND a.next_action_at>=? AND a.next_action_at<=?
    UNION ALL
    SELECT 'interview' kind,s.id source_id,s.title title,a.company || ' · ' || a.role subtitle,s.scheduled_at due_at,
      '/candidaturas/' || a.id || '/entrevista' href
    FROM interview_sessions s
    JOIN job_applications a ON a.id=s.application_id AND a.user_id=s.user_id
    WHERE s.user_id=? AND s.scheduled_at IS NOT NULL
      AND a.status NOT IN ('hired','rejected','withdrawn')
      AND s.scheduled_at>=? AND s.scheduled_at<=?
    ORDER BY due_at ASC
    LIMIT ?`)
    .bind(userId, from, until, userId, from, until, limitRows).all<ReminderRow>();
  return result.results;
}

export async function handleReminders(request: Request, env: PlatformEnv): Promise<Response> {
  const user = await requireUser(request, env);
  const path = new URL(request.url).pathname;

  if (path === '/api/reminders') {
    assertMethod(request, 'GET');
    const from = new Date(Date.now() - 30 * 86400_000).toISOString();
    const until = new Date(Date.now() + 30 * 86400_000).toISOString();
    return json({ reminders: await findReminders(env, user.id, from, until) });
  }

  if (path === '/api/me/reminder-preferences' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM reminder_preferences WHERE user_id=?').bind(user.id).first<PreferenceRow>();
    return json({ preference: publicPreference(row, env) });
  }

  if (path === '/api/me/reminder-preferences' && request.method === 'PUT') {
    await limit(env, `reminder-preference:${user.id}`, 20, 60);
    const body = await readJson(request, preferenceSchema);
    const current = await env.DB.prepare('SELECT * FROM reminder_preferences WHERE user_id=?').bind(user.id).first<PreferenceRow>();
    const stamp = now();
    if (!current) {
      if (body.revision !== 0) fail(409, 'REVISION_CONFLICT', 'As preferências mudaram. Recarregue a página.');
      await env.DB.prepare('INSERT INTO reminder_preferences(user_id,email_enabled,window_days,created_at,updated_at) VALUES(?,?,?,?,?)')
        .bind(user.id, body.email_enabled ? 1 : 0, body.window_days, stamp, stamp).run();
    } else {
      const result = await env.DB.prepare('UPDATE reminder_preferences SET email_enabled=?,window_days=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?')
        .bind(body.email_enabled ? 1 : 0, body.window_days, stamp, user.id, body.revision).run();
      if (!result.meta.changes) fail(409, 'REVISION_CONFLICT', 'As preferências mudaram. Recarregue a página.');
    }
    const saved = await env.DB.prepare('SELECT * FROM reminder_preferences WHERE user_id=?').bind(user.id).first<PreferenceRow>();
    return json({ preference: publicPreference(saved, env) });
  }

  return fail(404, 'NOT_FOUND', 'Endpoint não encontrado.');
}

function reminderKey(item: ReminderRow) {
  return `${item.kind}:${item.source_id}:${item.due_at}`;
}

function formatReminderDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}

export async function runReminderEmails(env: PlatformEnv) {
  if (!deliveryAvailable(env)) return { enabled: false, recipients: 0, sent: 0 };
  const appOrigin = validAppOrigin(env.APP_ORIGIN)!;
  const recipients = (await env.DB.prepare(`SELECT p.user_id,p.window_days,u.name,u.email
    FROM reminder_preferences p JOIN users u ON u.id=p.user_id
    WHERE p.email_enabled=1 AND u.email_verified_at IS NOT NULL AND u.status='active'
    ORDER BY p.updated_at ASC LIMIT 25`).all<RecipientRow>()).results;
  let sent = 0;

  for (const recipient of recipients) {
    const from = new Date(Date.now() - 86400_000).toISOString();
    const until = new Date(Date.now() + recipient.window_days * 86400_000).toISOString();
    const candidates = await findReminders(env, recipient.user_id, from, until, 8);
    const pending: ReminderRow[] = [];
    for (const item of candidates) {
      const delivered = await env.DB.prepare('SELECT id FROM reminder_deliveries WHERE user_id=? AND reminder_key=?')
        .bind(recipient.user_id, reminderKey(item)).first();
      if (!delivered) pending.push(item);
    }
    if (!pending.length) continue;

    const selected = pending.slice(0, 5);
    const digest = await hash(`${recipient.user_id}:${selected.map(reminderKey).sort().join('|')}`);
    const lines = selected.map(item => `• ${item.title} — ${item.subtitle} — ${formatReminderDate(item.due_at)}`);
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.EMAIL_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `cv-reminder-${digest}`,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [recipient.email],
          subject: selected.length === 1 ? 'Você tem um próximo passo para revisar' : `Você tem ${selected.length} próximos passos para revisar`,
          text: `Olá, ${recipient.name}.\n\nVocê escolheu receber lembretes da conectavagasdf.\n\n${lines.join('\n')}\n\nAbra seu painel: ${appOrigin}/dashboard\n\nVocê pode desativar estes e-mails a qualquer momento no painel.`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      console.error(JSON.stringify({ event: 'reminder_email_failed', reason: error instanceof Error ? error.name : 'unknown' }));
      continue;
    }
    if (!response.ok) {
      console.error(JSON.stringify({ event: 'reminder_email_failed', status: response.status }));
      continue;
    }
    await env.DB.batch(selected.map(item => env.DB.prepare('INSERT OR IGNORE INTO reminder_deliveries(id,user_id,reminder_key,delivered_at) VALUES(?,?,?,?)')
      .bind(crypto.randomUUID(), recipient.user_id, reminderKey(item), now())));
    sent++;
  }
  return { enabled: true, recipients: recipients.length, sent };
}
