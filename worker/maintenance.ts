import type { PlatformEnv } from './platform/http';
import { runReminderEmails } from './platform/reminders';

export async function runMaintenance(env: PlatformEnv) {
  const stamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(Date.now()),
    env.DB.prepare('DELETE FROM oauth_flows WHERE expires_at<?').bind(stamp),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<? OR revoked_at IS NOT NULL').bind(stamp),
    env.DB.prepare('DELETE FROM auth_tokens WHERE expires_at<? OR used_at IS NOT NULL').bind(stamp),
    env.DB.prepare('DELETE FROM local_mail WHERE created_at<?').bind(new Date(Date.now() - 86400_000).toISOString()),
    env.DB.prepare('DELETE FROM reminder_deliveries WHERE delivered_at<?').bind(new Date(Date.now() - 120 * 86400_000).toISOString()),
    env.DB.prepare('DELETE FROM ai_chat_conversations WHERE expires_at<=?').bind(stamp),
  ]);
  const reminderResult = await runReminderEmails(env);
  console.log(JSON.stringify({ event: 'scheduled_maintenance_complete', reminder_emails: reminderResult }));
}
