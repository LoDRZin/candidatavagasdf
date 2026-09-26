CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE course_versions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  pass_score INTEGER CHECK (pass_score BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE(course_id, version)
);

CREATE TABLE course_modules (
  id TEXT PRIMARY KEY,
  course_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE(course_version_id, position)
);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 5,
  position INTEGER NOT NULL,
  UNIQUE(module_id, position)
);

CREATE TABLE quiz_questions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('single_choice', 'multiple_choice', 'reflection')),
  prompt TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL
);

CREATE TABLE quiz_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL
);

CREATE TABLE course_enrollments (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_version_id TEXT NOT NULL REFERENCES course_versions(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  last_lesson_id TEXT REFERENCES lessons(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, course_version_id)
);

CREATE TABLE lesson_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed')),
  last_block INTEGER NOT NULL DEFAULT 0,
  percent INTEGER NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  revision INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, lesson_id)
);

CREATE TABLE quiz_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  passed INTEGER NOT NULL DEFAULT 0 CHECK (passed IN (0, 1)),
  client_request_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  UNIQUE(user_id, client_request_id)
);

CREATE TABLE quiz_answers (
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  answer_json TEXT NOT NULL,
  correct INTEGER CHECK (correct IN (0, 1)),
  PRIMARY KEY(attempt_id, question_id)
);
