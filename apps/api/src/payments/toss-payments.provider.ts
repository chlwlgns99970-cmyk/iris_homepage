import { BadGatewayException } from '@nestjs/common';
import type { PaymentConfig } from './payment.config';
import type {
  CancelProviderPayment,
  ConfirmProviderPayment,
  CreateProviderPayment,
  PaymentProvider,
  ProviderPayment,
} from './payment.provider';

type Fetcher = typeof fetch;

type TossPaymentBody = {
  paymentKey?: unknown;
  orderId?: unknown;
  status?: unknown;
  totalAmount?: unknown;
};

const CANCELLED_STATUSES = new Set(['CANCELED', 'PARTIAL_CANCELED']);

function providerFailure(code: string, message: string) {
  return new BadGatewayException({ code, message });
}
function mapPayment(value: unknown): ProviderPayment {
  const body = value as TossPaymentBody | null;
  if (
    body === null
    || typeof body !== 'object'
    || typeof body.paymentKey !== 'string'
    || body.paymentKey.length < 1
    || body.paymentKey.length > 200
    || typeof body.orderId !== 'string'
    || !/^GOLD_[A-F0-9]{32}$/.test(body.orderId)
    || typeof body.status !== 'string'
    || typeof body.totalAmount !== 'number'
    || !Number.isSafeInteger(body.totalAmount)
    || body.totalAmount <= 0
  ) {
    throw providerFailure('TOSS_RESPONSE_INVALID', '토스페이먼츠 응답을 안전하게 확인하지 못했습니다.');
  }

  return {
    status: body.status === 'DONE'
      ? 'approved'
      : CANCELLED_STATUSES.has(body.status) ? 'cancelled' : 'failed',
    amountKrw: body.totalAmount,
    paymentKey: body.paymentKey,
    orderId: body.orderId,
    providerStatus: body.status,
  };
}

export class TossPaymentsProvider implements PaymentProvider {
  readonly name = 'toss';
  readonly enabled = true;
  readonly sandbox = true;

  constructor(
    private readonly config: PaymentConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async createPayment(input: CreateProviderPayment) {
    return {
      checkout: {
        kind: 'toss-widget' as const,
        clientKey: this.config.tossClientKey,
        customerKey: input.customerKey,
      },
    };
  }

  async verifyPayment(input: ConfirmProviderPayment) {
    const payment = mapPayment(await this.request('/v1/payments/confirm', {
      method: 'POST',
      idempotencyKey: `confirm_${input.orderId}`,
      body: {
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amountKrw,
      },
    }));
    if (
      payment.orderId !== input.orderId
      || payment.paymentKey !== input.paymentKey
      || payment.amountKrw !== input.amountKrw
    ) {
      throw providerFailure('TOSS_CONFIRM_MISMATCH', '토스 결제 승인 정보가 주문과 일치하지 않습니다.');
    }
    return payment;
  }

  async lookupPayment(orderId: string) {
    const payment = mapPayment(await this.request(`/v1/payments/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
    }));
    if (payment.orderId !== orderId) {
      throw providerFailure('TOSS_LOOKUP_MISMATCH', '토스 결제 조회 정보가 주문과 일치하지 않습니다.');
    }
    return payment;
  }

  async cancelPayment(input: CancelProviderPayment) {
    if (!input.paymentKey) return { cancelled: false };
    const payment = mapPayment(await this.request(
      `/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
      {
        method: 'POST',
        idempotencyKey: `cancel_${input.orderId}`,
        body: { cancelReason: input.cancelReason },
      },
    ));
    if (
      payment.orderId !== input.orderId
      || payment.paymentKey !== input.paymentKey
      || payment.status !== 'cancelled'
    ) {
      throw providerFailure('TOSS_CANCEL_MISMATCH', '토스 결제 취소 정보를 안전하게 확인하지 못했습니다.');
    }
    return { cancelled: true };
  }

  private async request(
    path: string,
    input: { method: 'GET' | 'POST'; idempotencyKey?: string; body?: Record<string, unknown> },
  ) {
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Basic ${Buffer.from(`${this.config.tossSecretKey}:`, 'utf8').toString('base64')}`,
    };
    if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;
    if (input.body) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await this.fetcher(`${this.config.tossApiBaseUrl}${path}`, {
        method: input.method,
        headers,
        redirect: 'error',
        cache: 'no-store',
        ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      });
    } catch {
      throw providerFailure('TOSS_API_UNAVAILABLE', '토스페이먼츠 테스트 API에 연결하지 못했습니다.');
    }

    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      throw providerFailure('TOSS_API_REQUEST_FAILED', '토스페이먼츠 테스트 요청을 완료하지 못했습니다.');
    }
    return body;
  }
}
