import type { IconName } from '../components/Icon';

export type CourseCategory = 'buscar' | 'preparar' | 'trabalhar' | 'crescer';
export type CourseTone = 'sage' | 'sand' | 'blue' | 'rose' | 'violet' | 'teal';

export type CoursePresentation = {
  label: string;
  icon: IconName;
  tone: CourseTone;
  category: CourseCategory;
  order: number;
};

export const courseCategoryLabels: Record<CourseCategory, string> = {
  buscar: 'Buscar oportunidade',
  preparar: 'Preparar-se',
  trabalhar: 'Trabalhar bem',
  crescer: 'Crescer na carreira',
};

const presentations: Record<string, CoursePresentation> = {
  'busca-de-emprego-organizada': { label: 'Busca de emprego', icon: 'compass', tone: 'blue', category: 'buscar', order: 10 },
  'seguranca-na-busca-de-emprego': { label: 'Segurança', icon: 'lock', tone: 'rose', category: 'buscar', order: 20 },
  'seu-primeiro-curriculo': { label: 'Currículo', icon: 'fileEdit', tone: 'sage', category: 'preparar', order: 30 },
  'prepare-se-para-entrevista': { label: 'Entrevistas', icon: 'message', tone: 'sand', category: 'preparar', order: 40 },
  'competencias-digitais-essenciais': { label: 'Competências digitais', icon: 'dashboard', tone: 'violet', category: 'preparar', order: 50 },
  'comunicacao-no-trabalho': { label: 'Comunicação', icon: 'message', tone: 'rose', category: 'trabalhar', order: 60 },
  'trabalho-em-equipe-na-pratica': { label: 'Trabalho em equipe', icon: 'user', tone: 'teal', category: 'trabalhar', order: 70 },
  'primeiros-dias-no-trabalho': { label: 'Primeiros dias', icon: 'briefcase', tone: 'sage', category: 'trabalhar', order: 80 },
};

const fallbackPresentation: CoursePresentation = {
  label: 'Carreira',
  icon: 'book',
  tone: 'sage',
  category: 'crescer',
  order: 999,
};

export function getCoursePresentation(slug: string): CoursePresentation {
  return presentations[slug] ?? fallbackPresentation;
}

export function compareCoursePresentation(a: { slug: string }, b: { slug: string }) {
  return getCoursePresentation(a.slug).order - getCoursePresentation(b.slug).order;
}
