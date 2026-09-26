import type { ResumeTemplate } from "../types";
import type { CSSProperties } from "react";

const palettes: Record<string, string[]> = {
  "ats-classico": ["#ffffff", "#335f4c", "#d9e1dc", "#202a27"],
  "verde-editorial": ["#ffffff", "#547763", "#dfe7e1", "#25352e"],
  "moderno-lateral": ["#ffffff", "#356b53", "#eef3ef", "#23342d"],
  "executivo-azul": ["#ffffff", "#315a78", "#eaf0f5", "#253342"],
  "minimalista-areia": ["#ffffff", "#98785b", "#f4eee6", "#342f2a"],
  "editorial-terra": ["#fffdfa", "#a6543d", "#f6ece6", "#382e29"],
  "compacto-mono": ["#ffffff", "#303438", "#eceeef", "#25292c"],
  "duas-colunas": ["#ffffff", "#58717a", "#eaf0f0", "#27373a"],
};

export function TemplateCard({ template, selected, color, onClick }: { template: ResumeTemplate; selected?: boolean; color: string; onClick: () => void }) {
  const palette = palettes[template.id] ?? ["#ffffff", color, "#eef2ee", "#252d2a"];
  return (
    <button type="button" className={`template-card${selected ? " is-selected" : ""}`} onClick={onClick} aria-pressed={selected}>
      <div className={`template-thumb thumb-${template.family ?? template.id}`} style={{ "--thumb-paper": palette[0], "--thumb-accent": color, "--thumb-wash": palette[2], "--thumb-ink": palette[3] } as CSSProperties}>
        <div className="thumb-sheet">
          <div className="thumb-name" />
          <div className="thumb-subtitle" />
          <div className="thumb-contact"><i /><i /><i /></div>
          <div className="thumb-section"><i /><b /><b /><b /></div>
          <div className="thumb-section"><i /><b /><b /></div>
        </div>
      </div>
      <div className="template-card-copy"><span>{template.category}</span><strong>{template.name}</strong><small>{template.description}</small></div>
      {selected && <span className="template-check" aria-label="Selecionado">✓</span>}
    </button>
  );
}
