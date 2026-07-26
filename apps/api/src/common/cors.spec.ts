import { buildCorsOptions, getAllowedOrigins } from './cors';

type OriginCallback = (error: Error | null, allow?: boolean) => void;
type OriginFunction = (origin: string | undefined, callback: OriginCallback) => void;

describe('CORS configuration', () => {
  it('uses localhost only in development when CORS_ORIGINS is missing', () => {
    expect(getAllowedOrigins('development', undefined)).toEqual(['http://localhost:3000']);
  });

  it('requires an explicit origin in production', () => {
    expect(() => getAllowedOrigins('production', undefined)).toThrow(
      '운영환경에서는 CORS_ORIGINS를 반드시 설정해야 합니다.',
    );
  });

  it('rejects wildcard origins when credentials are enabled', () => {
    expect(() => getAllowedOrigins('production', '*')).toThrow(
      'credentials 사용 시 CORS 와일드카드는 허용되지 않습니다.',
    );
  });

  it('allows the configured exact origin and blocks another origin', () => {
    const options = buildCorsOptions('production', 'https://web.example.com');
    const origin = options.origin as OriginFunction;
    const allowed = jest.fn();
    const blocked = jest.fn();

    origin('https://web.example.com', allowed);
    origin('https://evil.example.com', blocked);

    expect(allowed).toHaveBeenCalledWith(null, true);
    expect(blocked.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(blocked.mock.calls[0]?.[1]).toBe(false);
    expect(options.credentials).toBe(true);
  });
});
