import { useMemo, useState } from 'react';
import { go } from './api';

type SafetySignal = { id: string; level: 'alto' | 'atenção'; title: string; detail: string };

const safetyRules: { id: string; level: SafetySignal['level']; title: string; detail: string; pattern: RegExp }[] = [
  { id: 'payment', level: 'alto', title: 'Cobrança para participar', detail: 'Empregadores legítimos normalmente não cobram taxa, inscrição, treinamento obrigatório ou depósito para liberar uma vaga.', pattern: /(?:pague|pagamento|taxa|dep[oó]sito|pix).{0,45}(?:vaga|processo|sele[cç][aã]o|cadastro|contrata[cç][aã]o)|(?:vaga|processo|sele[cç][aã]o).{0,45}(?:pague|taxa|dep[oó]sito|pix)/i },
  { id: 'purchase', level: 'alto', title: 'Compra exigida pelo recrutador', detail: 'Desconfie quando a contratação depende de comprar kit, curso, uniforme, equipamento ou produto indicado pela própria pessoa recrutadora.', pattern: /(?:comprar|adquirir|pagar).{0,50}(?:kit|curso|uniforme|equipamento|material|produto)/i },
  { id: 'banking', level: 'alto', title: 'Pedido precoce de dados financeiros', detail: 'Dados bancários, senha, código de confirmação e cartão não devem ser exigidos antes de uma contratação legítima e verificável.', pattern: /(?:senha|token|c[oó]digo de confirma[cç][aã]o|cart[aã]o|dados banc[aá]rios|conta banc[aá]ria|ag[eê]ncia).{0,70}(?:envie|informar|mande|necess[aá]rio|obrigat[oó]rio)|(?:envie|informe|mande|compartilhe).{0,70}(?:senha|token|c[oó]digo de confirma[cç][aã]o|cart[aã]o|dados banc[aá]rios|conta banc[aá]ria|ag[eê]ncia)/i },
  { id: 'documents', level: 'atenção', title: 'Documentos pessoais muito cedo', detail: 'Confirme a empresa e a etapa antes de enviar documentos. Para uma conversa inicial, currículo e contato costumam bastar.', pattern: /(?:cpf|rg|cnh|comprovante de resid[eê]ncia|foto do documento|carteira de trabalho).{0,70}(?:envie|mande|anexe|whatsapp|cadastro)/i },
  { id: 'income', level: 'atenção', title: 'Promessa de renda sem contexto', detail: 'Promessas de ganho garantido, muito alto ou sem esforço merecem verificação cuidadosa.', pattern: /(?:renda|ganho|sal[aá]rio).{0,45}(?:garantid[oa]|sem esfor[cç]o|imediat[oa]|por dia)|ganhe.{0,30}(?:por dia|sem sair de casa|sem experi[eê]ncia)/i },
  { id: 'urgency', level: 'atenção', title: 'Pressão para agir imediatamente', detail: 'Urgência exagerada pode ser usada para impedir que você pesquise a empresa e leia as condições.', pattern: /(?:[uú]ltima chance|somente hoje|agora ou nunca|responda imediatamente|vagas acabam hoje|n[aã]o conte para ningu[eé]m)/i },
  { id: 'untraceable', level: 'atenção', title: 'Contato difícil de verificar', detail: 'Procure o domínio oficial, site, endereço e canais públicos da empresa antes de continuar.', pattern: /(?:somente|apenas).{0,20}(?:whatsapp|telegram)|(?:gmail|hotmail|outlook|yahoo)\.com.{0,50}(?:recrutamento|rh|vaga)/i },
  { id: 'crypto', level: 'alto', title: 'Pedido envolvendo criptoativos ou movimentação de dinheiro', detail: 'Uma vaga não deve exigir que você receba, transfira ou converta dinheiro para terceiros.', pattern: /(?:bitcoin|criptomoeda|usdt|carteira digital|transferir valores|receber dinheiro e repassar)/i },
];

function analyzeSafety(value: string): SafetySignal[] {
  const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const found = safetyRules.filter(rule => rule.pattern.test(normalized)).map(({ pattern: _pattern, ...signal }) => signal);
  if (normalized.length > 100 && !/(?:empresa|companhia|institui[cç][aã]o|organiza[cç][aã]o|loja|escrit[oó]rio|ind[uú]stria|com[eé]rcio)/i.test(normalized)) found.push({ id: 'company', level: 'atenção', title: 'Empresa pouco identificada', detail: 'O texto não deixa clara a organização responsável. Peça razão social, site e canal oficial antes de compartilhar dados.' });
  if (normalized.length > 100 && !/(?:atividade|responsabilidade|fun[cç][aã]o|cargo|rotina|requisito)/i.test(normalized)) found.push({ id: 'role', level: 'atenção', title: 'Função pouco explicada', detail: 'Uma oportunidade confiável costuma explicar atividades, vínculo, horário ou requisitos básicos.' });
  return found;
}

export function JobSafetyPage() {
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(false);
  const signals = useMemo(() => checked ? analyzeSafety(text) : [], [checked, text]);
  const high = signals.filter(signal => signal.level === 'alto').length;
  return <main className="platform-page career-tool-page"><button className="tool-back" type="button" onClick={() => go('/dashboard')}>← Voltar ao painel</button><div className="platform-heading"><span className="eyebrow">SEGURANÇA NA BUSCA</span><h1>Confira sinais que merecem verificação</h1><p>Cole o texto de uma oportunidade. A análise acontece somente no navegador e não afirma se uma vaga é verdadeira ou falsa.</p></div><section className="platform-card safety-input"><label>Texto da oportunidade<textarea rows={10} maxLength={12000} value={text} onChange={event => { setText(event.target.value); setChecked(false); }} placeholder="Cole aqui a descrição, mensagem ou proposta recebida. Remova dados pessoais antes de analisar." /></label><div><small>{text.length}/12000 · nada é enviado para IA ou servidor</small><button className="button button-primary" disabled={text.trim().length < 20} onClick={() => setChecked(true)}>Verificar sinais</button></div></section>{checked && <section className={`platform-card safety-result ${high ? 'has-high-risk' : ''}`} aria-live="polite"><span className="eyebrow">RESULTADO ORIENTATIVO</span><h2>{signals.length ? `Encontramos ${signals.length} ${signals.length === 1 ? 'ponto' : 'pontos'} para conferir` : 'Nenhum sinal desta lista foi identificado'}</h2><p>{signals.length ? 'Pesquise a empresa em canais oficiais antes de continuar. Um alerta isolado não prova fraude, mas merece confirmação.' : 'Isso não garante que a oportunidade seja segura. Confirme empresa, pessoas envolvidas e condições em canais oficiais.'}</p>{signals.length > 0 && <ul>{signals.map(signal => <li key={signal.id}><span>{signal.level === 'alto' ? 'CUIDADO' : 'CONFIRA'}</span><div><strong>{signal.title}</strong><p>{signal.detail}</p></div></li>)}</ul>}<div className="safety-checklist"><h3>Antes de continuar</h3><ol><li>Procure o site e os canais oficiais da empresa por conta própria.</li><li>Confirme se a pessoa recrutadora realmente trabalha na organização.</li><li>Não pague para participar e não compartilhe senhas ou códigos.</li><li>Envie documentos apenas quando a etapa e a finalidade estiverem claras.</li><li>Se estiver em dúvida, converse com alguém de confiança antes de agir.</li></ol></div></section>}<p className="tool-disclaimer">A ferramenta usa regras simples, pode deixar passar riscos e não substitui investigação, orientação jurídica ou comunicação com autoridades.</p></main>;
}

type ContactKind = 'information' | 'thanks' | 'follow_up' | 'accept' | 'decline' | 'feedback';
const contactOptions: { value: ContactKind; label: string; hint: string }[] = [
  { value: 'information', label: 'Pedir informação sobre uma área', hint: 'Uma abordagem curta para aprender com alguém da área.' },
  { value: 'thanks', label: 'Agradecer uma conversa', hint: 'Para agradecer uma orientação ou indicação.' },
  { value: 'follow_up', label: 'Perguntar sobre o andamento', hint: 'Acompanhamento educado depois de uma candidatura.' },
  { value: 'accept', label: 'Responder a um convite de entrevista', hint: 'Confirmar interesse, data e próximos detalhes.' },
  { value: 'decline', label: 'Recusar uma oportunidade', hint: 'Recusar com respeito, sem precisar justificar demais.' },
  { value: 'feedback', label: 'Pedir feedback após entrevista', hint: 'Solicitar um retorno breve sobre o processo.' },
];

function greeting(person: string) { return person.trim() ? `Olá, ${person.trim()}.` : 'Olá!'; }
function roleText(role: string, company: string) { return [role.trim(), company.trim()].filter(Boolean).join(' na '); }
function makeContactDraft(kind: ContactKind, person: string, company: string, role: string, context: string) {
  const target = roleText(role, company) || 'a oportunidade';
  const extra = context.trim() ? `\n\n${context.trim()}` : '';
  const close = '\n\nObrigado(a) pela atenção.';
  const templates: Record<ContactKind, string> = {
    information: `${greeting(person)}\n\nEstou conhecendo melhor a área de ${role.trim() || 'seu trabalho'} e gostaria de entender como é a rotina e quais conhecimentos ajudam quem está começando. Se você puder compartilhar uma orientação breve, já será muito útil.${extra}${close}`,
    thanks: `${greeting(person)}\n\nQuero agradecer pela conversa e pelas orientações sobre ${target}. Elas me ajudaram a organizar melhor meus próximos passos.${extra}${close}`,
    follow_up: `${greeting(person)}\n\nParticipei do processo para ${target} e gostaria de saber, quando for possível, se há alguma atualização sobre as próximas etapas.${extra}${close}`,
    accept: `${greeting(person)}\n\nObrigado(a) pelo convite para conversar sobre ${target}. Tenho interesse em participar. Poderia confirmar a data, o horário, o formato e se preciso preparar algum documento?${extra}${close}`,
    decline: `${greeting(person)}\n\nAgradeço o contato e a oportunidade relacionada a ${target}. Neste momento, decidi não continuar no processo. Desejo um bom andamento na seleção.${extra}${close}`,
    feedback: `${greeting(person)}\n\nObrigado(a) pela oportunidade de conversar sobre ${target}. Se for possível, gostaria de receber um retorno breve sobre pontos que posso desenvolver para processos futuros.${extra}${close}`,
  };
  return templates[kind];
}

export function ContactTemplatesPage() {
  const [kind, setKind] = useState<ContactKind>('follow_up');
  const [person, setPerson] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [context, setContext] = useState('');
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  function generate() { setDraft(makeContactDraft(kind, person, company, role, context)); setNotice(''); }
  async function copy() {
    try { await navigator.clipboard.writeText(draft); setNotice('Texto copiado. Revise antes de enviar.'); }
    catch { setNotice('Não foi possível copiar automaticamente. Selecione o texto abaixo.'); }
  }
  return <main className="platform-page career-tool-page"><button className="tool-back" type="button" onClick={() => go('/dashboard')}>← Voltar ao painel</button><div className="platform-heading"><span className="eyebrow">CONTATOS PROFISSIONAIS</span><h1>Monte uma mensagem clara e respeitosa</h1><p>Escolha a situação e ajuste o texto com suas palavras. A plataforma cria apenas um rascunho local e nunca envia mensagens em seu nome.</p></div><div className="contact-tool-layout"><section className="platform-card contact-builder"><label>Situação<select value={kind} onChange={event => { setKind(event.target.value as ContactKind); setDraft(''); }} >{contactOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{contactOptions.find(option => option.value === kind)?.hint}</small></label><div className="contact-fields"><label>Nome da pessoa<input maxLength={120} value={person} onChange={event => setPerson(event.target.value)} placeholder="Opcional" /></label><label>Empresa<input maxLength={160} value={company} onChange={event => setCompany(event.target.value)} placeholder="Opcional" /></label><label>Cargo ou área<input maxLength={160} value={role} onChange={event => setRole(event.target.value)} placeholder="Ex.: Atendimento" /></label></div><label>Contexto que deseja acrescentar<textarea rows={4} maxLength={1200} value={context} onChange={event => setContext(event.target.value)} placeholder="Opcional. Inclua somente o necessário e evite dados sensíveis." /></label><button className="button button-primary" onClick={generate}>Criar rascunho local</button></section><section className="platform-card contact-preview"><span className="eyebrow">RASCUNHO EDITÁVEL</span>{draft ? <><textarea aria-label="Rascunho da mensagem" rows={15} maxLength={3000} value={draft} onChange={event => setDraft(event.target.value)} /><div><button className="button" onClick={() => { void copy(); }}>Copiar texto</button><button className="button" onClick={() => { setDraft(''); setNotice(''); }}>Limpar</button></div>{notice && <p role="status" className="success-note">{notice}</p>}</> : <div className="contact-empty"><strong>O texto aparecerá aqui</strong><p>Revise nomes, datas e informações antes de copiar.</p></div>}</section></div><p className="tool-disclaimer">Nenhuma mensagem é enviada automaticamente. Você decide onde, quando e para quem encaminhar o rascunho.</p></main>;
}
