import { useEffect, useState } from 'react';

export function LessonProgressRing({ value, label = 'Progresso da aula' }: { value: number; label?: string }) {
  const progress = Math.min(100, Math.max(0, value));
  return <div className="learning-ring ci-ring" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}% concluído`}>
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle className="learning-ring-track ci-ring-track" cx="22" cy="22" r="18" />
      <circle className="learning-ring-value ci-ring-fill" cx="22" cy="22" r="18" pathLength="100" style={{ strokeDashoffset: 100 - progress }} />
    </svg>
    <span className="ci-ring-label">{progress}%</span>
  </div>;
}

export function ActiveSessionTimer({ onChange }: { onChange?: (seconds: number) => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setSeconds(value => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { onChange?.(seconds); }, [onChange, seconds]);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return <span className="learning-session-time" aria-label={`Tempo nesta sessão: ${minutes} minutos e ${remainder} segundos`}>{minutes}:{String(remainder).padStart(2, '0')} nesta sessão</span>;
}

export function ReflectionField({ id, value, pending, online, status, disabled, onSave }: {
  id: string;
  value?: string;
  pending: boolean;
  online: boolean;
  status: string;
  disabled: boolean;
  onSave: (value: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState('');
  useEffect(() => { setDraft(value ?? ''); }, [value]);
  const dirty = draft !== (value ?? '');
  const saving = saveState === 'saving';
  const label = saveError || (saving ? 'Salvando…' : pending || dirty ? online ? 'Pendente de sincronização' : 'Guardado neste dispositivo' : saveState === 'saved' || status === 'Salvo na sua conta' ? 'Salvo na sua conta' : status);
  async function save() {
    setSaveState('saving');
    setSaveError('');
    try {
      await onSave(draft);
      setSaveState('saved');
    } catch {
      setSaveState('idle');
      setSaveError(online ? 'Não foi possível sincronizar. Sua reflexão continua guardada neste dispositivo.' : 'Sem conexão. Sua reflexão continua guardada neste dispositivo.');
    }
  }
  return <div className="learning-reflection ci-reflection"><label htmlFor={`reflection-${id}`}>Sua reflexão</label>
    <textarea id={`reflection-${id}`} rows={4} maxLength={2000} value={draft} onChange={event => { setDraft(event.target.value); setSaveState('idle'); setSaveError(''); }} placeholder="Conecte o que aprendeu com uma situação da sua vida…" />
    <span className="learning-reflection-meta ci-reflection-meta"><small className="ci-character-count">{draft.length}/2000 · Visível somente para você</small><small className={`ci-save-state${pending || dirty ? ' is-local' : saveState === 'saved' ? ' is-saved' : ''}`} role="status" aria-live="polite">{label}</small></span>
    <button type="button" className="button learning-secondary" disabled={disabled || saving || !dirty} onClick={() => { void save(); }}>{saving ? 'Salvando…' : saveState === 'saved' && !dirty ? pending || !online ? 'Salvo neste dispositivo ✓' : 'Salvo ✓' : 'Salvar reflexão'}</button>
  </div>;
}
