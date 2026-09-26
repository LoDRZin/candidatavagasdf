ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE sessions ADD COLUMN reauthenticated_at TEXT;
ALTER TABLE quiz_attempts ADD COLUMN mutation_key TEXT;
ALTER TABLE resumes ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','ai_accepted','import_local'));
CREATE TRIGGER resume_initial_version AFTER INSERT ON resumes BEGIN
  INSERT INTO resume_versions(id,resume_id,revision,template_id,data_json,source,created_at)
  VALUES (lower(hex(randomblob(16))),NEW.id,NEW.revision,NEW.template_id,NEW.data_json,NEW.source,NEW.updated_at);
END;
CREATE TRIGGER resume_next_version AFTER UPDATE ON resumes WHEN NEW.revision <> OLD.revision BEGIN
  INSERT INTO resume_versions(id,resume_id,revision,template_id,data_json,source,created_at)
  VALUES (lower(hex(randomblob(16))),NEW.id,NEW.revision,NEW.template_id,NEW.data_json,NEW.source,NEW.updated_at);
END;
CREATE TABLE request_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX request_limits_expiry ON request_limits(expires_at);
CREATE TABLE oauth_flows (
  state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL,
  return_to TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL
);
CREATE TABLE local_mail (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX oauth_user ON oauth_accounts(user_id);
CREATE INDEX auth_token_user ON auth_tokens(user_id);
CREATE INDEX modules_version ON course_modules(course_version_id);
CREATE INDEX lessons_module ON lessons(module_id);
CREATE UNIQUE INDEX questions_position ON quiz_questions(lesson_id,position);
CREATE UNIQUE INDEX options_position ON quiz_options(question_id,position);
CREATE INDEX enrollments_version ON course_enrollments(course_version_id);
CREATE INDEX progress_lesson ON lesson_progress(lesson_id);
CREATE INDEX attempts_user_lesson ON quiz_attempts(user_id,lesson_id);
CREATE INDEX answers_question ON quiz_answers(question_id);
