import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { expect, test } from 'vitest';
import { adminAccessError, isAdminPath } from '../../worker/access';

test('Access protege apenas rotas administrativas e falha fechado sem configuração', async () => {
  expect(isAdminPath('/api/admin/courses')).toBe(true);
  expect(isAdminPath('/admin/cursos')).toBe(true);
  expect(isAdminPath('/api/ai/assist')).toBe(false);
  const request = new Request('https://example.test/api/admin/courses');
  expect((await adminAccessError(request, { ACCESS_REQUIRED: 'true' }))?.status).toBe(503);
  expect((await adminAccessError(request, { ACCESS_REQUIRED: 'true', ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUD: 'aud-test' }))?.status).toBe(403);
  expect(await adminAccessError(request, { ACCESS_REQUIRED: 'false' })).toBeNull();
});

test('Access exige assinatura, emissor e audiência válidos', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  const keys = createLocalJWKSet({ keys: [jwk] });
  const config = { ACCESS_REQUIRED: 'true', ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUD: 'app-aud' };
  const signed = async (audience: string) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(config.ACCESS_TEAM_DOMAIN).setAudience(audience).setIssuedAt().setExpirationTime('2m').sign(privateKey);
  const valid = new Request('https://example.test/api/admin/courses', { headers: { 'Cf-Access-Jwt-Assertion': await signed(config.ACCESS_AUD) } });
  expect(await adminAccessError(valid, config, keys)).toBeNull();
  const wrongAudience = new Request('https://example.test/api/admin/courses', { headers: { 'Cf-Access-Jwt-Assertion': await signed('other-app') } });
  expect((await adminAccessError(wrongAudience, config, keys))?.status).toBe(403);
  const malformed = new Request('https://example.test/api/admin/courses', { headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' } });
  expect((await adminAccessError(malformed, config, keys))?.status).toBe(403);
  expect(await adminAccessError(valid, { ...config, ACCESS_AUD: 'outro-app,app-aud' }, keys)).toBeNull();
});
