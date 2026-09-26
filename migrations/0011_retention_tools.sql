CREATE TABLE reminder_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0, 1)),
  window_days INTEGER NOT NULL DEFAULT 3 CHECK (window_days BETWEEN 1 AND 14),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE reminder_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_key TEXT NOT NULL CHECK (length(reminder_key) BETWEEN 1 AND 500),
  delivered_at TEXT NOT NULL,
  UNIQUE (user_id, reminder_key)
);

CREATE INDEX reminder_deliveries_user_date_idx
  ON reminder_deliveries(user_id, delivered_at DESC);
