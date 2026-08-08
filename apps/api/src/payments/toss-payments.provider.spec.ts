import type { PaymentConfig } from './payment.config';
import { TossPaymentsProvider } from './toss-payments.provider';

const config: PaymentConfig = {
  provider: 'toss',
  fulfillmentEnabled: false,
  fulfillmentUrl: '',
  fulfillmentToken: '',
  fulfillmentTimeoutMs: 5_000,
  tossClientKey: 'test_gck_test_client_key_1234567890',
  tossSecretKey: 'test_gsk_test_secret_key_1234567890',
  tossApiBaseUrl: 'https://api.tosspayments.com',
};

const ORDER_ID = 'GOLD_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PAYMENT_KEY = 'test_payment_key_1234567890';

function payment(status = 'DONE', totalAmount = 10_000) {
  return { paymentKey: PAYMENT_KEY, orderId: ORDER_ID, status, totalAmount };
}

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }));
}

describe('TossPaymentsProvider sandbox adapter', () => {
  it('returns only public Payment Widget checkout data without a network request', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    const provider = new TossPaymentsProvider(config, fetcher);
    await expect(provider.createPayment({
      orderId: ORDER_ID,
      amountKrw: 10_000,
      orderName: '20,000,000 골드',
      customerKey: 'customer_safe_1234567890',
    })).resolves.toEqual({
      checkout: {
        kind: 'toss-widget',
        clientKey: config.tossClientKey,
        customerKey: 'customer_safe_1234567890',
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('confirms with server amount, Basic auth, and a stable idempotency key', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() => response(payment()));
    const provider = new TossPaymentsProvider(config, fetcher);
    await expect(provider.verifyPayment({
      orderId: ORDER_ID,
      paymentKey: PAYMENT_KEY,
      amountKrw: 10_000,
    })).resolves.toEqual(expect.objectContaining({
      status: 'approved',
      amountKrw: 10_000,
      orderId: ORDER_ID,
      paymentKey: PAYMENT_KEY,
    }));

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.tosspayments.com/v1/payments/confirm');
    expect(init?.headers).toEqual(expect.objectContaining({
      authorization: `Basic ${Buffer.from(`${config.tossSecretKey}:`).toString('base64')}`,
      'Idempotency-Key': `confirm_${ORDER_ID}`,
      'content-type': 'application/json',
    }));
    expect(JSON.parse(String(init?.body))).toEqual({
      paymentKey: PAYMENT_KEY,
      orderId: ORDER_ID,
      amount: 10_000,
    });
  });

  it('rejects a mismatched Toss amount instead of approving it', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() => response(payment('DONE', 1)));
    const provider = new TossPaymentsProvider(config, fetcher);
    await expect(provider.verifyPayment({
      orderId: ORDER_ID,
      paymentKey: PAYMENT_KEY,
      amountKrw: 10_000,
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'TOSS_CONFIRM_MISMATCH' }) });
  });

  it('re-queries a webhook payment by the stored orderId', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() => response(payment()));
    const provider = new TossPaymentsProvider(config, fetcher);
    await expect(provider.lookupPayment(ORDER_ID)).resolves.toEqual(expect.objectContaining({ status: 'approved' }));
    expect(fetcher.mock.calls[0][0]).toBe(
      `https://api.tosspayments.com/v1/payments/orders/${ORDER_ID}`,
    );
    expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
  });

  it('uses one stable idempotency key for repeated full cancellation requests', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() => response(payment('CANCELED')));
    const provider = new TossPaymentsProvider(config, fetcher);
    const input = {
      orderId: ORDER_ID,
      paymentKey: PAYMENT_KEY,
      cancelReason: '테스트 결제 취소',
    };
    await expect(provider.cancelPayment(input)).resolves.toEqual({ cancelled: true });
    await expect(provider.cancelPayment(input)).resolves.toEqual({ cancelled: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.headers).toEqual(expect.objectContaining({
        'Idempotency-Key': `cancel_${ORDER_ID}`,
      }));
    }
  });

  it('accepts an already cancelled provider result and rejects a missing payment', async () => {
    const cancelledFetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() => response(payment('CANCELED')));
    const provider = new TossPaymentsProvider(config, cancelledFetcher);
    await expect(provider.cancelPayment({
      orderId: ORDER_ID,
      paymentKey: PAYMENT_KEY,
      cancelReason: '테스트 결제 취소 재확인',
    })).resolves.toEqual({ cancelled: true });

    const missingFetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() => response({ code: 'NOT_FOUND' }, 404));
    const missing = new TossPaymentsProvider(config, missingFetcher);
    await expect(missing.cancelPayment({
      orderId: ORDER_ID,
      paymentKey: PAYMENT_KEY,
      cancelReason: '존재하지 않는 결제 취소',
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'TOSS_API_REQUEST_FAILED' }) });
  });

  it('never forwards a raw Toss error body to the application', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() => response({
      code: 'SECRET_PROVIDER_ERROR',
      message: 'provider internal detail',
    }, 400));
    const provider = new TossPaymentsProvider(config, fetcher);
    await expect(provider.verifyPayment({
      orderId: ORDER_ID,
      paymentKey: PAYMENT_KEY,
      amountKrw: 10_000,
    })).rejects.toMatchObject({ response: {
      code: 'TOSS_API_REQUEST_FAILED',
      message: '토스페이먼츠 테스트 요청을 완료하지 못했습니다.',
    } });
  });
});
