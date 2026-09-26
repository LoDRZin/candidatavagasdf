import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import "./resume-demo.css";

const STAGES = ["Dados", "Resumo", "Experiência", "Revisão"] as const;
const STAGE_DURATION = 4300;
const NAME = "Ana Silva";
const SUMMARY = "Profissional organizada, com experiência em atendimento, planilhas e apoio administrativo.";
const EXPERIENCE = "Atendimento ao público, organização de documentos e atualização de planilhas.";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ResumeDemo() {
  const container = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState(() => ({ stage: prefersReducedMotion() ? 3 : 0, elapsed: 0 }));

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
      if (event.matches) {
        setPlaying(false);
        setPosition({ stage: 3, elapsed: 0 });
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: 0.15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible || reduced) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setPosition(({ stage, elapsed }) => {
        const next = elapsed + 50;
        return next >= STAGE_DURATION
          ? { stage: (stage + 1) % STAGES.length, elapsed: 0 }
          : { stage, elapsed: next };
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [playing, visible, reduced]);

  const { stage, elapsed } = position;
  const typedName = stage > 0 || reduced ? NAME : NAME.slice(0, Math.floor(elapsed / 95));
  const typedSummary = stage > 1 || reduced ? SUMMARY : stage === 1 ? SUMMARY.slice(0, Math.floor(elapsed / 38)) : "";
  const typedExperience = stage > 2 || reduced ? EXPERIENCE : stage === 2 ? EXPERIENCE.slice(0, Math.floor(elapsed / 42)) : "";
  const typingName = stage === 0 && typedName.length < NAME.length;
  const typingSummary = stage === 1 && typedSummary.length < SUMMARY.length;
  const typingExperience = stage === 2 && typedExperience.length < EXPERIENCE.length;
  const progress = ((stage + elapsed / STAGE_DURATION) / STAGES.length) * 100;

  return (
    <div className={`resume-demo-wrap${playing && visible && !reduced ? " is-playing" : ""}`} ref={container}>
      <div className="resume-demo-glow" aria-hidden="true" />
      <div className="resume-demo-shell" aria-label="Demonstração de um currículo sendo preenchido">
        <div className="resume-demo-head">
          <span><i className="resume-demo-signal" /> Seu currículo tomando forma</span>
          <span>Prévia ilustrativa</span>
        </div>
        <div className="resume-demo-stages" aria-label="Etapas da demonstração">
          {STAGES.map((label, index) => (
            <button
              type="button"
              key={label}
              className={index === stage ? "is-active" : index < stage ? "is-complete" : ""}
              aria-pressed={index === stage}
              onClick={() => { setPosition({ stage: index, elapsed: 0 }); setPlaying(false); }}
            >
              <span>{index < stage ? "✓" : index + 1}</span>{label}
            </button>
          ))}
        </div>
        <div className="resume-demo-workspace">
          <div className="resume-demo-paper" aria-hidden="true">
            <div className="resume-demo-paper-top"><span>CURRÍCULO PROFISSIONAL</span><span>c.</span></div>
            <div className="resume-demo-identity">
              <div className="resume-demo-avatar">A</div>
              <div><strong>{typedName}{typingName && playing && <i className="resume-demo-caret" />}</strong><small>Assistente administrativa</small></div>
            </div>
            <div className="resume-demo-contact">
              {stage > 0 || elapsed > 1200 ? <><span>ana.silva@email.com</span><span>São Paulo, SP</span></> : <><i /><i /></>}
            </div>
            <div className="resume-demo-section-title">SOBRE MIM</div>
            <p className="resume-demo-paragraph">{typedSummary}{typingSummary && playing && <i className="resume-demo-caret" />}</p>
            <div className="resume-demo-section-title">EXPERIÊNCIA</div>
            {stage >= 2 ? (
              <div className="resume-demo-job"><strong>Assistente administrativa</strong><small>Grupo Horizonte · 2023 — 2025</small><p>{typedExperience}{typingExperience && playing && <i className="resume-demo-caret" />}</p></div>
            ) : <div className="resume-demo-placeholder"><i /><i /><i /></div>}
            <div className="resume-demo-section-title">HABILIDADES</div>
            <div className="resume-demo-skills">
              {stage === 3 ? <><span>Organização</span><span>Atendimento</span><span>Excel</span></> : <><i /><i /><i /></>}
            </div>
            {stage === 3 && <div className="resume-demo-ready"><Icon name="check" size={14} /> Pronto para revisar</div>}
          </div>
        </div>
        <div className="resume-demo-footer">
          <span>{["Preenchendo seus dados", "Escrevendo o resumo", "Adicionando a experiência", "Hora de conferir"][stage]}</span>
          {reduced ? <span>Escolha uma etapa acima</span> : (
            <button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? "Pausar demonstração" : "Reproduzir demonstração"}>
              {playing ? "Pausar Ⅱ" : "Reproduzir ↗"}
            </button>
          )}
        </div>
        <div className="resume-demo-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="resume-demo-caption">Um currículo que tem a sua cara.</div>
    </div>
  );
}
