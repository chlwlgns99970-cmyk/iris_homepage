import { getApiServerConfig } from './server-config';

describe('API server binding configuration', () => {
  it('binds local development to loopback by default', () => {
    expect(getApiServerConfig('development', undefined, undefined)).toEqual({
      host: '127.0.0.1',
      port: 3001,
    });
  });

  it('allows an explicit Docker binding', () => {
    expect(getApiServerConfig('production', '0.0.0.0', '3001')).toEqual({
      host: '0.0.0.0',
      port: 3001,
    });
  });

  it('requires an explicit host outside development', () => {
    expect(() => getApiServerConfig('production', undefined, '3001')).toThrow(
      '개발환경 외에는 API_HOST를 반드시 설정해야 합니다.',
    );
  });

  it.each(['0', '-1', '65536', 'three thousand', '1.5'])(
    'rejects an invalid API_PORT: %s',
    (port) => {
      expect(() => getApiServerConfig('production', '127.0.0.1', port)).toThrow(
        'API_PORT는 1~65535 범위의 정수여야 합니다.',
      );
    },
  );
});
