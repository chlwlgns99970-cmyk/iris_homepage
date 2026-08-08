export type PaymentConfig = {
  provider: 'disabled' | 'mock';
  fulfillmentEnabled: boolean;
  fulfillmentUrl: string;
  fulfillmentToken: string;
  fulfillmentTimeoutMs: number;
};

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function safeBaseUrl(value: string, name: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a safe http(s) URL`);
  }
  return url.toString().replace(/\/$/, '');
}

export function getPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const provider = String(env.PAYMENT_PROVIDER ?? 'disabled').trim().toLowerCase();
  if (provider !== 'disabled' && provider !== 'mock') {
    throw new Error('PAYMENT_PROVIDER is not supported');
  }
  if (provider === 'mock' && env.NODE_ENV !== 'test') {
    throw new Error('mock payment provider is test-only');
  }

  const fulfillmentEnabled = String(env.PAYMENT_FULFILLMENT_ENABLED ?? 'false').toLowerCase() === 'true';
  const fulfillmentUrl = String(env.RPG_PAYMENT_INTERNAL_API_URL ?? '').trim();
  const fulfillmentToken = String(env.RPG_PAYMENT_INTERNAL_API_TOKEN ?? '');
  if (fulfillmentEnabled) {
    safeBaseUrl(fulfillmentUrl, 'RPG_PAYMENT_INTERNAL_API_URL');
    if (fulfillmentToken.length < 32) throw new Error('RPG_PAYMENT_INTERNAL_API_TOKEN must be at least 32 characters');
    const forbidden = [
      env.BOT_INTERNAL_API_TOKEN,
      env.WEB_AUTH_INTERNAL_TOKEN,
      env.SESSION_SECRET,
      env.TOKEN_HASH_SECRET,
      env.IRIS_RPG_OPERATION_SECRET,
    ].filter(Boolean);
    if (forbidden.includes(fulfillmentToken)) {
      throw new Error('RPG_PAYMENT_INTERNAL_API_TOKEN must be dedicated');
    }
  }
  return {
    provider: provider as PaymentConfig['provider'],
    fulfillmentEnabled,
    fulfillmentUrl: fulfillmentEnabled ? safeBaseUrl(fulfillmentUrl, 'RPG_PAYMENT_INTERNAL_API_URL') : '',
    fulfillmentToken,
    fulfillmentTimeoutMs: positiveInteger(
      env.RPG_PAYMENT_INTERNAL_API_TIMEOUT_MS,
      5_000,
      'RPG_PAYMENT_INTERNAL_API_TIMEOUT_MS',
    ),
  };
}
