import { go } from './api';

export type JourneyType = '' | 'first_job' | 'returning' | 'transition' | 'growth';
export type WorkMode = 'onsite' | 'hybrid' | 'remote';
export type ApplicationStatus = 'saved' | 'applied' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';

export type CareerProfile = {
  journey_type: JourneyType;
  target_roles: string[];
  work_modes: WorkMode[];
  location_text: string;
  weekly_availability: number | null;
  main_challenge: string;
  updated_at?: string | null;
  revision?: number;
};

export type JobApplication = {
  id: string;
  company: string;
  role: string;
  source: string;
  source_url: string;
  location: string;
  work_mode: WorkMode | '';
  status: ApplicationStatus;
  salary_text: string;
  description_text: string;
  applied_at: string;
  next_action_at: string;
  resume_id?: string | null;
  cover_letter_id?: string | null;
  notes: string;
  created_at?: string;
  updated_at?: string;
  revision?: number;
};

export type ApplicationEvent = {
  id: string;
  event_type: string;
  from_status?: ApplicationStatus | null;
  to_status?: ApplicationStatus | null;
  note: string;
  occurred_at: string;
  created_at?: string;
};

export type ProfileResult = CareerProfile | { profile: CareerProfile | null } | null;
export type ApplicationResult = JobApplication | { application: JobApplication };

export const emptyProfile: CareerProfile = {
  journey_type: '', target_roles: [], work_modes: [], location_text: '', weekly_availability: null, main_challenge: '',
};

export const emptyApplication: Omit<JobApplication, 'id'> = {
  company: '', role: '', source: '', source_url: '', location: '', work_mode: '', status: 'saved', salary_text: '',
  description_text: '', applied_at: '', next_action_at: '', notes: '',
};

export const journeyOptions: { value: Exclude<JourneyType, ''>; title: string; detail: string }[] = [
  { value: 'first_job', title: 'Primeiro emprego', detail: 'Quero transformar estudos, projetos e experiências informais em oportunidades.' },
  { value: 'returning', title: 'Volta ao mercado', detail: 'Quero reorganizar minha trajetória e retomar a busca por trabalho.' },
  { value: 'transition', title: 'Transição de carreira', detail: 'Quero levar minhas experiências para uma nova área.' },
  { value: 'growth', title: 'Crescimento profissional', detail: 'Quero buscar uma nova função, promoção ou desafio.' },
];

export const workModeOptions: { value: WorkMode; label: string }[] = [
  { value: 'onsite', label: 'Presencial' }, { value: 'hybrid', label: 'Híbrido' }, { value: 'remote', label: 'Remoto' },
];

export const statusOptions: { value: ApplicationStatus; label: string; help: string }[] = [
  { value: 'saved', label: 'Tenho interesse', help: 'Vaga guardada para avaliar ou preparar.' },
  { value: 'applied', label: 'Candidatura enviada', help: 'Currículo ou formulário já foi enviado.' },
  { value: 'interview', label: 'Entrevista', help: 'Há uma conversa ou etapa seletiva em andamento.' },
  { value: 'offer', label: 'Proposta', help: 'A empresa fez uma proposta.' },
  { value: 'hired', label: 'Contratação', help: 'Processo concluído com contratação.' },
  { value: 'rejected', label: 'Não avançou', help: 'O processo foi encerrado pela empresa.' },
  { value: 'withdrawn', label: 'Desisti', help: 'Você decidiu não continuar.' },
];

export function statusLabel(status: ApplicationStatus) {
  return statusOptions.find(option => option.value === status)?.label ?? status;
}

export function eventLabel(type: string) {
  return ({ note: 'Anotação', contact: 'Contato com a empresa', follow_up: 'Acompanhamento', interview: 'Entrevista', status_changed: 'Mudança de etapa', created: 'Candidatura criada' } as Record<string, string>)[type] ?? 'Atualização';
}

export function currentWeekKey(now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export function asProfile(result: ProfileResult): CareerProfile {
  const value = result && 'profile' in result ? result.profile : result;
  if (!value) return { ...emptyProfile };
  return {
    ...emptyProfile,
    ...value,
    target_roles: asStringArray(value.target_roles),
    work_modes: asStringArray(value.work_modes).filter((item): item is WorkMode => workModeOptions.some(option => option.value === item)),
  };
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string' || !value.trim()) return [];
  try { return asStringArray(JSON.parse(value)); } catch { return value.split(',').map(item => item.trim()).filter(Boolean); }
}

export function asApplication(result: ApplicationResult) {
  return 'application' in result ? result.application : result;
}

export function localDate(value?: string | null, withTime = false) {
  if (!value) return 'Sem data definida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

export function inputDate(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

export function inputDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function toIsoOrEmpty(value: string) {
  return value ? new Date(value).toISOString() : '';
}

export function profileProgress(profile: CareerProfile) {
  const checks = [profile.journey_type, profile.target_roles.length, profile.work_modes.length, profile.location_text, profile.weekly_availability, profile.main_challenge];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

export function LinkButton({ href, children, className = 'button' }: { href: string; children: React.ReactNode; className?: string }) {
  return <a className={className} href={href} onClick={event => { event.preventDefault(); go(href); }}>{children}</a>;
}
