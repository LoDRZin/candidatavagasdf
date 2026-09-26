CREATE TABLE career_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  journey_type TEXT NOT NULL
    CHECK (journey_type IN ('first_job', 'returning', 'transition', 'growth')),
  target_roles_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(target_roles_json) AND json_type(target_roles_json) = 'array'),
  work_modes_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(work_modes_json) AND json_type(work_modes_json) = 'array'),
  location_text TEXT NOT NULL DEFAULT '' CHECK (length(location_text) <= 200),
  weekly_availability INTEGER CHECK (weekly_availability BETWEEN 0 AND 168),
  main_challenge TEXT NOT NULL DEFAULT '' CHECK (length(main_challenge) <= 2000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE job_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
  role TEXT NOT NULL CHECK (length(role) BETWEEN 1 AND 200),
  source TEXT NOT NULL DEFAULT '' CHECK (length(source) <= 200),
  source_url TEXT NOT NULL DEFAULT '' CHECK (length(source_url) <= 2000),
  location TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 200),
  work_mode TEXT NOT NULL DEFAULT ''
    CHECK (work_mode IN ('', 'onsite', 'hybrid', 'remote')),
  status TEXT NOT NULL DEFAULT 'saved'
    CHECK (status IN ('saved', 'applied', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  salary_text TEXT NOT NULL DEFAULT '' CHECK (length(salary_text) <= 200),
  description_text TEXT NOT NULL DEFAULT '' CHECK (length(description_text) <= 30000),
  applied_at TEXT,
  next_action_at TEXT,
  resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
  cover_letter_id TEXT,
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id)
);

CREATE INDEX job_applications_user_updated_idx
  ON job_applications(user_id, updated_at DESC);
CREATE INDEX job_applications_user_status_idx
  ON job_applications(user_id, status, updated_at DESC);
CREATE INDEX job_applications_user_next_action_idx
  ON job_applications(user_id, next_action_at);
CREATE INDEX job_applications_resume_idx
  ON job_applications(resume_id);

CREATE TABLE application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'note', 'contact', 'interview', 'follow_up', 'status_changed')),
  from_status TEXT
    CHECK (from_status IS NULL OR from_status IN ('saved', 'applied', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  to_status TEXT
    CHECK (to_status IS NULL OR to_status IN ('saved', 'applied', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 4000),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (application_id, user_id)
    REFERENCES job_applications(id, user_id) ON DELETE CASCADE
);

CREATE INDEX application_events_application_occurred_idx
  ON application_events(application_id, occurred_at DESC, created_at DESC);
CREATE INDEX application_events_user_occurred_idx
  ON application_events(user_id, occurred_at DESC);
