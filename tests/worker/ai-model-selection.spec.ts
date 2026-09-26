import { describe, expect, test } from 'vitest';
import { rankProviderAttempts, type ProviderAttempt, type ProviderLimitUsage } from '../../worker/ai';

const attempt = (model: string, provider: ProviderAttempt['provider'] = 'gemini'): ProviderAttempt => ({ provider, model, key: 'test-key' });
const usage = (model: string, overrides: Partial<ProviderLimitUsage> = {}): ProviderLimitUsage => ({
  provider: 'gemini', model,
  rpmLimit: 5, tpmLimit: 250_000, rpdLimit: 20,
  rpmUsed: 0, tpmUsed: 0, rpdUsed: 0,
  ...overrides,
});

describe('seleção preventiva de modelos', () => {
  test('mantém modelos saudáveis do mais recente para o mais antigo', () => {
    const attempts = [attempt('gemini-3.7-flash'), attempt('gemini-3.6-flash'), attempt('gemini-3.5-flash')];
    expect(rankProviderAttempts(attempts, attempts.map(item => usage(item.model)), 1_000).map(item => item.model)).toEqual([
      'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash',
    ]);
  });

  test('desprioriza antes de atingir 80% de RPM, TPM ou RPD', () => {
    const attempts = [
      attempt('gemini-3.7-flash'),
      attempt('gemini-3.6-flash'),
      attempt('openrouter-fallback', 'openrouter'),
    ];
    const rows = [
      usage('gemini-3.7-flash', { rpmUsed: 3 }),
      usage('gemini-3.6-flash'),
    ];
    expect(rankProviderAttempts(attempts, rows, 1_000).map(item => item.model)).toEqual([
      'gemini-3.6-flash', 'openrouter-fallback', 'gemini-3.7-flash',
    ]);
  });

  test('considera os tokens previstos da próxima chamada', () => {
    const attempts = [attempt('gemini-3.7-flash'), attempt('gemini-3.6-flash')];
    const rows = [
      usage('gemini-3.7-flash', { tpmLimit: 10_000, tpmUsed: 7_500 }),
      usage('gemini-3.6-flash'),
    ];
    expect(rankProviderAttempts(attempts, rows, 700).map(item => item.model)).toEqual([
      'gemini-3.6-flash', 'gemini-3.7-flash',
    ]);
  });
});
