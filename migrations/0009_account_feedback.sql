ALTER TABLE feedback ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS feedback_user_created_idx
  ON feedback(user_id, created_at DESC);
