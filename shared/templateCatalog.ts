// IDs antigos continuam aceitos para que currículos e versões já salvos abram sem migração.
export const legacyTemplateIds = [
  'ats-classico', 'verde-editorial', 'moderno-lateral', 'executivo-azul',
  'minimalista-areia', 'editorial-terra', 'compacto-mono', 'duas-colunas',
] as const;

export const accentColors = [
  { name: 'Verde', value: '#16834e' }, { name: 'Azul', value: '#2f4d77' },
  { name: 'Terracota', value: '#7d4d39' }, { name: 'Grafite', value: '#343a3d' },
  { name: 'Areia', value: '#806344' }, { name: 'Roxo', value: '#6b356b' },
  { name: 'Ciano', value: '#145f69' }, { name: 'Vinho', value: '#943d4f' },
] as const;
export type AccentColor = (typeof accentColors)[number]['value'];
export const defaultAccentColor: AccentColor = '#16834e';

export const editorialFamilies = [
  { name: 'Editorial Numerado', slug: 'numbered', category: 'classic', description: 'Seções numeradas e hierarquia textual' },
  { name: 'Duas Colunas', slug: 'two', category: 'business', description: 'Resumo amplo com informações laterais' },
  { name: 'Trilho Lateral', slug: 'sidebar-paper', category: 'business', description: 'Barra lateral fixa e conteúdo principal' },
  { name: 'Cabeçalho em Faixa', slug: 'band', category: 'business', description: 'Nome em bloco de destaque' },
  { name: 'Centro Minimal', slug: 'center', category: 'classic', description: 'Cabeçalho central e leitura limpa' },
  { name: 'Editorial Serif', slug: 'editorial', category: 'creative', description: 'Composição inspirada em publicação' },
  { name: 'Timeline de Carreira', slug: 'timeline', category: 'academic', description: 'Histórico visual por datas' },
  { name: 'Resumo Escuro', slug: 'dark', category: 'business', description: 'Contraste alto e aspecto sóbrio' },
  { name: 'Seções em Caixas', slug: 'boxed', category: 'business', description: 'Cada bloco isolado visualmente' },
  { name: 'Resultados', slug: 'metrics', category: 'business', description: 'Experiências em evidência' },
  { name: 'Declaração Profissional', slug: 'quote', category: 'business', description: 'Resumo inicial em forma de declaração' },
  { name: 'Cabeçalho Horizontal', slug: 'widehead', category: 'classic', description: 'Informações distribuídas no topo' },
  { name: 'Rodapé Marcante', slug: 'footer', category: 'creative', description: 'Identidade concentrada no rodapé' },
  { name: 'Caderno Editorial', slug: 'notebook', category: 'academic', description: 'Linhas e índice lateral' },
  { name: 'Corte Diagonal', slug: 'diagonal', category: 'creative', description: 'Mudança de plano no cabeçalho' },
  { name: 'Grid Suave', slug: 'gridpaper', category: 'creative', description: 'Organização baseada em malha' },
  { name: 'Serif Clássico', slug: 'serif', category: 'classic', description: 'Tipografia clássica com estrutura moderna' },
  { name: 'Cartão Profissional', slug: 'resume-card', category: 'business', description: 'Blocos em um cartão editorial' },
  { name: 'Portal de Perfil', slug: 'portal', category: 'special', description: 'Visual de página de perfil' },
  { name: 'Duas Colunas Compactas', slug: 'columns', category: 'special', description: 'Alta densidade em colunas' },
  { name: 'Matriz de Habilidades', slug: 'skills', category: 'special', description: 'Competências em destaque' },
  { name: 'Perfil com Monograma', slug: 'photo', category: 'business', description: 'Monograma no lugar de foto pessoal' },
  { name: 'Marcador Ribbon', slug: 'ribbon', category: 'creative', description: 'Sinalização visual no topo' },
  { name: 'Cyber Neon', slug: 'cyber-neon', category: 'technology', description: 'Painel escuro, acentos luminosos e trilho lateral' },
  { name: 'Cyber Terminal', slug: 'cyber-terminal', category: 'technology', description: 'Hierarquia de terminal com divisórias técnicas' },
  { name: 'Cyber Circuito', slug: 'cyber-circuit', category: 'technology', description: 'Linha de carreira conectada por nós' },
  { name: 'Código Limpo', slug: 'code-clean', category: 'technology', description: 'Tipografia monoespaçada e leitura objetiva' },
  { name: 'Blueprint', slug: 'blueprint', category: 'technology', description: 'Grade técnica, barras e seções traçadas' },
  { name: 'Brutalista', slug: 'brutalist', category: 'creative', description: 'Tipografia ampla e bordas fortes' },
  { name: 'Magazine', slug: 'magazine', category: 'creative', description: 'Nome em manchete e colunas editoriais' },
  { name: 'Bento', slug: 'bento', category: 'creative', description: 'Conteúdo organizado em cartões modulares' },
  { name: 'Vertical', slug: 'vertical', category: 'special', description: 'Faixa vertical de identidade e corpo amplo' },
  { name: 'Ticket', slug: 'ticket', category: 'creative', description: 'Separadores pontilhados e cabeçalho compacto' },
  { name: 'Portfólio Visual', slug: 'portfolio', category: 'creative', description: 'Projetos como blocos principais' },
  { name: 'Dossiê Acadêmico', slug: 'dossier', category: 'academic', description: 'Formação e cursos com índice lateral' },
] as const;

export const editorialCategoryLabels = {
  classic: 'Tradicional / ATS', academic: 'Acadêmico / Estágio',
  business: 'Profissional / Executivo', creative: 'Criativo / Portfólio',
  special: 'Especializado', technology: 'Tecnologia / Cyber',
} as const;

export const editorialTemplates = editorialFamilies.map(family => ({
  id: `layout-${family.slug}`,
  name: family.name,
  family: family.slug,
  categoryKey: family.category,
  category: editorialCategoryLabels[family.category],
  description: family.description,
}));

// O catálogo anterior tinha cinco cores para as oito primeiras famílias e quatro para as demais.
export const historicalEditorialIds = editorialFamilies.slice(0, 23).flatMap((family, index) =>
  Array.from({ length: index < 8 ? 5 : 4 }, (_, variant) => ({
    id: `editorial-${String(editorialFamilies.slice(0, index).reduce((total, _, previous) => total + (previous < 8 ? 5 : 4), 0) + variant + 1).padStart(3, '0')}`,
    layoutId: `layout-${family.slug}`,
    color: accentColors[variant]!.value,
  })));
const previousTemplate = new Map(historicalEditorialIds.map(item => [item.id, item]));
const legacyDefaultColors: Record<string, AccentColor> = {
  'ats-classico': '#16834e', 'verde-editorial': '#16834e', 'moderno-lateral': '#16834e',
  'executivo-azul': '#2f4d77', 'minimalista-areia': '#806344',
  'editorial-terra': '#7d4d39', 'compacto-mono': '#343a3d', 'duas-colunas': '#145f69',
};
export const validTemplateIds = new Set<string>([
  ...legacyTemplateIds, ...editorialTemplates.map(item => item.id), ...historicalEditorialIds.map(item => item.id),
]);
export function isTemplateId(value: string): boolean { return validTemplateIds.has(value); }
export function canonicalTemplateId(value: string): string { return previousTemplate.get(value)?.layoutId ?? value; }
const legacyTemplateNames: Record<string, string> = {
  'ats-classico': 'Clássico ATS',
  'verde-editorial': 'Verde editorial',
  'moderno-lateral': 'Moderno lateral',
  'executivo-azul': 'Executivo azul',
  'minimalista-areia': 'Minimalista areia',
  'editorial-terra': 'Editorial terracota',
  'compacto-mono': 'Compacto mono',
  'duas-colunas': 'Duas colunas',
};
export function templateDisplayName(value: string): string {
  const id = canonicalTemplateId(value);
  return legacyTemplateNames[id] ?? editorialTemplates.find(template => template.id === id)?.name ?? 'Clássico ATS';
}
export function defaultColorForTemplate(value: string): AccentColor {
  if (previousTemplate.has(value)) return previousTemplate.get(value)!.color;
  const legacyColor = legacyDefaultColors[value];
  if (legacyColor) return legacyColor;
  return value.startsWith('layout-cyber') || value === 'layout-code-clean' || value === 'layout-blueprint' ? '#145f69' : defaultAccentColor;
}
