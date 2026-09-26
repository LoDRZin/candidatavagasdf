import type { MouseEvent, ReactNode } from 'react';
import { go } from './api';
import type { CourseProgressData } from './course-types';

export function CourseLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    go(href);
  }
  return <a href={href} className={className} onClick={navigate}>{children}</a>;
}

export function CourseProgress({ progress, label = 'Progresso do curso' }: { progress: CourseProgressData; label?: string }) {
  return <div className="learning-progress">
    <div><span>{progress.completed ? 'Concluído' : progress.enrolled ? 'Seu progresso' : 'Pronto para começar'}</span><strong>{progress.percent}%</strong></div>
    <progress value={progress.percent} max={100} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} />
    <small>{progress.completedLessons} de {progress.totalLessons} {progress.totalLessons === 1 ? 'aula concluída' : 'aulas concluídas'}</small>
  </div>;
}
