export type PaymentConfig = {
  provider: 'disabled' | 'mock' | 'toss';
  fulfillmentEnabled: boolean;
  fulfillmentUrl: string;
  fulfillmentToken: string;
  fulfillmentTimeoutMs: number;
  tossClientKey: string;
  tossSecretKey: string;
  tossApiBaseUrl: string;
};

const TOSS_API_BASE_URL = 'https://api.tosspayments.com';

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
  if (provider !== 'disabled' && provider !== 'mock' && provider !== 'toss') {
    throw new Error('PAYMENT_PROVIDER is not supported');
  }
  if (provider === 'mock' && env.NODE_ENV !== 'test') {
    throw new Error('mock payment provider is test-only');
  }

  const tossClientKey = String(env.TOSS_CLIENT_KEY ?? '').trim();
  const tossSecretKey = String(env.TOSS_SECRET_KEY ?? '').trim();
  if (provider === 'toss') {
    if (env.NODE_ENV === 'production') {
      throw new Error('toss payment provider is sandbox-only in this release');
    }
    if (!tossClientKey.startsWith('test_gck_') || !tossSecretKey.startsWith('test_gsk_')) {
      throw new Error('toss payment provider requires matching Payment Widget test keys');
    }
    if (tossClientKey.length < 20 || tossSecretKey.length < 20) {
      throw new Error('toss payment test keys are invalid');
    }
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
    tossClientKey,
    tossSecretKey,
    tossApiBaseUrl: TOSS_API_BASE_URL,
  };
}
