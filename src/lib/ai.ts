export type AssistRequest =
  | { kind: "mentor"; message: string; history?: Array<{ role: "user" | "assistant"; content: string }> }
  | { kind: "resume"; text: string; role?: string }
  | { kind: "interview"; question: string; answer: string; role?: string };

export class CareerAssistError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

export async function requestCareerAssist(request: AssistRequest): Promise<string> {
  const response = await fetch("/api/ai/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { reply?: string; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !body?.reply) throw new CareerAssistError(body?.error?.message ?? "A assistência está indisponível.", body?.error?.code ?? "AI_UNAVAILABLE");
  return body.reply;
}

export function makeLocalInterviewFeedback(answer: string): string {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const hasAction = /\b(fiz|organizei|atendi|criei|resolvi|apoiei|planejei|aprendi|coordenei|desenvolvi|implementei)\b/i.test(answer);
  const hasResult = /\b(resultado|consegui|melhorou|reduzi|aumentou|aprendi|entreguei|finalizei)\b/i.test(answer);
  const notes = [
    words.length < 25 ? "Você pode acrescentar um exemplo concreto e explicar o contexto." : "Sua resposta já tem material para selecionar um exemplo específico.",
    hasAction ? "Você menciona uma ação própria; deixe claro qual parte foi sua." : "Experimente dizer o que você fez, usando verbos de ação e sem exagerar o seu papel.",
    hasResult ? "Você indica um resultado ou aprendizado; explique como percebeu essa mudança." : "Se puder, complete com o resultado ou com o que aprendeu, sem inventar números.",
  ];
  return `Roteiro de revisão local (sem IA)\n\n${notes.map((note) => `• ${note}`).join("\n")}\n\nRevise com suas palavras e mantenha apenas informações verdadeiras.`;
}

export function makeLocalMentorGuidance(message: string): string {
  const lower = message.toLocaleLowerCase("pt-BR");
  if (/entrevista|entrevistar|pergunta|responder/.test(lower)) return "Para se preparar para uma entrevista, releia a vaga, escolha dois exemplos reais e pratique uma resposta curta. Acesse o guia de entrevistas para perguntas comuns e um exercício privado.";
  if (/curr[ií]culo|resume|curriculum/.test(lower)) return "Comece pelos dados de contato essenciais, um resumo honesto, experiências e formação. Trabalho informal, projetos e voluntariado também podem demonstrar habilidades. O editor oferece modelos com filtros e salva o rascunho neste dispositivo.";
  if (/vaga|emprego|procur|candidat/.test(lower)) return "Defina alguns cargos-alvo, acompanhe as candidaturas em uma lista e reserve um período realista para buscar oportunidades. Desconfie de processos que cobram para participar.";
  if (/network|contato|linkedin|recrut|rela[cç][aã]o/.test(lower)) return "Ao iniciar uma conversa profissional, explique por que está entrando em contato e faça um pedido específico e possível. Respeite o tempo da pessoa e agradeça sem criar obrigação.";
  return "Posso ajudar com currículo, entrevistas, busca de vagas e relações profissionais. Conte qual etapa está mais difícil; evite incluir documentos, telefone, endereço ou outros dados pessoais.";
}
