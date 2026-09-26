import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { RequireUser, useAuth } from './Auth';
import { api, go, message } from './api';
import { CourseHero } from './CourseHero';
import { CourseLink, CourseProgress } from './CourseProgress';
import type { Course, CourseDetail, CourseLesson, CourseProgressData } from './course-types';
import { compareCoursePresentation, courseCategoryLabels, getCoursePresentation, type CourseCategory } from './course-presentation';
import './Courses.css';
import './courses-interactive.css';

export { CourseAdmin } from './CourseAdmin';
export { LessonPage } from './LessonPlayer';

type Filter = 'all' | 'started' | 'completed';
type CategoryFilter = 'all' | CourseCategory;

export function CoursesPage({ slug }: { slug?: string }) {
  return <div className="platform-page zeno-workspace-page learning-page"><RequireUser><CourseContent slug={slug} /></RequireUser></div>;
}

function CourseContent({ slug }: { slug?: string }) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const version = new URLSearchParams(location.search).get('version');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        if (slug) {
          const result = await api<CourseDetail>(`/api/courses/${encodeURIComponent(slug)}${version ? `?version=${encodeURIComponent(version)}` : ''}`);
          if (active) setDetail(result);
        } else {
          const result = await api<{ courses: Course[] }>('/api/courses');
          if (active) setCourses(result.courses);
        }
      } catch (cause) { if (active) setError(message(cause)); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [slug, version, user?.id, reload]);

  async function start() {
    if (!detail || !user) return;
    setBusy(true);
    setError('');
    try {
      const progress = await api<CourseProgressData>(`/api/courses/${detail.course.id}/enroll`, { courseVersionId: detail.version.id }, 'POST', { 'X-Account-Id': user.id });
      const next = progress.lessons.find(lesson => lesson.id === progress.lastLessonId && lesson.status !== 'completed')
        ?? progress.lessons.find(lesson => lesson.status !== 'completed') ?? progress.lessons[0];
      if (!next) throw new Error('Este curso ainda não tem aulas disponíveis.');
      go(`/cursos/${detail.course.slug}/aulas/${next.id}`);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  const orderedCourses = [...courses].sort(compareCoursePresentation);
  const enrolled = courses.filter(course => course.progress.enrolled);
  const completed = courses.filter(course => course.progress.completed);
  const availableCategories = [...new Set(orderedCourses.map(course => getCoursePresentation(course.slug).category))];
  const visible = orderedCourses.filter(course => {
    const matchesStatus = filter === 'all' || (filter === 'completed' ? course.progress.completed : course.progress.enrolled && !course.progress.completed);
    return matchesStatus && (category === 'all' || getCoursePresentation(course.slug).category === category);
  });

  return <>
    {!slug && <header className="zeno-workspace-header">
      <div>
        <p className="zeno-eyebrow">APRENDA. PRATIQUE. DÊ O PRÓXIMO PASSO.</p>
        <h1>Cursos para o seu próximo passo</h1>
        <p>Da primeira versão do currículo à conversa com a empresa. Aulas curtas, atividades práticas e um caminho que você faz no seu ritmo.</p>
      </div>
      <CourseLink href="/meu-aprendizado" className="button learning-secondary"><Icon name="book" size={16} /> Meu aprendizado</CourseLink>
    </header>}

    {slug && <CourseLink href="/cursos" className="learning-back learning-course-back"><Icon name="back" size={14} /> Todos os cursos</CourseLink>}

    {error && <section className="learning-error" role="alert"><p>{error}</p><button className="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></section>}
    {loading ? <div className="course-loading-grid" role="status" aria-label="Carregando cursos" aria-busy="true">{[1, 2, 3].map(index => <div className="course-loading-card ci-skeleton" key={index} aria-hidden="true" />)}</div> : slug ? detail && <>
      <CourseHero detail={detail} busy={busy} onStart={() => { void start(); }} />
      <section className="learning-panel learning-syllabus ci-syllabus" aria-labelledby="course-syllabus-title">
          <div className="learning-section-heading"><div><span className="zeno-eyebrow">O QUE VOCÊ VAI APRENDER</span><h2 id="course-syllabus-title">Um passo de cada vez</h2></div><span>{detail.progress.totalLessons} aulas</span></div>
          {detail.modules.map(module => <div className="learning-module" key={module.id}>
            <h3>{module.title}</h3>
            <ol className="ci-lesson-grid">{module.lessons.map((lesson, index) => <LessonSyllabusCard key={lesson.id} lesson={lesson} index={index} enrolled={detail.progress.enrolled} slug={detail.course.slug} />)}</ol>
          </div>)}
          <p className="ci-course-rule"><Icon name="check" size={15} /> {detail.version.pass_score === null ? 'Conclua as leituras e responda às atividades.' : `Para concluir: leituras + ${detail.version.pass_score}% nas questões objetivas. Você pode tentar novamente.`} O progresso é salvo na sua conta.</p>
      </section>
    </> : !error && <>
      <section className="learning-overview" aria-label="Seu aprendizado em números">
        <div><Icon name="book" size={20} /><strong>{courses.length}</strong><span>cursos disponíveis</span></div>
        <div><Icon name="play" size={20} /><strong>{enrolled.length - completed.length}</strong><span>em andamento</span></div>
        <div><Icon name="check" size={20} /><strong>{completed.length}</strong><span>concluídos</span></div>
        <p>Um pouco por dia.<br /><strong>Um novo passo na sua carreira.</strong></p>
      </section>
      <div className="learning-catalog-heading"><h2>Escolha por onde começar</h2><div className="learning-filters" role="group" aria-label="Filtrar cursos por progresso">{([{ value: 'all', label: 'Todos' }, { value: 'started', label: 'Em andamento' }, { value: 'completed', label: 'Concluídos' }] as const).map(item => <button key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div></div>
      {courses.length > 0 && <div className="learning-category-row"><div className="learning-category-filters" role="group" aria-label="Filtrar cursos por tema"><button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Todos os temas</button>{availableCategories.map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{courseCategoryLabels[value]}</button>)}</div><p role="status">{visible.length} {visible.length === 1 ? 'curso encontrado' : 'cursos encontrados'}</p></div>}
      {visible.length ? <div className="learning-catalog">{visible.map(course => <CourseCard key={course.id} course={course} />)}</div> : <section className="learning-panel learning-empty"><Icon name="book" size={30} /><h2>{courses.length ? 'Seu próximo aprendizado está aqui' : 'Nenhum curso disponível'}</h2><p>{courses.length ? 'Ajuste os filtros para encontrar outro curso disponível.' : 'Volte em breve para conhecer os novos cursos.'}</p>{courses.length > 0 && <button className="button" onClick={() => { setFilter('all'); setCategory('all'); }}>Ver todos os cursos</button>}</section>}
      <p className="learning-footnote"><Icon name="lock" size={14} /> Suas respostas e reflexões são privadas. Você pode pausar e voltar quando quiser.</p>
    </>}
  </>;
}

function LessonSyllabusCard({ lesson, index, enrolled, slug }: { lesson: CourseLesson; index: number; enrolled: boolean; slug: string }) {
  const state = !enrolled ? 'locked' : lesson.status === 'completed' ? 'completed' : lesson.status === 'started' ? 'started' : 'ready';
  const stateLabel = state === 'locked' ? 'Bloqueada' : state === 'completed' ? 'Concluída' : state === 'started' ? 'Continuar' : 'Disponível';
  const contents = <>
    <span className="ci-lesson-top">
      <span className="ci-lesson-number" aria-hidden="true">{state === 'completed' ? <svg className="ci-check" viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 6.8" /></svg> : state === 'locked' ? <Icon name="lock" size={17} /> : String(index + 1).padStart(2, '0')}</span>
      <span className="ci-lesson-state">{stateLabel}</span>
    </span>
    <h4>{lesson.title}</h4>
    <small>{lesson.estimated_minutes} min · leitura, prática e reflexão</small>
    <span className="ci-lesson-preview">{state === 'locked' ? 'Comece o curso para liberar esta aula.' : lesson.question_preview ? `Próxima prática: ${lesson.question_preview}` : 'Abra a aula para continuar seu percurso.'}</span>
  </>;
  return <li><article className="ci-lesson-card" data-state={state} aria-label={`${lesson.title}: ${stateLabel}`}>
    {enrolled ? <CourseLink href={`/cursos/${slug}/aulas/${lesson.id}`}>{contents}</CourseLink> : <div>{contents}</div>}
  </article></li>;
}

function CourseCard({ course }: { course: Course }) {
  const theme = getCoursePresentation(course.slug);
  const progress = course.progress;
  return <article className={`learning-card tone-${theme.tone}`}>
    <div className="learning-card-visual"><span className="learning-topic-icon"><Icon name={theme.icon} size={28} /></span><span>{theme.label}</span><span className="learning-card-tag">{progress.completed ? 'CONCLUÍDO' : progress.enrolled ? 'EM ANDAMENTO' : 'CURSO INTERATIVO'}</span></div>
    <div className="learning-card-body"><h3>{course.title}</h3><p>{course.description}</p><div className="learning-meta"><span><Icon name="book" size={14} /> {progress.totalLessons} aulas</span><span><Icon name="clock" size={14} /> {progress.estimatedMinutes} min</span><span>Prática + reflexão</span></div>
      <CourseProgress progress={progress} label={`Progresso de ${course.title}`} />
      <CourseLink href={`/cursos/${course.slug}`} className="button button-primary">{progress.completed ? 'Revisar curso' : progress.enrolled ? 'Continuar curso' : 'Começar curso'}<Icon name="arrow" size={16} /></CourseLink>
    </div>
  </article>;
}

type LearningCourse = CourseProgressData & { title: string; slug: string; course_version_id: string; version: number };
export function LearningPage() {
  return <div className="platform-page zeno-workspace-page learning-page"><header className="zeno-workspace-header"><div><p className="zeno-eyebrow">SEU PERCURSO</p><h1>Meu aprendizado</h1><p>Cada passo fica guardado. Continue de onde parou.</p></div><CourseLink href="/cursos" className="button learning-secondary">Explorar cursos<Icon name="arrow" size={16} /></CourseLink></header><RequireUser><LearningContent /></RequireUser></div>;
}

function LearningContent() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<LearningCourse[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    void api<{ courses: LearningCourse[] }>('/api/me/learning').then(result => { if (active) setCourses(result.courses); }).catch(cause => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [user?.id, reload]);
  if (error) return <section className="learning-error" role="alert"><p>{error}</p><button className="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></section>;
  if (!courses) return <p role="status">Carregando seu aprendizado…</p>;
  if (!courses.length) return <section className="learning-panel learning-empty"><Icon name="book" size={30} /><h2>Seu primeiro curso está esperando</h2><p>Escolha um tema, faça as atividades e acompanhe suas conquistas por aqui.</p><CourseLink href="/cursos" className="button button-primary">Conhecer os cursos</CourseLink></section>;
  return <div className="learning-catalog">{courses.map(course => <article className="learning-panel learning-enrollment" key={course.course_version_id}><span className="course-badge">{course.completed ? 'CONCLUÍDO' : 'EM ANDAMENTO'}</span><h2>{course.title}</h2><CourseProgress progress={course} label={`Progresso de ${course.title}`} /><CourseLink href={`/cursos/${course.slug}?version=${course.course_version_id}`} className="button button-primary">{course.completed ? 'Revisar curso' : 'Continuar curso'}<Icon name="arrow" size={16} /></CourseLink></article>)}</div>;
}
