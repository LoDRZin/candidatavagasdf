CREATE TABLE ai_usage_quotas (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_limit INTEGER NOT NULL DEFAULT 4096 CHECK (token_limit >= 4096),
  tokens_used INTEGER NOT NULL DEFAULT 0 CHECK (tokens_used >= 0 AND tokens_used <= token_limit),
  request_limit INTEGER NOT NULL DEFAULT 2 CHECK (request_limit >= 2),
  requests_used INTEGER NOT NULL DEFAULT 0 CHECK (requests_used >= 0 AND requests_used <= request_limit),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO ai_usage_quotas(user_id, created_at, updated_at)
SELECT id, created_at, updated_at FROM users;
