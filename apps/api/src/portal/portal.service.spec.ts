import { PortalService } from './portal.service';

function dashboard(nickname: string) {
  return {
    meta: { version: 1, generatedAt: '2026-07-28T00:00:00.000Z' },
    summary: [],
    systems: [],
    characters: [{
      id: 'warrior',
      job: 'warrior',
      gender: 'unknown',
      current: true,
      name: `${nickname}의 전사`,
    }],
    artworks: [],
  };
}

describe('PortalService user isolation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...originalEnv,
      PORTAL_ENABLED: 'true',
      BOT_INTERNAL_API_URL: 'http://127.0.0.1:5000',
      BOT_INTERNAL_API_TOKEN: 'portal-test-token-value-1234567890',
      PORTAL_CACHE_TTL_MS: '60000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends the authenticated botUid and keeps cached dashboards separated by botUid', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { botUid: string };
      const body = request.botUid === '00000002'
        ? dashboard('토도리')
        : dashboard('단지얌');
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const service = new PortalService();

    const todori = await service.dashboard('00000002');
    const danji = await service.dashboard('00000007');
    const todoriCached = await service.dashboard('00000002');

    expect(todori.characters[0].name).toBe('토도리의 전사');
    expect(danji.characters[0].name).toBe('단지얌의 전사');
    expect(todoriCached).toBe(todori);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { botUid: '00000002' },
      { botUid: '00000007' },
    ]);
  });

  it('accepts the current bot provider shape without inventing an administrator UID', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ...dashboard('토도리'),
      characters: [],
    }), { status: 200 }));

    const result = await new PortalService().dashboard('00000002');

    expect(result.meta).toEqual({
      version: 1,
      generatedAt: '2026-07-28T00:00:00.000Z',
    });
    expect(result.meta).not.toHaveProperty('uid');
    expect(result.characters).toEqual([]);
  });
});
