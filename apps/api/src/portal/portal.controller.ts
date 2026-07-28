import { Controller, Get, Headers, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { PortalService } from './portal.service';

@Controller('api/portal')
export class PortalController {
  constructor(private readonly auth: AuthService, private readonly portal: PortalService) {}

  @Get('dashboard')
  async dashboard(@Headers('cookie') cookie: string | undefined, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.me(this.auth.readSessionToken(cookie));
    if (!session.authenticated) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' });
    }
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Vary', 'Cookie');
    return this.portal.dashboard(session.botUid);
  }
}
