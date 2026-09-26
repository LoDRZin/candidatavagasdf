CREATE TABLE interview_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  scheduled_at TEXT,
  format TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (format IN ('unspecified', 'onsite', 'video', 'phone')),
  location_or_link TEXT NOT NULL DEFAULT '' CHECK (length(location_or_link) <= 2000),
  company_questions_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(company_questions_json) AND json_type(company_questions_json) = 'array'),
  checklist_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(checklist_json) AND json_type(checklist_json) = 'array'),
  reflection_text TEXT NOT NULL DEFAULT '' CHECK (length(reflection_text) <= 10000),
  difficulties_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(difficulties_json) AND json_type(difficulties_json) = 'array'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (application_id, user_id)
    REFERENCES job_applications(id, user_id) ON DELETE CASCADE
);

CREATE INDEX interview_sessions_user_application_idx
  ON interview_sessions(user_id, application_id, updated_at DESC);

CREATE TABLE interview_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL CHECK (length(question_text) BETWEEN 1 AND 1000),
  answer_text TEXT NOT NULL DEFAULT '' CHECK (length(answer_text) <= 12000),
  story_id TEXT,
  practiced INTEGER NOT NULL DEFAULT 0 CHECK (practiced IN (0, 1)),
  feedback_text TEXT NOT NULL DEFAULT '' CHECK (length(feedback_text) <= 12000),
  feedback_source TEXT NOT NULL DEFAULT 'none'
    CHECK (feedback_source IN ('none', 'local', 'ai')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (session_id, user_id)
    REFERENCES interview_sessions(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (story_id, user_id)
    REFERENCES career_stories(id, user_id) ON DELETE SET NULL
);

CREATE INDEX interview_questions_session_idx
  ON interview_questions(user_id, session_id, created_at);
