// Historical migrations are immutable. This generator owns only the explicit catalog manifests below.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const stamp = '2026-09-24T00:00:00.000Z';
const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const manifests = [
  {
    name: '0019',
    source: new URL('../content/course-catalog.json', import.meta.url),
    sourceLabel: 'content/course-catalog.json',
    destination: new URL('../migrations/0019_course_catalog.sql', import.meta.url),
    publishPilotDrafts: true,
  },
  {
    name: '0020',
    source: new URL('../content/course-catalog-wave-1.json', import.meta.url),
    sourceLabel: 'content/course-catalog-wave-1.json',
    destination: new URL('../migrations/0020_course_catalog_wave_1.sql', import.meta.url),
    publishPilotDrafts: false,
  },
];

export function generateCourseCatalogSql(courses, options = {}) {
  const sourceLabel = options.sourceLabel ?? 'content/course-catalog.json';
  const publishPilotDrafts = options.publishPilotDrafts ?? true;
  assert.ok(Array.isArray(courses) && courses.length > 0, 'Catalog must contain courses.');
  assert.equal(new Set(courses.map(course => course.id)).size, courses.length, 'Duplicate course ID.');
  assert.equal(new Set(courses.map(course => course.slug)).size, courses.length, 'Duplicate course slug.');
  const sql = [
    `-- Generated from ${sourceLabel} by scripts/seed-courses.mjs.`,
    '-- Do not change applied migrations; add a new migration for future editorial changes.',
    '-- Existing pilot lessons, archived courses and student progress are preserved.',
  ];
  if (publishPilotDrafts) {
    for (const id of ['pilot-course-1', 'pilot-course-2']) {
      sql.push(`UPDATE course_versions SET status='published',published_at=COALESCE(published_at,${quote(stamp)}) WHERE id=${quote(`${id}-v1`)} AND course_id=${quote(id)} AND status='draft' AND EXISTS (SELECT 1 FROM courses WHERE id=${quote(id)} AND status='draft');`);
      sql.push(`UPDATE courses SET status='published',published_at=COALESCE(published_at,${quote(stamp)}),updated_at=${quote(stamp)} WHERE id=${quote(id)} AND status='draft' AND EXISTS (SELECT 1 FROM course_versions WHERE id=${quote(`${id}-v1`)} AND course_id=${quote(id)} AND status='published');`);
    }
  }
  const insert = (table, values) => sql.push(`INSERT OR IGNORE INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.values(values).map(quote).join(',')});`);
  for (const c of courses) {
    assert.match(c.id, /^career-course-[a-z0-9-]+$/);
    assert.match(c.slug, /^[a-z0-9-]{1,100}$/);
    assert.ok(Number.isInteger(c.passScore) && c.passScore > 0 && c.passScore <= 100);
    const version = `${c.id}-v1`;
    insert('courses', { id: c.id, slug: c.slug, title: c.title, description: c.description, status: 'published', published_at: stamp, created_at: stamp, updated_at: stamp });
    insert('course_versions', { id: version, course_id: c.id, version: 1, status: 'published', pass_score: c.passScore, created_at: stamp, published_at: stamp });
    c.modules.forEach((m, mi) => {
      const mid = `${version}-m${mi}`;
      assert.ok(typeof m.title === 'string' && m.title.trim().length > 0 && Array.isArray(m.lessons) && m.lessons.length > 0, `Invalid module in ${c.title}`);
      insert('course_modules', { id: mid, course_version_id: version, title: m.title, position: mi });
      m.lessons.forEach((l, li) => {
        assert.ok(l.blocks.length >= 3 && l.blocks.every(block => typeof block.title === 'string' && block.title.trim() && typeof block.text === 'string' && block.text.trim().length > 100), `Lesson needs substantial explanatory blocks: ${l.title}`);
        assert.ok(l.questions.some(q => q.type === 'reflection') && l.questions.some(q => q.type !== 'reflection'), `Lesson needs exercise and reflection: ${l.title}`);
        const lid = `${mid}-l${li}`;
        insert('lessons', { id: lid, module_id: mid, title: l.title, content_json: JSON.stringify(l.blocks), estimated_minutes: 8, position: li });
        l.questions.forEach((q, qi) => {
          const correct = q.options.filter(o => o.correct).length;
          assert.ok(['single_choice', 'multiple_choice', 'reflection'].includes(q.type));
          assert.ok(typeof q.explanation === 'string' && q.explanation.trim().length > 30, `Exercise needs an explanation: ${q.prompt}`);
          assert.ok(q.type === 'reflection' ? q.options.length === 0 : q.options.length >= 2 && correct >= 1 && correct < q.options.length && (q.type !== 'single_choice' || correct === 1), `Invalid exercise: ${q.prompt}`);
          const qid = `${lid}-q${qi}`;
          insert('quiz_questions', { id: qid, lesson_id: lid, type: q.type, prompt: q.prompt, explanation: q.explanation, position: qi });
          q.options.forEach((o, oi) => insert('quiz_options', { id: `${qid}-o${oi}`, question_id: qid, label: o.label, is_correct: o.correct ? 1 : 0, position: oi }));
        });
      });
    });
  }
  return `${sql.join('\n')}\n`;
}

async function main() {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'), 'Only --check is supported.');
  const loaded = [];
  for (const manifest of manifests) {
    const courses = JSON.parse(await readFile(manifest.source, 'utf8'));
    loaded.push(...courses.map(course => ({ ...course, manifest: manifest.name })));
    const expected = generateCourseCatalogSql(courses, manifest);
    const existing = await readFile(manifest.destination, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing !== null && existing !== expected) {
      throw new Error(`${manifest.name} differs from its source. Do not rewrite an applied migration; create a new migration for content changes.`);
    }
    if (process.argv.includes('--check')) {
      assert.equal(existing, expected, `Generate migrations/${manifest.name} first.`);
    } else if (existing === null) {
      // Exclusive creation prevents accidentally replacing an existing migration.
      await writeFile(manifest.destination, expected, { flag: 'wx' });
    }
  }
  assert.equal(new Set(loaded.map(course => course.id)).size, loaded.length, 'Duplicate course ID between catalog manifests.');
  assert.equal(new Set(loaded.map(course => course.slug)).size, loaded.length, 'Duplicate course slug between catalog manifests.');
  const lessons = loaded.flatMap(c => c.modules.flatMap(m => m.lessons));
  console.log(`Catalog migrations verified: ${loaded.length} added courses, ${lessons.length} added lessons, ${lessons.reduce((count, l) => count + l.questions.length, 0)} added activities; historical migrations remain immutable.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
