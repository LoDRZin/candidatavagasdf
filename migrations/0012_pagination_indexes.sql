CREATE INDEX IF NOT EXISTS applications_user_updated_page_idx
  ON job_applications(user_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS applications_user_status_updated_page_idx
  ON job_applications(user_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS application_events_user_page_idx
  ON application_events(application_id, user_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS cover_letters_user_updated_page_idx
  ON cover_letters(user_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS cover_letters_application_updated_page_idx
  ON cover_letters(user_id, application_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS interview_sessions_user_updated_page_idx
  ON interview_sessions(user_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS interview_sessions_application_updated_page_idx
  ON interview_sessions(user_id, application_id, updated_at DESC, id DESC);
