import { WebAccountStatus, WebLoginRequestStatus } from '@prisma/client';
import type { PrismaService } from '../infrastructure/prisma.service';
import type { RedisService } from '../infrastructure/redis.service';
import { hmac } from './auth.crypto';
import { AuthService } from './auth.service';

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  WEB_AUTH_ENABLED: process.env.WEB_AUTH_ENABLED,
  WEB_AUTH_INTERNAL_TOKEN: process.env.WEB_AUTH_INTERNAL_TOKEN,
  TOKEN_HASH_SECRET: process.env.TOKEN_HASH_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
  WEB_SESSION_TTL_MS: process.env.WEB_SESSION_TTL_MS,
};

function configureAuthentication() {
  process.env.NODE_ENV = 'production';
  process.env.WEB_AUTH_ENABLED = 'true';
  process.env.WEB_AUTH_INTERNAL_TOKEN = 'i'.repeat(32);
  process.env.TOKEN_HASH_SECRET = 't'.repeat(32);
  process.env.SESSION_SECRET = 's'.repeat(32);
  process.env.WEB_SESSION_TTL_MS = '2592000000';
}

function restoreEnvironment() {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('AuthService fixed 30-day browser sessions', () => {
  beforeEach(() => {
    configureAuthentication();
  });

  afterEach(() => {
    jest.useRealTimers();
    restoreEnvironment();
  });

  it('issues a host-only secure HttpOnly cookie that expires with the server session', () => {
    const now = new Date('2026-07-29T12:30:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const service = new AuthService(
      {} as PrismaService,
      {} as RedisService,
    );
    const expiresAt = new Date('2026-08-28T12:30:00.000Z');

    expect(service.sessionCookieOptions(expiresAt)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: 2_592_000_000,
    });
    expect(service.sessionCookieOptions(expiresAt)).not.toHaveProperty('domain');
  });

  it('stores the same fixed 30-day boundary in the durable session record', async () => {
    const now = new Date('2026-07-29T12:30:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const deviceSecret = 'browser-device-secret';
    const webSessionCreate = jest.fn().mockResolvedValue({ id: 'session-1' });
    const tx = {
      webAccount: {
        upsert: jest.fn().mockResolvedValue({
          id: 'account-1',
          botUid: '00000001',
          status: WebAccountStatus.ACTIVE,
        }),
      },
      webLoginRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      webSession: {
        create: webSessionCreate,
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      webLoginRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1',
          status: WebLoginRequestStatus.APPROVED,
          approvedBotUid: '00000001',
          expiresAt: new Date(now.getTime() + 60_000),
          deviceSecretHash: hmac(deviceSecret, 't'.repeat(32)),
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as RedisService);

    const result = await service.complete('request-1', deviceSecret);

    expect(result.expiresAt.toISOString()).toBe('2026-08-28T12:30:00.000Z');
    expect(webSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        webAccountId: 'account-1',
        expiresAt: new Date('2026-08-28T12:30:00.000Z'),
      }),
    });
  });

  it('rotates the current browser session when authentication succeeds again', async () => {
    const now = new Date('2026-07-29T12:30:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const deviceSecret = 'browser-device-secret';
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      webAccount: {
        upsert: jest.fn().mockResolvedValue({
          id: 'account-1',
          botUid: '00000001',
          status: WebAccountStatus.ACTIVE,
        }),
      },
      webLoginRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      webSession: {
        updateMany,
        create: jest.fn().mockResolvedValue({ id: 'session-2' }),
      },
    };
    const prisma = {
      webLoginRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1',
          status: WebLoginRequestStatus.APPROVED,
          approvedBotUid: '00000001',
          expiresAt: new Date(now.getTime() + 60_000),
          deviceSecretHash: hmac(deviceSecret, 't'.repeat(32)),
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as RedisService);

    await service.complete('request-1', deviceSecret, 'current-session-token');

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        sessionHash: hmac('current-session-token', 's'.repeat(32)),
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
  });

  it('remains valid through 29 days 23:59 and never rolls the expiry forward', async () => {
    const issuedAt = new Date('2026-07-29T12:30:00.000Z');
    const expiresAt = new Date(issuedAt.getTime() + 2_592_000_000);
    jest.useFakeTimers().setSystemTime(
      new Date(expiresAt.getTime() - 60_000),
    );
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      webSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          revokedAt: null,
          expiresAt,
          webAccount: {
            botUid: '00000001',
            status: WebAccountStatus.ACTIVE,
          },
        }),
        update,
      },
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as RedisService);

    await expect(service.me('valid-session')).resolves.toEqual({
      authenticated: true,
      botUid: '00000001',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { lastSeenAt: expect.any(Date) },
    });
    expect(update.mock.calls[0]?.[0]?.data).not.toHaveProperty('expiresAt');

    jest.setSystemTime(expiresAt);
    await expect(service.me('expired-session')).resolves.toEqual({
      authenticated: false,
    });
  });

  it('rejects missing, forged, expired, revoked, and inactive sessions', async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1),
        webAccount: { status: WebAccountStatus.ACTIVE },
      })
      .mockResolvedValueOnce({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        webAccount: { status: WebAccountStatus.ACTIVE },
      })
      .mockResolvedValueOnce({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        webAccount: { status: WebAccountStatus.SUSPENDED },
      });
    const prisma = {
      webSession: {
        findUnique,
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as RedisService);

    await expect(service.me(null)).resolves.toEqual({ authenticated: false });
    await expect(service.me('forged')).resolves.toEqual({ authenticated: false });
    await expect(service.me('expired')).resolves.toEqual({ authenticated: false });
    await expect(service.me('revoked')).resolves.toEqual({ authenticated: false });
    await expect(service.me('inactive')).resolves.toEqual({ authenticated: false });
    expect(prisma.webSession.update).not.toHaveBeenCalled();
  });
});

describe('AuthService resumable device requests', () => {
  beforeEach(() => {
    configureAuthentication();
  });

  afterEach(() => {
    jest.useRealTimers();
    restoreEnvironment();
  });

  function pendingStore() {
    let sequence = 0;
    const records = new Map<string, Record<string, unknown>>();
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      sequence += 1;
      const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
      records.set(id, {
        id,
        status: WebLoginRequestStatus.PENDING,
        approvedBotUid: null,
        ...data,
      });
      return { id };
    });
    const updateMany = jest.fn(async ({ where, data }: {
      where: { id?: string };
      data: Record<string, unknown>;
    }) => {
      const current = where.id ? records.get(where.id) : undefined;
      if (!current) return { count: 0 };
      records.set(where.id!, { ...current, ...data });
      return { count: 1 };
    });
    const prisma = {
      webLoginRequest: {
        create,
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => records.get(where.id) ?? null),
        updateMany,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      webSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;
    return { prisma, records, create, updateMany };
  }

  it('reuses one signed pending request after reload, new tab, or browser reopen', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const store = pendingStore();
    const service = new AuthService(store.prisma, {} as RedisService);

    const first = await service.start();
    const resumed = await service.start(first.pendingToken);

    expect(resumed.resumed).toBe(true);
    expect(resumed.request).toEqual(first.request);
    expect(resumed.pendingToken).toBe(first.pendingToken);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('does not resume a forged pending cookie', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const store = pendingStore();
    const service = new AuthService(store.prisma, {} as RedisService);

    const first = await service.start();
    const forged = `${first.pendingToken.slice(0, -1)}x`;
    const second = await service.start(forged);

    expect(second.resumed).toBe(false);
    expect(second.request.requestId).not.toBe(first.request.requestId);
    expect(store.create).toHaveBeenCalledTimes(2);
  });

  it('resumes an approved request so the browser can complete login automatically', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const store = pendingStore();
    const service = new AuthService(store.prisma, {} as RedisService);
    const first = await service.start();
    const record = store.records.get(first.request.requestId)!;
    store.records.set(first.request.requestId, {
      ...record,
      status: WebLoginRequestStatus.APPROVED,
      approvedBotUid: '00000001',
    });

    const resumed = await service.start(first.pendingToken);

    expect(resumed.resumed).toBe(true);
    expect(resumed.request).toEqual(first.request);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('cancels the existing request only when the user explicitly asks for a new code', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const store = pendingStore();
    const service = new AuthService(store.prisma, {} as RedisService);
    const first = await service.start();

    const replacement = await service.restart(first.pendingToken);

    expect(replacement.request.requestId).not.toBe(first.request.requestId);
    expect(store.records.get(first.request.requestId)).toMatchObject({
      status: WebLoginRequestStatus.CANCELLED,
    });
    expect(store.create).toHaveBeenCalledTimes(2);
  });

  it('uses a short-lived host-only secure cookie separate from the 30-day session', () => {
    const now = new Date('2026-08-01T00:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const service = new AuthService({} as PrismaService, {} as RedisService);
    const expiresAt = new Date(now.getTime() + 300_000);

    expect(service.pendingCookieOptions(expiresAt)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: 300_000,
    });
    expect(service.pendingCookieOptions(expiresAt)).not.toHaveProperty('domain');
    expect(service.config.pendingCookieName).not.toBe(service.config.cookieName);
  });
});
