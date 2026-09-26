import { renderResumeMarkup } from "../lib/renderResume";
import type { ResumeData, ResumeTemplate } from "../types";
import type { CSSProperties } from 'react';
import './resume-theme.css';

export function ResumePreview({ template, data, color }: { template: ResumeTemplate; data: ResumeData; color: string }) {
  const markup = renderResumeMarkup(template, data);
  return (
    <>
      <style>{template.css}</style>
      <div className="resume-document" style={{ '--theme-accent': color, '--accent': color } as CSSProperties} dangerouslySetInnerHTML={{ __html: markup }} />
    </>
  );
}
