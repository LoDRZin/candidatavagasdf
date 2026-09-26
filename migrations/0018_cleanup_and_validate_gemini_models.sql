DELETE FROM ai_provider_rate_limits
WHERE provider = 'gemini';

INSERT INTO ai_provider_rate_limits
  (provider, model, display_name, category, rpm_limit, tpm_limit, rpd_limit, created_at, updated_at)
VALUES
  ('gemini', 'gemini-3.7-flash', 'Gemini 3.7 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.6-flash', 'Gemini 3.6 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.5-flash', 'Gemini 3.5 Flash', 'Modelos de saída de texto', 5, 250000, 20, datetime('now'), datetime('now')),
  ('gemini', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'Modelos de saída de texto', 15, 250000, 500, datetime('now'), datetime('now')),
  ('gemini', 'gemma-4-31b-it', 'Gemma 4 31B IT', 'Modelos de saída de texto', 30, 16000, 14400, datetime('now'), datetime('now')),
  ('gemini', 'gemma-4-26b-a4b-it', 'Gemma 4 26B A4B IT', 'Modelos de saída de texto', 30, 16000, 14400, datetime('now'), datetime('now'));
