import { ArgumentsHost, Logger } from '@nestjs/common';
import { ApiExceptionFilter, getSafeRequestId } from './api-exception.filter';

function runFilter(requestOverrides: Record<string, unknown> = {}) {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  const request = {
    method: 'GET',
    path: '/connect',
    originalUrl: '/connect?token=SECRET_TOKEN&paymentKey=PAYMENT_SECRET',
    url: '/connect?token=SECRET_TOKEN&paymentKey=PAYMENT_SECRET',
    headers: {
      'x-request-id': 'request-500',
      cookie: 'session=secret-cookie',
      authorization: 'Bearer secret-authorization',
    },
    body: {
      uid: '00000008',
      code: '654321',
      orderId: 'secret-order',
    },
    ...requestOverrides,
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status, json }),
    }),
  } as unknown as ArgumentsHost;

  new ApiExceptionFilter().catch(new Error('database failed'), host);
  return { status, json, logger, logOutput: JSON.stringify(logger.mock.calls) };
}

describe('ApiExceptionFilter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs only the pathname and safe request metadata for a 500 error', () => {
    const { status, json, logOutput } = runFilter();

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: '서버 오류가 발생했습니다.',
      requestId: 'request-500',
    });
    expect(logOutput).toContain('request-500');
    expect(logOutput).toContain('/connect');
    expect(logOutput).toContain('database failed');
    expect(logOutput).not.toContain('token');
    expect(logOutput).not.toContain('SECRET_TOKEN');
    expect(logOutput).not.toContain('paymentKey');
    expect(logOutput).not.toContain('PAYMENT_SECRET');
    expect(logOutput).not.toContain('00000008');
    expect(logOutput).not.toContain('654321');
    expect(logOutput).not.toContain('secret-cookie');
    expect(logOutput).not.toContain('secret-authorization');
    expect(logOutput).not.toContain('secret-order');
    expect(JSON.stringify(json.mock.calls)).not.toContain('database failed');
  });

  it('removes a query string when Express path is unavailable', () => {
    const { logOutput } = runFilter({ path: undefined });
    expect(logOutput).toContain('/connect');
    expect(logOutput).not.toContain('SECRET_TOKEN');
    expect(logOutput).not.toContain('token');
  });

  it('keeps a valid requestId', () => {
    expect(getSafeRequestId('request_ID-123')).toBe('request_ID-123');
  });

  it.each([
    ['a'.repeat(65)],
    ['line\nbreak'],
    ['control\u0001character'],
    ['contains space'],
    [undefined],
  ])('replaces an invalid or missing requestId: %p', (value) => {
    expect(getSafeRequestId(value)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
