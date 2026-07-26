import { isIP } from 'node:net';

export type ApiServerConfig = {
  host: string;
  port: number;
};

const HOSTNAME_PATTERN =
  /^(?:localhost|(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)$/;

export function getApiServerConfig(
  nodeEnv = process.env.NODE_ENV,
  configuredHost = process.env.API_HOST,
  configuredPort = process.env.API_PORT,
): ApiServerConfig {
  const host = configuredHost?.trim() || (nodeEnv === 'development' ? '127.0.0.1' : '');
  if (!host) {
    throw new Error('개발환경 외에는 API_HOST를 반드시 설정해야 합니다.');
  }
  if (
    isIP(host) === 0
    && (!HOSTNAME_PATTERN.test(host) || host.includes('..'))
  ) {
    throw new Error('API_HOST는 유효한 호스트명 또는 IP 주소여야 합니다.');
  }

  const portText = configuredPort?.trim() || '3001';
  if (!/^\d+$/.test(portText)) {
    throw new Error('API_PORT는 1~65535 범위의 정수여야 합니다.');
  }
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT는 1~65535 범위의 정수여야 합니다.');
  }

  return { host, port };
}
