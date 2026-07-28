import type { Response } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthService } from '../auth/auth.service';
import { PortalController } from './portal.controller';
import type { PortalService } from './portal.service';

describe('PortalController authenticated UID routing', () => {
  it('uses only the current session botUid and prevents shared response caching', async () => {
    const auth = {
      readSessionToken: jest.fn().mockReturnValue('session'),
      me: jest.fn().mockResolvedValue({ authenticated: true, botUid: '00000002' }),
    } as unknown as AuthService;
    const portal = {
      dashboard: jest.fn().mockResolvedValue({ characters: [] }),
    } as unknown as PortalService;
    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;

    await new PortalController(auth, portal).dashboard('cookie', response);

    expect(portal.dashboard).toHaveBeenCalledTimes(1);
    expect(portal.dashboard).toHaveBeenCalledWith('00000002');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store, max-age=0');
    expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Cookie');
  });

  it('prevents shared caching even when the session is anonymous', async () => {
    const auth = {
      readSessionToken: jest.fn().mockReturnValue(null),
      me: jest.fn().mockResolvedValue({ authenticated: false }),
    } as unknown as AuthService;
    const portal = {
      dashboard: jest.fn(),
    } as unknown as PortalService;
    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;

    await expect(
      new PortalController(auth, portal).dashboard(undefined, response),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(portal.dashboard).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store, max-age=0');
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Cookie');
  });
});
