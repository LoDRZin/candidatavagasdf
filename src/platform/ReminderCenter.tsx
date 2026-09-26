import { useEffect, useState } from 'react';
import { api, go, message } from './api';

type Reminder = {
  kind: 'application' | 'interview';
  source_id: string;
  title: string;
  subtitle: string;
  due_at: string;
  href: string;
};

type Preference = {
  email_enabled: boolean;
  window_days: number;
  revision: number;
  updated_at: string | null;
  delivery_available: boolean;
};

const defaultPreference: Preference = { email_enabled: false, window_days: 3, revision: 0, updated_at: null, delivery_available: false };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function ReminderCenter() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [preference, setPreference] = useState<Preference>(defaultPreference);
  const [draft, setDraft] = useState(defaultPreference);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ reminders: Reminder[] }>('/api/reminders'),
      api<{ preference: Preference }>('/api/me/reminder-preferences'),
    ]).then(([reminderResult, preferenceResult]) => {
      if (!active) return;
      setReminders(reminderResult.reminders);
      setPreference(preferenceResult.preference);
      setDraft(preferenceResult.preference);
    }).catch(reason => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, []);

  async function savePreference() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ preference: Preference }>('/api/me/reminder-preferences', {
        email_enabled: draft.email_enabled,
        window_days: draft.window_days,
        revision: preference.revision,
      }, 'PUT');
      setPreference(result.preference); setDraft(result.preference);
      setNotice(result.preference.email_enabled ? 'Lembretes por e-mail ativados. Você pode desativá-los aqui a qualquer momento.' : 'Lembretes por e-mail desativados.');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  const visible = reminders.slice(0, 6);
  return <section className="career-reminders" aria-labelledby="career-reminders-title">
    <div className="career-reminders-heading"><div><span className="eyebrow">LEMBRETES</span><h3 id="career-reminders-title">O que merece sua atenção</h3></div><span>{visible.length ? `${visible.length} próximo${visible.length === 1 ? '' : 's'} passo${visible.length === 1 ? '' : 's'}` : 'Nada urgente agora'}</span></div>
    {visible.length ? <ol>{visible.map(item => {
      const overdue = Date.parse(item.due_at) < Date.now();
      return <li key={`${item.kind}:${item.source_id}:${item.due_at}`}><span className={overdue ? 'is-overdue' : ''}>{overdue ? 'ATRASADO' : item.kind === 'interview' ? 'ENTREVISTA' : 'PRÓXIMA AÇÃO'}</span><div><strong>{item.title}</strong><small>{item.subtitle} · {dateLabel(item.due_at)}</small></div><button type="button" onClick={() => go(item.href)}>Abrir →</button></li>;
    })}</ol> : <p className="career-reminders-empty">Quando você definir uma data na candidatura ou na preparação de entrevista, ela aparecerá aqui.</p>}
    <details className="career-reminder-settings"><summary>Lembretes opcionais por e-mail</summary><p>Receba somente um resumo dos próximos passos. O conteúdo de currículos, respostas e anotações não entra no e-mail.</p><label className="career-reminder-check"><input type="checkbox" checked={draft.email_enabled} onChange={event => setDraft(current => ({ ...current, email_enabled: event.target.checked }))} /><span>Quero receber lembretes por e-mail.</span></label><label>Antecedência<select value={draft.window_days} onChange={event => setDraft(current => ({ ...current, window_days: Number(event.target.value) }))}><option value={1}>1 dia</option><option value={3}>3 dias</option><option value={7}>7 dias</option><option value={14}>14 dias</option></select></label>{!draft.delivery_available && <small>O envio ainda não está habilitado neste ambiente. Sua preferência pode ser salva e só será usada quando o serviço de e-mail for configurado.</small>}<button className="button" type="button" disabled={busy} onClick={() => { void savePreference(); }}>{busy ? 'Salvando…' : 'Salvar preferência'}</button>{notice && <p className="success-note" role="status">{notice}</p>}{error && <p className="error-note" role="alert">{error}</p>}</details>
  </section>;
}
