import { resumeSchema, type Suggestion } from './contracts';
import type { ResumeData, TemplateId } from '../src/types';
export type ResumeSection = keyof Suggestion['resume'];
function normalizedJson(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    return item;
  });
}
export function resumeFingerprint(value: { data: ResumeData; templateId: TemplateId; title: string }) { return normalizedJson(value); }
export function mergeSuggestion(data: ResumeData, suggestion: Suggestion, selected: ResumeSection[], mode: 'append' | 'replace', makeId = () => crypto.randomUUID()): ResumeData {
  const next = structuredClone(data), proposed = suggestion.resume;
  for (const section of selected) {
    if (section === 'profile') { if (proposed.profile.headline) next.profile.headline = proposed.profile.headline; }
    else if (section === 'summary') { if (proposed.summary) next.summary = proposed.summary; }
    else if (section === 'skills' || section === 'languages') {
      if (proposed[section].length) next[section] = [...new Set([...(mode === 'append' ? next[section] : []), ...proposed[section]].map(s => s.trim()).filter(Boolean))];
    } else if (proposed[section].length) {
      const existing = mode === 'append' ? next[section] : [];
      const seen = new Set(existing.map(({ id: _id, ...item }) => normalizedJson(item)));
      const additions = proposed[section].filter(item => { const signature = normalizedJson(item); if (seen.has(signature)) return false; seen.add(signature); return true; }).map(item => ({ ...item, id: makeId() }));
      Object.assign(next, { [section]: [...existing, ...additions] });
    }
  }
  return resumeSchema.parse(next);
}
