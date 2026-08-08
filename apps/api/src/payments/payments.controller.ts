import {
  BadRequestException,
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
import {
  ConfirmPaymentDto,
  CreatePaymentOrderDto,
  LegacyConfirmPaymentDto,
} from './payment.dto';
import { PaymentsService } from './payments.service';

function requestSubject(request: Request) {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function privateHeaders(response: Response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Vary', 'Cookie');
}

function tossWebhookInput(body: unknown, transmissionId: string | undefined) {
  const event = body as {
    eventType?: unknown;
    data?: { orderId?: unknown; paymentKey?: unknown; status?: unknown };
  } | null;
  if (
    event === null
    || typeof event !== 'object'
    || typeof event.eventType !== 'string'
    || event.data === null
    || typeof event.data !== 'object'
    || typeof event.data.orderId !== 'string'
    || typeof event.data.paymentKey !== 'string'
    || typeof event.data.status !== 'string'
    || typeof transmissionId !== 'string'
  ) {
    throw new BadRequestException({ code: 'TOSS_WEBHOOK_INVALID', message: '웹훅 요청 형식이 올바르지 않습니다.' });
  }
  return {
    eventType: event.eventType,
    orderId: event.data.orderId,
    paymentKey: event.data.paymentKey,
    providerStatus: event.data.status,
    transmissionId,
  };
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
  async confirmLegacy(
    @Param('orderId') orderId: string,
    @Body() body: LegacyConfirmPaymentDto,
    @Headers('cookie') cookie: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    privateHeaders(response);
    const botUid = await this.requireBotUid(cookie);
    await this.auth.enforceRateLimit('payment-confirm-ip', requestSubject(request), 30, 60);
    await this.auth.enforceRateLimit('payment-confirm-account', botUid, 15, 60);
    return this.payments.confirm(botUid, {
      orderId,
      paymentKey: body.paymentKey,
      amountKrw: body.amount,
    });
  }

  @Post('confirm')
  @HttpCode(200)
  async confirm(
    @Body() body: ConfirmPaymentDto,
    @Headers('cookie') cookie: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    privateHeaders(response);
    const botUid = await this.requireBotUid(cookie);
    await this.auth.enforceRateLimit('payment-confirm-ip', requestSubject(request), 30, 60);
    await this.auth.enforceRateLimit('payment-confirm-account', botUid, 15, 60);
    return this.payments.confirm(botUid, {
      orderId: body.orderId,
      paymentKey: body.paymentKey,
      amountKrw: body.amount,
    });
  }

  @Post('webhooks/toss')
  @HttpCode(200)
  async tossWebhook(
    @Body() body: unknown,
    @Headers('tosspayments-webhook-transmission-id') transmissionId: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    await this.auth.enforceRateLimit('payment-webhook-toss-ip', requestSubject(request), 120, 60);
    return this.payments.reconcileTossWebhook(tossWebhookInput(body, transmissionId));
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
