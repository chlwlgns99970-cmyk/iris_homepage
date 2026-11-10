import { Controller, Get, Headers, Res, Query, UnauthorizedException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { PortalService } from './portal.service';

export class PortalQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000000)
  page = 1;
}

@Controller('api/portal')
export class PortalController {
  constructor(private readonly auth: AuthService, private readonly portal: PortalService) {}

  @Get('dashboard')
  async dashboard(@Headers('cookie') cookie: string | undefined, @Res({ passthrough: true }) response: Response, @Query() query: PortalQuery = new PortalQuery()) {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Vary', 'Cookie');
    const session = await this.auth.me(this.auth.readSessionToken(cookie));
    if (!session.authenticated) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' });
    }
    return this.portal.dashboard(session.botUid, { bypassCache: true, rankingPage: query.page });
  }
}
