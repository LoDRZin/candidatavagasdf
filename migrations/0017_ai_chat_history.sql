CREATE TABLE ai_chat_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('general', 'orientation', 'interview')),
  source_label TEXT NOT NULL CHECK (length(source_label) BETWEEN 1 AND 80),
  context TEXT NOT NULL CHECK (length(context) <= 600),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count BETWEEN 0 AND 30),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (id, user_id)
);

CREATE TABLE ai_chat_messages (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 29),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 6000),
  is_local INTEGER NOT NULL DEFAULT 0 CHECK (is_local IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, id),
  UNIQUE (conversation_id, sequence),
  FOREIGN KEY (conversation_id, user_id)
    REFERENCES ai_chat_conversations(id, user_id) ON DELETE CASCADE
);

CREATE INDEX ai_chat_conversations_user_updated_idx
  ON ai_chat_conversations(user_id, updated_at DESC);

CREATE INDEX ai_chat_conversations_expiry_idx
  ON ai_chat_conversations(expires_at);

CREATE INDEX ai_chat_messages_conversation_sequence_idx
  ON ai_chat_messages(conversation_id, user_id, sequence);
