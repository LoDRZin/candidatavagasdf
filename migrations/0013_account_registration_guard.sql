CREATE TABLE account_registration_guards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX account_registration_guard_pair ON account_registration_guards(ip_hash, device_hash);
