import { useMemo, useState } from 'react';
import { TemplateCard } from './TemplateCard';
import { templates } from '../data/templates';
import type { TemplateId } from '../types';
import { accentColors, canonicalTemplateId, defaultColorForTemplate } from '../../shared/templateCatalog';
import './template-catalog.css';

const PAGE_SIZE = 12;
const categories = [
  { value: 'all', label: 'Todas as categorias' },
  { value: 'classic', label: 'Tradicional / ATS' },
  { value: 'academic', label: 'Acadêmico / Estágio' },
  { value: 'business', label: 'Profissional / Executivo' },
  { value: 'creative', label: 'Criativo / Portfólio' },
  { value: 'special', label: 'Especializado' },
  { value: 'technology', label: 'Tecnologia / Cyber' },
  { value: 'original', label: 'Modelos originais' },
] as const;

function searchable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function TemplateCatalog({ selectedId, accentColor, onSelect, onColorChange }: { selectedId: TemplateId; accentColor?: string; onSelect: (id: TemplateId) => void; onColorChange: (color: string) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('default');
  const [page, setPage] = useState(1);
  const visible = useMemo(() => {
    const term = searchable(query.trim());
    const rows = templates.filter(template => {
      const matchesCategory = category === 'all' || (category === 'original' ? !template.family : template.categoryKey === category);
      const matchesTerm = !term || searchable(`${template.name} ${template.category} ${template.description}`).includes(term);
      return matchesCategory && matchesTerm;
    });
    if (sort === 'az') rows.sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
    if (sort === 'category') rows.sort((left, right) => left.category.localeCompare(right.category, 'pt-BR') || left.name.localeCompare(right.name, 'pt-BR'));
    return rows;
  }, [query, category, sort]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const selected = templates.find(template => template.id === canonicalTemplateId(selectedId));
  const color = accentColor ?? defaultColorForTemplate(selectedId);

  return <div className="template-catalog">
    <div className="template-catalog-controls">
      <label>Buscar modelo<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Nome, área ou finalidade" /></label>
      <label>Categoria<select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}>{categories.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <label>Ordenar<select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="default">Ordem do catálogo</option><option value="az">Nome A–Z</option><option value="category">Categoria</option></select></label>
    </div>
    <fieldset className="template-color-picker"><legend>Cor do currículo</legend><div>{accentColors.map(item => <button type="button" key={item.value} className={color === item.value ? 'is-selected' : ''} style={{ backgroundColor: item.value }} aria-label={`Cor ${item.name}`} aria-pressed={color === item.value} title={item.name} onClick={() => onColorChange(item.value)} />)}</div><small>{accentColors.find(item => item.value === color)?.name ?? 'Cor padrão'} · aplica-se à prévia e ao PDF</small></fieldset>
    <p className="template-catalog-status" role="status">{visible.length} {visible.length === 1 ? 'modelo encontrado' : 'modelos encontrados'} · selecionado: <strong>{selected?.name ?? 'Clássico ATS'}</strong></p>
    <div className="model-grid">{visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(template => <TemplateCard key={template.id} template={template} color={color} selected={template.id === canonicalTemplateId(selectedId)} onClick={() => onSelect(template.id)} />)}</div>
    {!visible.length && <p className="template-catalog-empty">Nenhum modelo corresponde aos filtros. Tente outro termo ou categoria.</p>}
    {pages > 1 && <nav className="template-catalog-pages" aria-label="Páginas dos modelos"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage} de {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Próxima</button></nav>}
  </div>;
}
