import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import type { CourseDetail } from './course-types';
import './courses-interactive.css';

type CourseHeroProps = {
  detail: CourseDetail;
  busy: boolean;
  onStart: () => void;
};

function useAnimatedProgress(value: number) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setDisplay(value); return; }
    setDisplay(0);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => setDisplay(value)); });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [value]);
  return display;
}

export function CourseHero({ detail, busy, onStart }: CourseHeroProps) {
  const { course, progress } = detail;
  const animatedProgress = useAnimatedProgress(progress.percent);
  const engagement = detail.engagement;
  const achievements = engagement?.achievements ?? [];

  return <>
    <section className="ci-hero" aria-labelledby="ci-course-title">
      <div className="ci-hero-copy">
        <span className="ci-eyebrow">TRILHA DE APRENDIZADO</span>
        <h1 id="ci-course-title">{course.title}</h1>
        <p>{course.description}</p>
      </div>
      <div className="ci-hero-bottom">
        <div className="ci-hero-progress">
          <div><span>{progress.completed ? 'Percurso concluído' : progress.enrolled ? 'Seu percurso' : 'Pronto para começar'}</span><strong>{progress.percent}%</strong></div>
          <progress value={animatedProgress} max={100} aria-label={`Progresso de ${course.title}`} aria-valuetext={`${progress.percent}% concluído`} />
          <small>{progress.completedLessons} de {progress.totalLessons} aulas · cerca de {progress.estimatedMinutes} min</small>
        </div>
        <div className="ci-hero-actions">
          {engagement && <span className="ci-streak" aria-label={engagement.streakDays ? `${engagement.streakDays} dias seguidos de estudo` : 'Comece sua sequência de estudos'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2.5c.4 3-1.1 4.7-2.5 6.1-1.2 1.2-2.3 2.4-2 4.5.7-1.3 1.7-2.1 3-2.8-.2 2.4 1.2 3.5 2.1 4.5.8.9 1.3 1.8.9 3.4 2.5-1.2 4.1-3.5 4.1-6.2 0-4.9-3.6-7.6-6.7-9.7Z" /></svg>
            {engagement.streakDays > 0 ? `${engagement.streakDays} ${engagement.streakDays === 1 ? 'dia seguido' : 'dias seguidos'}` : 'Comece sua sequência'}
          </span>}
          <button className="button button-primary ci-button" disabled={busy || !progress.totalLessons} onClick={onStart}>
            {busy ? 'Abrindo…' : progress.completed ? 'Revisar curso' : progress.enrolled ? 'Continuar curso' : 'Começar curso'}
            <Icon name="arrow" size={17} />
          </button>
        </div>
      </div>
    </section>
    {achievements.length > 0 && <section className="ci-achievements" aria-labelledby="ci-achievements-title">
      <div><span className="ci-eyebrow">MARCOS PESSOAIS</span><h2 id="ci-achievements-title">Conquistas da sua jornada</h2></div>
      <ul>{achievements.map(achievement => <li key={achievement.id} data-unlocked={achievement.unlocked}>
        <span className="ci-achievement-icon"><Icon name={achievement.unlocked ? 'check' : 'lock'} size={18} /></span>
        <span><strong>{achievement.title}</strong><small>{achievement.description}</small></span>
      </li>)}</ul>
    </section>}
  </>;
}
