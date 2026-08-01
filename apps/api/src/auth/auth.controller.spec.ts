import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

function responseMock() {
  return {
    setHeader: jest.fn(),
    clearCookie: jest.fn(),
    cookie: jest.fn(),
  } as unknown as Response;
}

describe('AuthController private session responses', () => {
  it('stores a resumable pending credential only in a secure HttpOnly cookie', async () => {
    const expiresAt = new Date('2026-08-01T00:05:00.000Z');
    const requestResult = {
      requestId: '00000000-0000-4000-8000-000000000001',
      userCode: 'ABCD-EFGH',
      deviceSecret: 'd'.repeat(43),
      expiresAt: expiresAt.toISOString(),
    };
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
      expires: expiresAt,
      maxAge: 300_000,
    };
    const auth = {
      config: { pendingCookieName: 'natebe_session_pending' },
      enforceRateLimit: jest.fn().mockResolvedValue(undefined),
      readPendingToken: jest.fn().mockReturnValue('existing-pending-token'),
      start: jest.fn().mockResolvedValue({
        request: requestResult,
        pendingToken: 'signed-pending-token',
        expiresAt,
        resumed: true,
      }),
      pendingCookieOptions: jest.fn().mockReturnValue(cookieOptions),
    } as unknown as AuthService;
    const response = responseMock();

    const result = await new AuthController(auth).start(
      { ip: '127.0.0.1', socket: {} } as Request,
      'natebe_session_pending=existing-pending-token',
      response,
    );

    expect(auth.start).toHaveBeenCalledWith('existing-pending-token');
    expect(response.cookie).toHaveBeenCalledWith(
      'natebe_session_pending',
      'signed-pending-token',
      cookieOptions,
    );
    expect(result).toEqual(requestResult);
    expect(JSON.stringify(result)).not.toContain('signed-pending-token');
  });

  it('rotates the current cookie into a fixed-expiry session on completion', async () => {
    const expiresAt = new Date('2026-08-30T00:00:00.000Z');
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
      expires: expiresAt,
      maxAge: 2_592_000_000,
    };
    const auth = {
      config: {
        cookieName: 'natebe_session',
        pendingCookieName: 'natebe_session_pending',
      },
      enforceRateLimit: jest.fn().mockResolvedValue(undefined),
      readSessionToken: jest.fn().mockReturnValue('previous-session'),
      complete: jest.fn().mockResolvedValue({
        botUid: '00000007',
        sessionToken: 'rotated-session',
        expiresAt,
      }),
      sessionCookieOptions: jest.fn().mockReturnValue(cookieOptions),
      pendingCookieOptions: jest.fn().mockReturnValue(cookieOptions),
    } as unknown as AuthService;
    const response = responseMock();

    const result = await new AuthController(auth).complete(
      { requestId: 'request-1', deviceSecret: 'd'.repeat(43) },
      { ip: '127.0.0.1', socket: {} } as Request,
      'natebe_session=previous-session',
      response,
    );

    expect(auth.complete).toHaveBeenCalledWith(
      'request-1',
      'd'.repeat(43),
      'previous-session',
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'natebe_session',
      'rotated-session',
      cookieOptions,
    );
    expect(result).toEqual({ authenticated: true, botUid: '00000007' });
  });

  it('returns the current session identity with private no-store headers', async () => {
    const auth = {
      readSessionToken: jest.fn().mockReturnValue('session'),
      me: jest.fn().mockResolvedValue({ authenticated: true, botUid: '00000007' }),
    } as unknown as AuthService;
    const response = responseMock();

    const result = await new AuthController(auth).me('cookie', response);

    expect(result).toEqual({ authenticated: true, botUid: '00000007' });
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store, max-age=0');
    expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Cookie');
  });

  it('revokes logout state with the same private cache policy', async () => {
    const auth = {
      config: {
        cookieName: 'natebe_session',
        pendingCookieName: 'natebe_session_pending',
      },
      readSessionToken: jest.fn().mockReturnValue('session'),
      logout: jest.fn().mockResolvedValue({ success: true }),
      sessionCookieOptions: jest.fn().mockReturnValue({}),
      pendingCookieOptions: jest.fn().mockReturnValue({}),
    } as unknown as AuthService;
    const response = responseMock();

    await new AuthController(auth).logout('cookie', response);

    expect(response.clearCookie).toHaveBeenCalledWith('natebe_session', {});
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store, max-age=0');
    expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Cookie');
  });
});
