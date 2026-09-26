import type { QuestionFeedbackData } from './course-types';
import './courses-interactive.css';

export function QuestionFeedback({ feedback, animate = false }: { feedback: QuestionFeedbackData; animate?: boolean }) {
  const correct = feedback.verdict === 'correct';
  const recorded = feedback.verdict === 'recorded';
  const title = recorded ? 'Reflexão registrada' : correct ? 'Você acertou' : 'Quase! Veja o porquê:';

  return <div className="ci-feedback" data-verdict={feedback.verdict} data-animate={animate} role="status" aria-live="polite">
    <span className="ci-feedback-icon" aria-hidden="true">
      {correct || recorded
        ? <svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 6.8" /></svg>
        : <svg viewBox="0 0 24 24"><path d="M5 12h9" /><path d="m11 8 4 4-4 4" /></svg>}
    </span>
    <div className="ci-feedback-copy"><h3>{title}</h3><p>{feedback.explanation}</p>{!correct && !recorded && <span className="ci-feedback-focus">Revise a explicação e tente novamente quando estiver pronto.</span>}</div>
    {correct && animate && <span className="ci-confetti" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</span>}
  </div>;
}
