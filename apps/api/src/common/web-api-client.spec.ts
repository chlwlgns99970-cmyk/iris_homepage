import {
  ApiError,
  buildRequestInit,
  resolveApiBase,
} from '../../../web/lib/api';
import {
  parseRankingRows,
  rankingFailureStatus,
  rankingResultStatus,
} from '../../../web/lib/ranking';

describe('web API client configuration', () => {
  it('uses localhost only in development', () => {
    expect(resolveApiBase('development', undefined)).toBe('http://localhost:3001');
  });

  it('uses same-origin relative paths when production configuration is missing', () => {
    expect(resolveApiBase('production', undefined)).toBe('');
    expect(resolveApiBase('production', '')).toBe('');
  });

  it.each([
    ['http://localhost:3001/', 'http://localhost:3001'],
    ['https://api.example.com', 'https://api.example.com'],
    ['/backend/', '/backend'],
  ])('accepts a safe API base %s', (input, expected) => {
    expect(resolveApiBase('production', input)).toBe(expected);
  });

  it.each(['javascript:alert(1)', 'data:text/plain,test', ' ', 'not a url', '//api.example.com'])(
    'rejects an unsafe API base %s',
    (input) => {
      expect(() => resolveApiBase('production', input)).toThrow();
    },
  );

  it('includes cookies and omits Content-Type from a GET request', () => {
    const init = buildRequestInit({ method: 'GET' });
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('includes cookies and JSON Content-Type when a body exists', () => {
    const init = buildRequestInit({ method: 'POST', body: '{}' });
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('preserves structured API error fields', () => {
    const error = new ApiError(503, {
      statusCode: 503,
      code: 'IRIS_LINK_NOT_CONFIGURED',
      message: '봇 UID 연결 서버가 아직 구성되지 않았습니다.',
      requestId: 'request-iris',
    });
    expect(error).toMatchObject({
      statusCode: 503,
      code: 'IRIS_LINK_NOT_CONFIGURED',
      message: '봇 UID 연결 서버가 아직 구성되지 않았습니다.',
      requestId: 'request-iris',
    });
  });
});

describe('public ranking response validation', () => {
  const validRow = { rank: 1, displayName: '모험가', job: '전사', value: 100 };

  it.each([
    [[validRow]],
    [{ items: [validRow] }],
  ])('accepts a valid response', (response) => {
    const result = parseRankingRows(response);
    expect(result).toEqual({
      ok: true,
      rows: [{ rank: 1, name: '모험가', job: '전사', value: '100' }],
    });
    if (result.ok) expect(rankingResultStatus(result.rows)).toBe('success');
    expect(JSON.stringify(result)).not.toContain('botUid');
    expect(JSON.stringify(result)).not.toContain('"uid"');
  });

  it.each([
    [[]],
    [{ items: [] }],
  ])('classifies only a structurally valid empty response as empty', (response) => {
    const result = parseRankingRows(response);
    expect(result).toEqual({ ok: true, rows: [] });
    if (result.ok) expect(rankingResultStatus(result.rows)).toBe('empty');
  });

  it.each([
    [null],
    [{}],
    [{ items: {} }],
    [[null]],
    [[{ rank: 1, botUid: '00000008', value: 100 }]],
    [[{ rank: 1, uid: '00000008', value: 100 }]],
    [[{ rank: 1, name: '   ', value: 100 }]],
    [[{ rank: 0, name: '모험가', value: 100 }]],
    [[{ rank: -1, name: '모험가', value: 100 }]],
    [[{ rank: 1.5, name: '모험가', value: 100 }]],
    [[{ rank: Number.NaN, name: '모험가', value: 100 }]],
    [[{ rank: Number.POSITIVE_INFINITY, name: '모험가', value: 100 }]],
    [[{ rank: 1, name: '모험가' }]],
    [[{ rank: 1, name: '모험가', value: Number.NaN }]],
    [[{ rank: 1, name: '모험가', value: Number.POSITIVE_INFINITY }]],
    [[validRow, { rank: 2, botUid: '00000009', value: 90 }]],
  ])('rejects a malformed response without dropping only bad rows', (response) => {
    expect(parseRankingRows(response)).toEqual({
      ok: false,
      error: 'INVALID_RANKING_RESPONSE',
    });
  });

  it('separates provider configuration errors from other failures', () => {
    expect(
      rankingFailureStatus(
        new ApiError(503, { code: 'RANKING_PROVIDER_NOT_CONFIGURED' }),
      ),
    ).toBe('unconfigured');
    expect(rankingFailureStatus(new TypeError('Failed to fetch'))).toBe('error');
  });
});
