import { getPortalConfig } from './portal.config';

describe('portal config', () => {
  it('is disabled with bounded defaults', () => {
    expect(getPortalConfig({})).toMatchObject({
      enabled: false,
      timeoutMs: 3000,
      maxResponseBytes: 524288,
      cacheTtlMs: 3000,
    });
  });

  it('requires a dedicated token when enabled', () => {
    expect(() => getPortalConfig({
      PORTAL_ENABLED: 'true',
      BOT_INTERNAL_API_URL: 'http://127.0.0.1:5000',
      BOT_INTERNAL_API_TOKEN: 'short',
    })).toThrow('at least 32');
    const token = 'a'.repeat(32);
    expect(() => getPortalConfig({
      PORTAL_ENABLED: 'true',
      BOT_INTERNAL_API_URL: 'http://127.0.0.1:5000',
      BOT_INTERNAL_API_TOKEN: token,
      SESSION_SECRET: token,
    })).toThrow('dedicated');
  });
});
