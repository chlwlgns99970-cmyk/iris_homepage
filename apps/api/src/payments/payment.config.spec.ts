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
