CREATE TABLE IF NOT EXISTS ai_provider_rate_limits (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  rpm_limit INTEGER NOT NULL CHECK (rpm_limit > 0),
  tpm_limit INTEGER NOT NULL CHECK (tpm_limit > 0),
  rpd_limit INTEGER NOT NULL CHECK (rpd_limit > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, model)
);

INSERT OR REPLACE INTO ai_provider_rate_limits
  (provider, model, display_name, category, rpm_limit, tpm_limit, rpd_limit, created_at, updated_at)
VALUES
  ('gemini', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'Modelos de saída de texto', 15, 250000, 500, datetime('now'), datetime('now')),
  ('gemini', 'antigravity', 'Antigravity', 'Agentes', 60, 100000, 100, datetime('now'), datetime('now')),
  ('gemini', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'Modelos de saída de texto', 10, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-2.5-flash-tts', 'Gemini 2.5 Flash TTS', 'Modelos generativos multimodais', 3, 10000, 10, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3-flash', 'Gemini 3 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'Modelos de saída de texto', 15, 250000, 500, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.1-flash-tts', 'Gemini 3.1 Flash TTS', 'Modelos generativos multimodais', 3, 10000, 10, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.5-flash', 'Gemini 3.5 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.5-transcribe', 'Gemini 3.5 Transcribe', 'API Live', 3, 10000, 25, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.6-flash', 'Gemini 3.6 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.7-flash', 'Gemini 3.7 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.8-flash', 'Gemini 3.8 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.8-flash-lite-tts', 'Gemini 3.8 Flash Lite TTS', 'Modelos generativos multimodais', 3, 10000, 10, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.8-flash-tts', 'Gemini 3.8 Flash TTS', 'Modelos generativos multimodais', 3, 10000, 10, datetime('now'), datetime('now')),
  ('gemini', 'gemini-embedding-1', 'Gemini Embedding 1', 'Outros modelos', 100, 30000, 1000, datetime('now'), datetime('now')),
  ('gemini', 'gemini-embedding-2', 'Gemini Embedding 2', 'Outros modelos', 100, 30000, 1000, datetime('now'), datetime('now')),
  ('gemini', 'gemini-robotics-er-2-preview', 'Gemini Robotics ER 2 Preview', 'Outros modelos', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemma-4-26b', 'Gemma 4 26B', 'Outros modelos', 30, 16000, 14400, datetime('now'), datetime('now')),
  ('gemini', 'gemma-4-31b', 'Gemma 4 31B', 'Outros modelos', 30, 16000, 14400, datetime('now'), datetime('now'));
