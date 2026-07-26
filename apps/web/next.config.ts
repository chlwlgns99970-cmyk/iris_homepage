import type { NextConfig } from 'next';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function resolveVpsApiOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const configured = env.VPS_API_ORIGIN;
  const vercelEnv = env.VERCEL_ENV;

  if (configured === undefined || configured === '') {
    if (vercelEnv === 'production') {
      throw new Error('Vercel Production에는 VPS_API_ORIGIN을 반드시 설정해야 합니다.');
    }
    return undefined;
  }

  if (configured !== configured.trim() || configured.startsWith('//')) {
    throw new Error('VPS_API_ORIGIN에는 공백 또는 protocol-relative URL을 사용할 수 없습니다.');
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('VPS_API_ORIGIN이 유효한 URL이 아닙니다.');
  }

  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== '/'
  ) {
    throw new Error('VPS_API_ORIGIN에는 경로·인증정보·query·hash 없는 http(s) Origin만 사용할 수 있습니다.');
  }

  if (url.protocol === 'http:') {
    const localDevelopment = env.NODE_ENV === 'development' && vercelEnv === undefined;
    if (!localDevelopment || !LOOPBACK_HOSTS.has(url.hostname)) {
      throw new Error('HTTP VPS_API_ORIGIN은 로컬 개발의 localhost 또는 127.0.0.1만 허용됩니다.');
    }
  }

  return url.origin;
}

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    const origin = resolveVpsApiOrigin();
    return origin
      ? [{ source: '/api/:path*', destination: `${origin}/api/:path*` }]
      : [];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default config;
