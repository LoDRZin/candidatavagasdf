import { z } from 'zod';
import { accentColors, isTemplateId } from './templateCatalog';

const text = z.string().trim().max(2000);
const short = z.string().trim().max(200);
const date = z.string().regex(/^(?:\d{4}-(?:0[1-9]|1[0-2]))?$/);
const list = z.array(short).max(40);
export const templateSchema = z.string().refine(isTemplateId, 'Modelo de currículo inválido');
export const accentColorSchema = z.enum(accentColors.map(item => item.value));
const experience = z.object({ role: short, company: short, location: short, startDate: date, endDate: date, current: z.boolean(), bullets: z.array(text).max(15) });
const education = z.object({ course: short, institution: short, location: short, startDate: date, endDate: date, status: short });
const project = z.object({ title: short, description: text, link: short });
const certification = z.object({ name: short, issuer: short, date });
export const resumeSchema = z.object({
  accentColor: accentColorSchema.optional(),
  profile: z.object({ name: short, headline: short, email: short, phone: short, location: short, website: short }),
  summary: text, experiences: z.array(experience.extend({ id: short.min(1) })).max(30),
  education: z.array(education.extend({ id: short.min(1) })).max(30),
  projects: z.array(project.extend({ id: short.min(1) })).max(30),
  certifications: z.array(certification.extend({ id: short.min(1) })).max(30), skills: list, languages: list,
});
export const suggestionSchema = z.object({
  resume: z.object({ profile: z.object({ headline: short }).strict(), summary: text,
    experiences: z.array(experience).max(30), education: z.array(education).max(30),
    projects: z.array(project).max(30), certifications: z.array(certification).max(30), skills: list, languages: list }).strict(),
  missingQuestions: z.array(z.object({ field: short, question: text }).strict()).max(30),
  warnings: z.array(text).max(20), evidence: z.array(z.object({ field: short, sourceText: text }).strict()).max(100),
}).strict();
export type Suggestion = z.infer<typeof suggestionSchema>;
export type User = { id: string; name: string; email: string; email_verified_at: string | null; role: 'member' | 'admin' };
export type ResumeRecord = { id: string; title: string; template_id: z.infer<typeof templateSchema>; data: z.infer<typeof resumeSchema>; revision: number; updated_at: string };
export const courseInput = z.object({ title: short.min(1), slug: z.string().regex(/^[a-z0-9-]{1,100}$/), description: text,
  passScore: z.number().int().min(0).max(100).nullable(), modules: z.array(z.object({ title: short.min(1), lessons: z.array(z.object({
    title: short.min(1), blocks: z.array(z.object({ title: short.min(1), text: text.min(1) })).min(1).max(30),
    questions: z.array(z.object({ type: z.enum(['single_choice', 'multiple_choice', 'reflection']), prompt: text.min(1), explanation: text,
      options: z.array(z.object({ label: short.min(1), correct: z.boolean() })).max(10) })).min(1).max(20),
  })).min(1).max(20) })).min(1).max(10) });
export type CourseInput = z.infer<typeof courseInput>;
export { safeReturnTo } from './access-policy';
export function sanitizeNarrative(value: string): string {
  return value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[e-mail removido]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento removido]')
    .replace(/(?:\+55\s*)?\(?\d{2}\)?\s*\d{4,5}[- ]?\d{4}\b/g, '[telefone removido]').trim();
}
