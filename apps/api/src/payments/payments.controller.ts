import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { CreatePaymentOrderDto } from './payment.dto';
import { PaymentsService } from './payments.service';

function requestSubject(request: Request) {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function privateHeaders(response: Response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Vary', 'Cookie');
}

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly auth: AuthService, private readonly payments: PaymentsService) {}

  @Get('products')
  products() {
    return this.payments.storefront();
  }

  @Get('history')
  async history(
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    privateHeaders(response);
    return this.payments.history(await this.requireBotUid(cookie));
  }

  @Get('orders/:orderId')
  async order(
    @Param('orderId') orderId: string,
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    privateHeaders(response);
    return this.payments.getOrder(await this.requireBotUid(cookie), orderId);
  }

  @Post('orders')
  async create(
    @Body() body: CreatePaymentOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('cookie') cookie: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    privateHeaders(response);
    const botUid = await this.requireBotUid(cookie);
    await this.auth.enforceRateLimit('payment-create-ip', requestSubject(request), 20, 60);
    await this.auth.enforceRateLimit('payment-create-account', botUid, 10, 60);
    return this.payments.createOrder(botUid, body.productId, idempotencyKey ?? '');
  }

  @Post('orders/:orderId/confirm')
  @HttpCode(200)
  async confirm(
    @Param('orderId') orderId: string,
    @Headers('cookie') cookie: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    privateHeaders(response);
    const botUid = await this.requireBotUid(cookie);
    await this.auth.enforceRateLimit('payment-confirm-ip', requestSubject(request), 30, 60);
    await this.auth.enforceRateLimit('payment-confirm-account', botUid, 15, 60);
    return this.payments.confirm(botUid, orderId);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(200)
  async cancel(
    @Param('orderId') orderId: string,
    @Headers('cookie') cookie: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    privateHeaders(response);
    const botUid = await this.requireBotUid(cookie);
    await this.auth.enforceRateLimit('payment-cancel-ip', requestSubject(request), 20, 60);
    return this.payments.cancel(botUid, orderId);
  }

  private async requireBotUid(cookie: string | undefined) {
    const session = await this.auth.me(this.auth.readSessionToken(cookie));
    if (!session.authenticated) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' });
    }
    return session.botUid;
  }
}
