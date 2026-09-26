import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { build } from 'esbuild';
import { generateCourseCatalogSql } from '../scripts/seed-courses.mjs';

const pilots = JSON.parse(await readFile(new URL('../content/course-pilots.json', import.meta.url), 'utf8'));
const additions = JSON.parse(await readFile(new URL('../content/course-catalog.json', import.meta.url), 'utf8'));
const waveOne = JSON.parse(await readFile(new URL('../content/course-catalog-wave-1.json', import.meta.url), 'utf8'));
const migrationDirectory = new URL('../migrations/', import.meta.url);
const migration = await readFile(new URL('0019_course_catalog.sql', migrationDirectory), 'utf8');
const waveOneMigration = await readFile(new URL('0020_course_catalog_wave_1.sql', migrationDirectory), 'utf8');
const earlierMigrations = await Promise.all((await readdir(migrationDirectory)).filter(name => name.endsWith('.sql') && name < '0019').sort().map(name => readFile(new URL(name, migrationDirectory), 'utf8')));

function databaseBeforeCatalog() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.transaction(() => earlierMigrations.forEach(sql => db.exec(sql)))();
  return db;
}

function databaseBeforeWaveOne() {
  const db = databaseBeforeCatalog();
  db.exec(migration);
  return db;
}

test('catálogo editorial atende ao contrato real e oferece explicação, exercício e reflexão em 22 aulas', async () => {
  const bundled = await build({ entryPoints: [resolve('shared/contracts.ts')], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  const { courseInput } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const courses = [...pilots, ...additions, ...waveOne];
  assert.equal(courses.length, 8);
  const lessons = courses.flatMap(course => {
    assert.equal(courseInput.safeParse(course).success, true, course.title);
    return course.modules.flatMap(module => module.lessons);
  });
  assert.equal(lessons.length, 22);
  assert.equal(lessons.reduce((sum, lesson) => sum + lesson.questions.length, 0), 44);
  for (const lesson of lessons) {
    assert.equal(lesson.blocks.length, 3, lesson.title);
    assert.ok(lesson.blocks.every(block => block.text.length > 100), lesson.title);
    assert.ok(lesson.questions.some(question => question.type === 'reflection'), lesson.title);
    for (const question of lesson.questions.filter(question => question.type !== 'reflection')) {
      const correct = question.options.filter(option => option.correct).length;
      assert.ok(correct > 0 && correct < question.options.length, question.prompt);
      if (question.type === 'single_choice') assert.equal(correct, 1, question.prompt);
    }
  }
});

test('instalação nova publica quatro cursos com dez aulas e pode repetir o seed sem duplicar conteúdo', () => {
  const db = databaseBeforeCatalog();
  try {
    db.exec(migration);
    const before = db.prepare('SELECT id,status,published_at FROM courses ORDER BY id').all();
    assert.equal(before.length, 4);
    assert.ok(before.every(course => course.status === 'published' && course.published_at));
    assert.equal(db.prepare("SELECT COUNT(*) count FROM course_versions WHERE status='published'").get().count, 4);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM lessons').get().count, 10);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM quiz_questions').get().count, 20);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM quiz_options').get().count, 34);
    db.exec(migration);
    assert.deepEqual(db.prepare('SELECT id,status,published_at FROM courses ORDER BY id').all(), before);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM lessons').get().count, 10);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
});

test('onda 1 adiciona quatro cursos e doze aulas de modo idempotente', () => {
  const db = databaseBeforeWaveOne();
  try {
    db.exec(waveOneMigration);
    const before = db.prepare('SELECT id,status,published_at FROM courses ORDER BY id').all();
    assert.equal(before.length, 8);
    assert.ok(before.every(course => course.status === 'published' && course.published_at));
    assert.equal(db.prepare("SELECT COUNT(*) count FROM course_versions WHERE status='published'").get().count, 8);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM lessons').get().count, 22);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM quiz_questions').get().count, 44);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM quiz_options').get().count, 74);
    db.exec(waveOneMigration);
    assert.deepEqual(db.prepare('SELECT id,status,published_at FROM courses ORDER BY id').all(), before);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM lessons').get().count, 22);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
});

test('onda 1 preserva catálogo anterior, matrícula, progresso e respostas existentes', () => {
  const db = databaseBeforeWaveOne();
  try {
    db.exec(`
      UPDATE lessons SET title='Título editorial preservado' WHERE id='career-course-job-search-v1-m0-l0';
      INSERT INTO users(id,name,email,created_at,updated_at) VALUES('wave-student','Aluno da onda','wave-student@example.test','2026-09-23','2026-09-23');
      INSERT INTO course_enrollments(user_id,course_version_id,started_at,last_lesson_id,updated_at) VALUES('wave-student','career-course-job-search-v1','2026-09-23','career-course-job-search-v1-m0-l0','2026-09-23');
      INSERT INTO lesson_progress(user_id,lesson_id,status,last_block,percent,revision,started_at,completed_at,updated_at) VALUES('wave-student','career-course-job-search-v1-m0-l0','completed',3,100,4,'2026-09-23','2026-09-23','2026-09-23');
      INSERT INTO quiz_attempts(id,user_id,lesson_id,score,passed,client_request_id,started_at,submitted_at) VALUES('wave-attempt','wave-student','career-course-job-search-v1-m0-l0',100,1,'wave-request','2026-09-23','2026-09-23');
      INSERT INTO quiz_answers(attempt_id,question_id,answer_json,correct) VALUES('wave-attempt','career-course-job-search-v1-m0-l0-q0','["career-course-job-search-v1-m0-l0-q0-o0"]',1);
    `);
    const preservedTables = ['course_enrollments', 'lesson_progress', 'quiz_attempts', 'quiz_answers'];
    const before = preservedTables.map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const priorCourses = db.prepare("SELECT id,slug,title,status,published_at FROM courses WHERE id NOT LIKE 'career-course-job-safety' AND id NOT LIKE 'career-course-digital-skills' AND id NOT LIKE 'career-course-teamwork' AND id NOT LIKE 'career-course-first-days' ORDER BY id").all();
    db.exec(waveOneMigration);
    assert.deepEqual(preservedTables.map(table => db.prepare(`SELECT * FROM ${table}`).all()), before);
    assert.deepEqual(db.prepare("SELECT id,slug,title,status,published_at FROM courses WHERE id NOT IN ('career-course-job-safety','career-course-digital-skills','career-course-teamwork','career-course-first-days') ORDER BY id").all(), priorCourses);
    assert.equal(db.prepare("SELECT title FROM lessons WHERE id='career-course-job-search-v1-m0-l0'").get().title, 'Título editorial preservado');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
});

test('atualização preserva curso arquivado, edição editorial, matrícula, progresso e respostas existentes', () => {
  const db = databaseBeforeCatalog();
  try {
    db.exec(`
      UPDATE courses SET status='archived' WHERE id='pilot-course-1';
      UPDATE course_versions SET status='archived' WHERE id='pilot-course-1-v1';
      UPDATE lessons SET title='Título já revisado' WHERE id='pilot-course-1-v1-m0-l0';
      INSERT INTO users(id,name,email,created_at,updated_at) VALUES('catalog-student','Aluno de teste','catalog-student@example.test','2026-09-21','2026-09-21');
      INSERT INTO course_enrollments(user_id,course_version_id,started_at,last_lesson_id,updated_at) VALUES('catalog-student','pilot-course-1-v1','2026-09-21','pilot-course-1-v1-m0-l0','2026-09-21');
      INSERT INTO lesson_progress(user_id,lesson_id,status,last_block,percent,revision,started_at,completed_at,updated_at) VALUES('catalog-student','pilot-course-1-v1-m0-l0','completed',3,100,7,'2026-09-21','2026-09-21','2026-09-21');
      INSERT INTO quiz_attempts(id,user_id,lesson_id,score,passed,client_request_id,started_at,submitted_at) VALUES('catalog-attempt','catalog-student','pilot-course-1-v1-m0-l0',100,1,'catalog-request','2026-09-21','2026-09-21');
      INSERT INTO quiz_answers(attempt_id,question_id,answer_json,correct) VALUES('catalog-attempt','pilot-course-1-v1-m0-l0-q0','["pilot-course-1-v1-m0-l0-q0-o1"]',1);
    `);
    const preservedTables = ['course_enrollments', 'lesson_progress', 'quiz_attempts', 'quiz_answers'];
    const before = preservedTables.map(table => db.prepare(`SELECT * FROM ${table}`).all());
    db.exec(migration);
    assert.equal(db.prepare("SELECT status FROM courses WHERE id='pilot-course-1'").get().status, 'archived');
    assert.equal(db.prepare("SELECT status FROM course_versions WHERE id='pilot-course-1-v1'").get().status, 'archived');
    assert.equal(db.prepare("SELECT title FROM lessons WHERE id='pilot-course-1-v1-m0-l0'").get().title, 'Título já revisado');
    assert.equal(db.prepare("SELECT status FROM courses WHERE id='pilot-course-2'").get().status, 'published');
    assert.deepEqual(preservedTables.map(table => db.prepare(`SELECT * FROM ${table}`).all()), before);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally { db.close(); }
});

test('publicações existentes mantêm suas datas e versões arquivadas não são reativadas', () => {
  const db = databaseBeforeCatalog();
  try {
    db.exec(`
      UPDATE courses SET status='published',published_at='2026-09-21',updated_at='2026-09-21' WHERE id='pilot-course-1';
      UPDATE course_versions SET status='published',published_at='2026-09-21' WHERE id='pilot-course-1-v1';
      UPDATE course_versions SET status='archived' WHERE id='pilot-course-2-v1';
    `);
    db.exec(migration);
    assert.deepEqual(db.prepare("SELECT status,published_at,updated_at FROM courses WHERE id='pilot-course-1'").get(), { status: 'published', published_at: '2026-09-21', updated_at: '2026-09-21' });
    assert.equal(db.prepare("SELECT published_at FROM course_versions WHERE id='pilot-course-1-v1'").get().published_at, '2026-09-21');
    assert.equal(db.prepare("SELECT status FROM course_versions WHERE id='pilot-course-2-v1'").get().status, 'archived');
    assert.equal(db.prepare("SELECT status FROM courses WHERE id='pilot-course-2'").get().status, 'draft');
  } finally { db.close(); }
});

test('gerador é determinístico e não modifica a migração histórica 0006', async () => {
  const historical = new URL('0006_pilot_courses.sql', migrationDirectory);
  const before = await readFile(historical, 'utf8');
  assert.equal(generateCourseCatalogSql(additions), migration);
  assert.equal(generateCourseCatalogSql(waveOne, { sourceLabel: 'content/course-catalog-wave-1.json', publishPilotDrafts: false }), waveOneMigration);
  assert.equal(generateCourseCatalogSql(additions), generateCourseCatalogSql(additions));
  execFileSync(process.execPath, [resolve('scripts/seed-courses.mjs')], { stdio: 'pipe' });
  execFileSync(process.execPath, [resolve('scripts/seed-courses.mjs'), '--check'], { stdio: 'pipe' });
  assert.equal(await readFile(historical, 'utf8'), before);
  assert.equal(await readFile(new URL('0019_course_catalog.sql', migrationDirectory), 'utf8'), migration);
  assert.equal(await readFile(new URL('0020_course_catalog_wave_1.sql', migrationDirectory), 'utf8'), waveOneMigration);
});
