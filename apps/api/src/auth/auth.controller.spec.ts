import type { Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

function responseMock() {
  return {
    setHeader: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;
}

describe('AuthController private session responses', () => {
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
      config: { cookieName: 'natebe_session' },
      readSessionToken: jest.fn().mockReturnValue('session'),
      logout: jest.fn().mockResolvedValue({ success: true }),
      sessionCookieOptions: jest.fn().mockReturnValue({}),
    } as unknown as AuthService;
    const response = responseMock();

    await new AuthController(auth).logout('cookie', response);

    expect(response.clearCookie).toHaveBeenCalledWith('natebe_session', {});
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store, max-age=0');
    expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Cookie');
  });
});
