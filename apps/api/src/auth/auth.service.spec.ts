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
};

function configureAuthentication() {
  process.env.NODE_ENV = 'production';
  process.env.WEB_AUTH_ENABLED = 'true';
  process.env.WEB_AUTH_INTERNAL_TOKEN = 'i'.repeat(32);
  process.env.TOKEN_HASH_SECRET = 't'.repeat(32);
  process.env.SESSION_SECRET = 's'.repeat(32);
}

function restoreEnvironment() {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('AuthService Korean-calendar browser sessions', () => {
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
    const expiresAt = new Date('2026-07-29T15:00:00.000Z');

    expect(service.sessionCookieOptions(expiresAt)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: 9_000_000,
    });
    expect(service.sessionCookieOptions(expiresAt)).not.toHaveProperty('domain');
  });

  it('stores the same next-Seoul-midnight boundary in the durable session record', async () => {
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
      webSession: { create: webSessionCreate },
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

    expect(result.expiresAt.toISOString()).toBe('2026-07-29T15:00:00.000Z');
    expect(webSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        webAccountId: 'account-1',
        expiresAt: new Date('2026-07-29T15:00:00.000Z'),
      }),
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
