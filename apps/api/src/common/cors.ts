import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

function normalizeOrigin(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
    throw new Error(`CORS_ORIGINS에는 정확한 http(s) Origin만 사용할 수 있습니다: ${value}`);
  }
  return url.origin;
}

export function getAllowedOrigins(
  nodeEnv = process.env.NODE_ENV,
  configuredOrigins = process.env.CORS_ORIGINS,
) {
  const values = configuredOrigins
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!values?.length) {
    if (nodeEnv === 'production') {
      throw new Error('운영환경에서는 CORS_ORIGINS를 반드시 설정해야 합니다.');
    }
    return ['http://localhost:3000'];
  }

  if (values.some((value) => value.includes('*'))) {
    throw new Error('credentials 사용 시 CORS 와일드카드는 허용되지 않습니다.');
  }

  return [...new Set(values.map(normalizeOrigin))];
}

export function buildCorsOptions(
  nodeEnv = process.env.NODE_ENV,
  configuredOrigins = process.env.CORS_ORIGINS,
): CorsOptions {
  const allowedOrigins = new Set(getAllowedOrigins(nodeEnv, configuredOrigins));

  return {
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('허용되지 않은 CORS Origin입니다.'), false);
    },
  };
}
