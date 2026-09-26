import type { ResumeData, TemplateId } from '../types';

const ATS_STOP_WORDS = new Set('para com uma uns umas pela pelo pelos pelas que como onde quando muito mais menos voce sua seu seus suas foi tem ter ser estar das dos aos isso este esta essas esses entre sobre depois antes cada todos todas pode podem ele eles quem qual quais tambem desde fazer esta sao nos nas nao sim ou e a o as os de da do em no na ao um uma por se meu minha eu trabalho vaga experiencia profissional habilidades requisitos atividades empresa equipe conhecimentos formacao curso'.split(' '));

function resumeSearchText(data: ResumeData) {
  return [data.profile.headline, data.summary, ...data.experiences.flatMap(item => [item.role, item.company, ...item.bullets]), ...data.projects.flatMap(item => [item.title, item.description]), ...data.skills, ...data.certifications.map(item => item.name)].join(' ').toLocaleLowerCase('pt-BR');
}

export function jobKeywordMatch(description: string, data: ResumeData) {
  const keywords = [...new Set((description.toLocaleLowerCase('pt-BR').match(/[a-zá-ú][a-zá-ú0-9+#.-]{3,}/gi) ?? []).map(word => word.replace(/[.,;:!?]+$/g, '')).filter(word => !ATS_STOP_WORDS.has(word)))].slice(0, 18);
  const text = resumeSearchText(data);
  return { matched: keywords.filter(word => text.includes(word)), missing: keywords.filter(word => !text.includes(word)) };
}

export function getResumeChecks(data: ResumeData, templateId: TemplateId) {
  const allDates = [...data.experiences, ...data.education];
  const inconsistentDates = allDates.filter(item => item.startDate && item.endDate && item.endDate < item.startDate && !('current' in item && item.current)).length;
  const longBullets = data.experiences.flatMap(item => item.bullets).filter(bullet => bullet.trim().length > 220).length;
  return [
    { ok: Boolean(data.profile.name.trim()), title: 'Nome incluído', detail: data.profile.name.trim() ? 'Seu nome aparece no currículo.' : 'Adicione seu nome.' },
    { ok: Boolean(data.profile.email.trim() || data.profile.phone.trim()), title: 'Meio de contato', detail: data.profile.email.trim() || data.profile.phone.trim() ? 'Inclua um contato que você monitora.' : 'Inclua um e-mail ou telefone de contato.' },
    { ok: Boolean(data.profile.headline.trim()), title: 'Objetivo profissional', detail: data.profile.headline.trim() ? 'A área ou cargo desejado está indicado.' : 'Indique o cargo ou a área que procura.' },
    { ok: Boolean(data.summary.trim()), title: 'Resumo profissional', detail: data.summary.trim() ? 'O resumo está preenchido e pode ser revisado para cada vaga.' : 'Um resumo curto pode ajudar a contextualizar sua trajetória.' },
    { ok: data.experiences.length + data.projects.length > 0, title: 'Experiências ou projetos', detail: data.experiences.length + data.projects.length > 0 ? 'Há exemplos da sua trajetória.' : 'Considere incluir trabalho, projeto, voluntariado ou atividade escolar.' },
    { ok: templateId === 'ats-classico', title: 'Leitura compatível com ATS', detail: templateId === 'ats-classico' ? 'O modelo escolhido usa uma leitura linear simples.' : 'Para plataformas de candidatura, considere o modelo Clássico ATS de uma coluna.' },
    { ok: inconsistentDates === 0, title: 'Ordem das datas', detail: inconsistentDates ? `Revise ${inconsistentDates} período(s) em que o início aparece depois do fim.` : 'Não encontramos períodos com datas invertidas.' },
    { ok: longBullets === 0, title: 'Descrições objetivas', detail: longBullets ? `Considere encurtar ${longBullets} item(ns) muito longos.` : 'As descrições de experiência estão em tamanho moderado.' },
  ];
}
