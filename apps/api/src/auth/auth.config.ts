import { ServiceUnavailableException } from '@nestjs/common';
import { WEB_SESSION_DURATION_MS } from './auth.time';

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name}은 양의 정수여야 합니다.`);
  }
  return parsed;
}

function secret(value: string | undefined, name: string) {
  const normalized = value ?? '';
  if (normalized.length < 32) {
    throw new Error(`${name}은 32자 이상이어야 합니다.`);
  }
  return normalized;
}

export type WebAuthConfig = {
  enabled: boolean;
  internalToken: string;
  tokenHashSecret: string;
  sessionSecret: string;
  requestTtlMs: number;
  sessionTtlMs: number;
  cleanupRetentionMs: number;
  cookieName: string;
  pendingCookieName: string;
  secureCookie: boolean;
};

export function getWebAuthConfig(env: NodeJS.ProcessEnv = process.env): WebAuthConfig {
  const enabled = String(env.WEB_AUTH_ENABLED).toLowerCase() === 'true';
  const requestTtlMs = positiveInteger(env.WEB_AUTH_REQUEST_TTL_MS, 300000, 'WEB_AUTH_REQUEST_TTL_MS');
  const sessionTtlMs = positiveInteger(
    env.WEB_SESSION_TTL_MS,
    WEB_SESSION_DURATION_MS,
    'WEB_SESSION_TTL_MS',
  );
  if (sessionTtlMs !== WEB_SESSION_DURATION_MS) {
    throw new Error(`WEB_SESSION_TTL_MS는 ${WEB_SESSION_DURATION_MS}이어야 합니다.`);
  }
  const cleanupRetentionMs = positiveInteger(
    env.WEB_AUTH_CLEANUP_RETENTION_MS,
    604800000,
    'WEB_AUTH_CLEANUP_RETENTION_MS',
  );
  const cookieName = env.WEB_SESSION_COOKIE_NAME?.trim() || 'natebe_session';
  if (!/^[A-Za-z0-9_-]{1,56}$/.test(cookieName)) {
    throw new Error('WEB_SESSION_COOKIE_NAME 형식이 올바르지 않습니다.');
  }
  const pendingCookieName = `${cookieName}_pending`;

  if (!enabled) {
    return {
      enabled,
      internalToken: '',
      tokenHashSecret: '',
      sessionSecret: '',
      requestTtlMs,
      sessionTtlMs,
      cleanupRetentionMs,
      cookieName,
      pendingCookieName,
      secureCookie: env.NODE_ENV === 'production',
    };
  }

  const internalToken = secret(env.WEB_AUTH_INTERNAL_TOKEN, 'WEB_AUTH_INTERNAL_TOKEN');
  const tokenHashSecret = secret(env.TOKEN_HASH_SECRET, 'TOKEN_HASH_SECRET');
  const sessionSecret = secret(env.SESSION_SECRET, 'SESSION_SECRET');
  if (new Set([internalToken, tokenHashSecret, sessionSecret]).size !== 3) {
    throw new Error('웹 인증 비밀값은 서로 달라야 합니다.');
  }

  return {
    enabled,
    internalToken,
    tokenHashSecret,
    sessionSecret,
    requestTtlMs,
    sessionTtlMs,
    cleanupRetentionMs,
    cookieName,
    pendingCookieName,
    secureCookie: env.NODE_ENV === 'production',
  };
}

export function assertWebAuthEnabled(config: WebAuthConfig) {
  if (!config.enabled) {
    throw new ServiceUnavailableException({
      code: 'WEB_AUTH_NOT_CONFIGURED',
      message: '웹 인증 기능이 아직 활성화되지 않았습니다.',
    });
  }
}
