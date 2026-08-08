import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { PaymentConfig } from './payment.config';

export const GOLD_FULFILLMENT = Symbol('GOLD_FULFILLMENT');

export type GoldFulfillmentRequest = {
  orderId: string;
  botUid: string;
  productId: string;
  goldAmount: number;
};

export type GoldFulfillmentResult = {
  fulfilled: true;
  replayed: boolean;
  currentGold: string;
};

export interface GoldFulfillmentClient {
  readonly enabled: boolean;
  fulfill(input: GoldFulfillmentRequest): Promise<GoldFulfillmentResult>;
}

export class HttpGoldFulfillmentClient implements GoldFulfillmentClient {
  readonly enabled: boolean;

  constructor(private readonly config: PaymentConfig) {
    this.enabled = config.fulfillmentEnabled;
  }

  async fulfill(input: GoldFulfillmentRequest): Promise<GoldFulfillmentResult> {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        code: 'PAYMENT_FULFILLMENT_NOT_CONFIGURED',
        message: '골드 지급 시스템을 준비 중입니다.',
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.fulfillmentTimeoutMs);
    try {
      const response = await fetch(`${this.config.fulfillmentUrl}/internal/payments/gold/fulfill`, {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          'x-rpg-payment-internal-token': this.config.fulfillmentToken,
        },
        body: JSON.stringify(input),
      });
      const body = await response.json().catch(() => null) as Partial<GoldFulfillmentResult> | null;
      if (
        !response.ok
        || body?.fulfilled !== true
        || typeof body.replayed !== 'boolean'
        || typeof body.currentGold !== 'string'
        || !/^\d+$/.test(body.currentGold)
      ) {
        throw new Error('invalid fulfillment response');
      }
      return body as GoldFulfillmentResult;
    } catch {
      throw new BadGatewayException({
        code: 'GOLD_FULFILLMENT_FAILED',
        message: '결제는 확인됐지만 골드 지급을 완료하지 못했습니다. 운영자가 안전하게 재처리합니다.',
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
