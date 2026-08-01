import { getWebAuthConfig } from './auth.config';
import { generateSecret, generateUserCode, hmac, safeSecretEqual } from './auth.crypto';
import { WEB_SESSION_DURATION_MS } from './auth.time';

describe('web authentication configuration and secrets', () => {
  it('keeps web auth disabled without requiring secrets', () => {
    expect(getWebAuthConfig({ NODE_ENV: 'development', WEB_AUTH_ENABLED: 'false' })).toMatchObject({
      enabled: false,
      cookieName: 'natebe_session',
      pendingCookieName: 'natebe_session_pending',
      secureCookie: false,
      sessionTtlMs: WEB_SESSION_DURATION_MS,
    });
  });

  it('requires three distinct secrets of at least 32 characters when enabled', () => {
    const base = {
      NODE_ENV: 'production',
      WEB_AUTH_ENABLED: 'true',
      WEB_AUTH_INTERNAL_TOKEN: 'i'.repeat(32),
      TOKEN_HASH_SECRET: 't'.repeat(32),
      SESSION_SECRET: 's'.repeat(32),
    };
    expect(getWebAuthConfig(base)).toMatchObject({
      enabled: true,
      pendingCookieName: 'natebe_session_pending',
      secureCookie: true,
    });
    expect(() => getWebAuthConfig({ ...base, SESSION_SECRET: 'short' })).toThrow();
    expect(() => getWebAuthConfig({ ...base, SESSION_SECRET: 't'.repeat(32) })).toThrow(
      '웹 인증 비밀값은 서로 달라야 합니다.',
    );
    expect(() => getWebAuthConfig({ ...base, WEB_SESSION_TTL_MS: '604800000' })).toThrow(
      `WEB_SESSION_TTL_MS는 ${WEB_SESSION_DURATION_MS}이어야 합니다.`,
    );
  });

  it('generates the expected public code and high-entropy browser secrets', () => {
    expect(generateUserCode()).toMatch(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
    const first = generateSecret();
    const second = generateSecret();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(hmac(first, 'x'.repeat(32))).not.toContain(first);
    expect(safeSecretEqual(first, first)).toBe(true);
    expect(safeSecretEqual(first, second)).toBe(false);
  });
});
