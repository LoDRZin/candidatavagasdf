ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'admin'));

UPDATE users
SET role = 'admin', updated_at = datetime('now')
WHERE email = 'roger.derik211@gmail.com'
  AND EXISTS (
    SELECT 1 FROM oauth_accounts
    WHERE oauth_accounts.user_id = users.id
      AND oauth_accounts.provider = 'google'
  );

CREATE INDEX users_role_status_created_idx
  ON users(role, status, created_at DESC);

CREATE TABLE ai_usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('chat', 'mentor', 'resume', 'interview')),
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openrouter')),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL CHECK (total_tokens >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX ai_usage_events_user_created_idx
  ON ai_usage_events(user_id, created_at DESC);

CREATE INDEX ai_usage_events_provider_created_idx
  ON ai_usage_events(provider, created_at DESC);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('user_promoted', 'user_demoted', 'user_deleted')),
  target_user_id TEXT,
  target_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX admin_audit_log_created_idx
  ON admin_audit_log(created_at DESC);
