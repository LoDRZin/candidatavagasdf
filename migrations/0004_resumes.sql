CREATE TABLE resumes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  template_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX resumes_user_updated_idx ON resumes(user_id, updated_at DESC);

CREATE TABLE resume_versions (
  id TEXT PRIMARY KEY,
  resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  template_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'ai_accepted', 'import_local')),
  created_at TEXT NOT NULL,
  UNIQUE(resume_id, revision)
);
