import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import './courses-interactive.css';

export type CompletionStatistics = {
  activeSeconds: number;
  correctQuestions: number;
  objectiveQuestions: number;
  reflectionsWritten: number;
};

type CompletionCelebrationProps = {
  open: boolean;
  lessonTitle: string;
  statistics: CompletionStatistics;
  nextLabel?: string;
  busy?: boolean;
  error?: string;
  onNext?: () => void;
  onBack: () => void;
  onClose: () => void;
};

function useCount(target: number, active: boolean) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setValue(target); return; }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 800);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);
  return value;
}

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export function CompletionCelebration({ open, lessonTitle, statistics, nextLabel, busy = false, error, onNext, onBack, onClose }: CompletionCelebrationProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const seconds = useCount(statistics.activeSeconds, open);
  const correct = useCount(statistics.correctQuestions, open);
  const reflections = useCount(statistics.reflectionsWritten, open);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return <dialog ref={dialog} className="ci-celebration" aria-labelledby="ci-completion-title" onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <div className="ci-celebration-card">
      <button className="ci-dialog-close" type="button" aria-label="Fechar celebração" onClick={onClose}><Icon name="close" size={20} /></button>
      <div className="ci-completion-mark" aria-hidden="true"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="35" /><path d="m23 41 11 11 24-27" /></svg></div>
      <span className="ci-eyebrow">UM PASSO CONCLUÍDO</span>
      <h2 id="ci-completion-title">Aula concluída!</h2>
      <p>Você concluiu <strong>{lessonTitle}</strong>. O que aprendeu agora faz parte do seu percurso.</p>
      <dl className="ci-statistics" aria-label="Resumo desta aula">
        <div><dt>Tempo ativo nesta visita</dt><dd>{formatTime(seconds)}</dd></div>
        <div><dt>Questões acertadas</dt><dd><span aria-hidden="true">{correct}/{statistics.objectiveQuestions}</span><span className="ci-sr-only">{correct} de {statistics.objectiveQuestions}</span></dd></div>
        <div><dt>Reflexões escritas</dt><dd>{reflections}</dd></div>
      </dl>
      {error && <p className="ci-dialog-error" role="alert">{error}</p>}
      <div className="ci-celebration-actions">
        {onNext && <button className="button button-primary ci-button" disabled={busy} onClick={onNext}>{nextLabel ?? 'Próxima aula'}<Icon name="arrow" size={17} /></button>}
        <button className={onNext ? 'button ci-button-secondary' : 'button button-primary ci-button'} disabled={busy} onClick={onBack}>Voltar ao curso</button>
      </div>
    </div>
  </dialog>;
}
