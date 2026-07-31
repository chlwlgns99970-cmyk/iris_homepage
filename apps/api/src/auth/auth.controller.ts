import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApproveDeviceDto, DeviceCredentialDto, LegacyLinkDto } from './auth.dto';
import { AuthService } from './auth.service';

function requestSubject(request: Request) {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function setPrivateSessionHeaders(response: Response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Vary', 'Cookie');
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('link/consume')
  legacyConsume(@Body() body: LegacyLinkDto): never {
    void body;
    throw new ServiceUnavailableException({
      code: 'IRIS_LINK_NOT_CONFIGURED',
      message: '봇 UID 연결 서버가 아직 구성되지 않았습니다.',
    });
  }

  @Post('device/start')
  async start(@Req() request: Request) {
    await this.auth.enforceRateLimit('start', requestSubject(request), 10, 60);
    return this.auth.start();
  }

  @Post('device/poll')
  @HttpCode(200)
  async poll(@Body() body: DeviceCredentialDto, @Req() request: Request) {
    await this.auth.enforceRateLimit('poll', requestSubject(request), 60, 60);
    return this.auth.poll(body.requestId, body.deviceSecret);
  }

  @Post('device/complete')
  @HttpCode(200)
  async complete(
    @Body() body: DeviceCredentialDto,
    @Req() request: Request,
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.enforceRateLimit('complete', requestSubject(request), 10, 60);
    const result = await this.auth.complete(
      body.requestId,
      body.deviceSecret,
      this.auth.readSessionToken(cookie),
    );
    setPrivateSessionHeaders(response);
    response.cookie(
      this.auth.config.cookieName,
      result.sessionToken,
      this.auth.sessionCookieOptions(result.expiresAt),
    );
    return { authenticated: true, botUid: result.botUid };
  }

  @Post('device/cancel')
  @HttpCode(200)
  cancel(@Body() body: DeviceCredentialDto) {
    return this.auth.cancel(body.requestId, body.deviceSecret);
  }

  @Get('me')
  me(
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    setPrivateSessionHeaders(response);
    return this.auth.me(this.auth.readSessionToken(cookie));
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    setPrivateSessionHeaders(response);
    const result = await this.auth.logout(this.auth.readSessionToken(cookie));
    response.clearCookie(
      this.auth.config.cookieName,
      this.auth.sessionCookieOptions(new Date(0)),
    );
    return result;
  }
}

@Controller('internal/auth/device')
export class InternalAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('approve')
  @HttpCode(200)
  async approve(
    @Headers('x-web-auth-internal-token') token: string | undefined,
    @Body() body: ApproveDeviceDto,
    @Req() request: Request,
  ) {
    this.auth.verifyInternalToken(token);
    await this.auth.enforceRateLimit('internal-approve', requestSubject(request), 60, 60);
    return this.auth.approve(body.userCode, body.botUid);
  }
}
