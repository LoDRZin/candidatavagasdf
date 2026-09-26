CREATE TABLE career_stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  context_text TEXT NOT NULL DEFAULT '' CHECK (length(context_text) <= 4000),
  action_text TEXT NOT NULL DEFAULT '' CHECK (length(action_text) <= 4000),
  result_text TEXT NOT NULL DEFAULT '' CHECK (length(result_text) <= 4000),
  learning_text TEXT NOT NULL DEFAULT '' CHECK (length(learning_text) <= 4000),
  skills_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(skills_json) AND json_type(skills_json) = 'array'),
  source_type TEXT NOT NULL DEFAULT 'personal'
    CHECK (source_type IN ('formal_work', 'informal_work', 'education', 'volunteering', 'project', 'personal')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id)
);

CREATE INDEX career_stories_user_updated_idx
  ON career_stories(user_id, updated_at DESC);

CREATE TABLE application_story_links (
  application_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (application_id, story_id),
  FOREIGN KEY (application_id, user_id)
    REFERENCES job_applications(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (story_id, user_id)
    REFERENCES career_stories(id, user_id) ON DELETE CASCADE
);

CREATE INDEX application_story_links_user_idx
  ON application_story_links(user_id, application_id);

CREATE TABLE cover_letters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL,
  resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  company TEXT NOT NULL DEFAULT '' CHECK (length(company) <= 200),
  role TEXT NOT NULL DEFAULT '' CHECK (length(role) <= 200),
  reason_text TEXT NOT NULL DEFAULT '' CHECK (length(reason_text) <= 3000),
  contribution_text TEXT NOT NULL DEFAULT '' CHECK (length(contribution_text) <= 3000),
  body_text TEXT NOT NULL DEFAULT '' CHECK (length(body_text) <= 10000),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'local_template', 'ai_accepted')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (application_id, user_id)
    REFERENCES job_applications(id, user_id) ON DELETE CASCADE
);

CREATE INDEX cover_letters_user_application_idx
  ON cover_letters(user_id, application_id, updated_at DESC);
