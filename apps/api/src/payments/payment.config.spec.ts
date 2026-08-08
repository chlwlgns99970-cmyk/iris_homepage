import { getPaymentConfig } from './payment.config';

describe('payment configuration', () => {
  it('keeps live payment and fulfillment disabled by default', () => {
    expect(getPaymentConfig({ NODE_ENV: 'production' })).toEqual(expect.objectContaining({
      provider: 'disabled',
      fulfillmentEnabled: false,
    }));
  });

  it('allows the mock provider only in tests', () => {
    expect(getPaymentConfig({ NODE_ENV: 'test', PAYMENT_PROVIDER: 'mock' }).provider).toBe('mock');
    expect(() => getPaymentConfig({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock' })).toThrow('test-only');
  });

  it('allows only Payment Widget test keys for the Toss sandbox adapter', () => {
    expect(getPaymentConfig({
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'toss',
      TOSS_CLIENT_KEY: 'test_gck_test_client_key_1234567890',
      TOSS_SECRET_KEY: 'test_gsk_test_secret_key_1234567890',
    })).toEqual(expect.objectContaining({
      provider: 'toss',
      tossApiBaseUrl: 'https://api.tosspayments.com',
    }));
  });

  it('rejects live keys and production Toss activation in this release', () => {
    expect(() => getPaymentConfig({
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'toss',
      TOSS_CLIENT_KEY: 'live_gck_live_client_key_123456789',
      TOSS_SECRET_KEY: 'live_gsk_live_secret_key_123456789',
    })).toThrow('test keys');
    expect(() => getPaymentConfig({
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: 'toss',
      TOSS_CLIENT_KEY: 'test_gck_test_client_key_1234567890',
      TOSS_SECRET_KEY: 'test_gsk_test_secret_key_1234567890',
    })).toThrow('sandbox-only');
  });

  it('requires a dedicated fulfillment token and safe URL', () => {
    const token = 'p'.repeat(32);
    expect(getPaymentConfig({
      NODE_ENV: 'test',
      PAYMENT_FULFILLMENT_ENABLED: 'true',
      RPG_PAYMENT_INTERNAL_API_URL: 'http://127.0.0.1:5000',
      RPG_PAYMENT_INTERNAL_API_TOKEN: token,
    })).toEqual(expect.objectContaining({ fulfillmentEnabled: true }));
    expect(() => getPaymentConfig({
      PAYMENT_FULFILLMENT_ENABLED: 'true',
      RPG_PAYMENT_INTERNAL_API_URL: 'http://127.0.0.1:5000',
      RPG_PAYMENT_INTERNAL_API_TOKEN: token,
      SESSION_SECRET: token,
    })).toThrow('dedicated');
  });
});
