import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
let contracts, merge, catalog;
before(async () => {
  await mkdir('.test-artifacts', { recursive: true });
  await build({ entryPoints: ['shared/contracts.ts', 'shared/resumeMerge.ts', 'shared/templateCatalog.ts'], outdir: '.test-artifacts/shared', outExtension: { '.js': '.mjs' }, bundle: true, format: 'esm', platform: 'node' });
  contracts = await import('../.test-artifacts/shared/contracts.mjs'); merge = await import('../.test-artifacts/shared/resumeMerge.mjs'); catalog = await import('../.test-artifacts/shared/templateCatalog.mjs');
});
const original = { profile: { name: 'Ana', headline: 'Área atual', email: 'ana@example.test', phone: '11999990000', location: 'Brasília', website: '' }, summary: 'Resumo anterior', experiences: [], education: [], projects: [{ id: 'original-project', title: 'Feira escolar', description: 'Organizei materiais', link: '' }], certifications: [], skills: ['Organização'], languages: ['Português'] };
const suggestion = { resume: { profile: { headline: 'Área proposta' }, summary: '', experiences: [], education: [], projects: [{ title: 'Feira escolar', description: 'Organizei materiais', link: '' }], certifications: [], skills: ['Planilhas', 'Planilhas'], languages: [] }, missingQuestions: [], warnings: [], evidence: [] };
test('aceite parcial preserva contatos e seções, não apaga campos vazios e deduplica listas', () => {
  const result = merge.mergeSuggestion(original, suggestion, ['summary', 'projects', 'skills', 'languages'], 'append');
  assert.deepEqual(result.profile, original.profile); assert.equal(result.summary, original.summary); assert.deepEqual(result.languages, original.languages);
  assert.deepEqual(result.skills, ['Organização', 'Planilhas']); assert.equal(result.projects.length, 1); assert.equal(result.projects[0].id, 'original-project');
  assert.deepEqual(original.skills, ['Organização']);
});
test('substituição explícita atribui IDs da aplicação e não reaproveita IDs do provedor', () => {
  const result = merge.mergeSuggestion(original, suggestion, ['profile', 'projects', 'skills'], 'replace', () => 'generated-id');
  assert.equal(result.profile.headline, 'Área proposta'); assert.equal(result.profile.email, original.profile.email); assert.equal(result.projects[0].id, 'generated-id'); assert.deepEqual(result.skills, ['Planilhas']);
});
test('autosave reconhece a resposta normalizada sem criar revisões repetidas', () => {
  const input = { data: original, templateId: 'ats-classico', title: ' Meu currículo ' };
  const roundtrip = { title: 'Meu currículo', templateId: 'ats-classico', data: JSON.parse(JSON.stringify(original)) };
  roundtrip.data.profile = Object.fromEntries(Object.entries(roundtrip.data.profile).reverse());
  assert.equal(merge.resumeFingerprint(input), merge.resumeFingerprint(roundtrip));
  roundtrip.data.summary = 'Mudou'; assert.notEqual(merge.resumeFingerprint(input), merge.resumeFingerprint(roundtrip));
});
test('sanitização mantém períodos e retorno interno bloqueia URLs externas', () => {
  const result = contracts.sanitizeNarrative('2023-01 a 2024-02, teste@example.test, (11) 99999-0000, 123.456.789-00');
  assert(result.includes('2023-01 a 2024-02')); assert(!result.includes('teste@example.test')); assert(!result.includes('99999-0000')); assert(!result.includes('123.456.789-00'));
  for (const value of ['//evil.test', '/\\evil.test', 'https://evil.test', '/api/auth/logout', '/\nevil']) assert.equal(contracts.safeReturnTo(value), '/dashboard');
  assert.equal(contracts.safeReturnTo('/editor?resume=abc'), '/editor?resume=abc');
});
test('catálogo atual tem IDs exclusivos e preserva os 100 modelos históricos', () => {
  assert.equal(catalog.editorialTemplates.length, catalog.editorialFamilies.length);
  assert.equal(catalog.editorialTemplates.length, 35);
  const ids = catalog.editorialTemplates.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert(ids.every(id => id.startsWith('layout-')));
  assert.equal(catalog.historicalEditorialIds.length, 100);
  for (const id of ids) assert.equal(contracts.templateSchema.safeParse(id).success, true);
  for (const item of catalog.historicalEditorialIds) {
    assert.equal(contracts.templateSchema.safeParse(item.id).success, true);
    assert.equal(catalog.canonicalTemplateId(item.id), item.layoutId);
    assert.equal(catalog.defaultColorForTemplate(item.id), item.color);
  }
  assert.equal(catalog.canonicalTemplateId('editorial-100'), 'layout-ribbon');
  assert.equal(catalog.templateDisplayName('ats-classico'), 'Clássico ATS');
  assert.equal(catalog.templateDisplayName('editorial-100'), 'Marcador Ribbon');
  assert.equal(catalog.editorialTemplates.filter(item => item.categoryKey === 'technology').length, 5);
  assert.equal(contracts.resumeSchema.safeParse({ ...original, accentColor: '#145f69' }).success, true);
  assert.equal(contracts.resumeSchema.safeParse({ ...original, accentColor: 'red' }).success, false);
  const merged = merge.mergeSuggestion({ ...original, accentColor: '#145f69' }, suggestion, ['skills'], 'append');
  assert.equal(merged.accentColor, '#145f69');
  assert.equal(contracts.templateSchema.safeParse('editorial-101').success, false);
});
