import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController security boundary', () => {
  const authState = { authenticated: true };
  const auth = {
    readSessionToken: jest.fn(() => 'session'),
    me: jest.fn(async (): Promise<{ authenticated: false } | { authenticated: true; botUid: string }> => authState.authenticated
      ? { authenticated: true as const, botUid: '90000001' }
      : { authenticated: false as const }),
    enforceRateLimit: jest.fn(async () => undefined),
  };
  const payments = {
    storefront: jest.fn(() => ({ enabled: false, provider: 'disabled', products: [] })),
    history: jest.fn(async () => ({ items: [] })),
    getOrder: jest.fn(async () => ({ orderId: 'safe' })),
    createOrder: jest.fn(async () => ({ order: { orderId: 'safe' } })),
    confirm: jest.fn(async () => ({ status: 'completed' })),
    cancel: jest.fn(async () => ({ status: 'cancelled' })),
    reconcileTossWebhook: jest.fn(async () => ({ received: true })),
  };

  async function application() {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PaymentsService, useValue: payments },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    return app;
  }

  beforeEach(() => {
    authState.authenticated = true;
    jest.clearAllMocks();
  });

  it('rejects unauthenticated order history', async () => {
    const app = await application();
    authState.authenticated = false;
    await request(app.getHttpServer()).get('/api/payments/history').expect(401);
    expect(payments.history).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    { productId: 'GOLD_1000', price: 1 },
    { productId: 'GOLD_1000', amount: 1 },
    { productId: 'GOLD_1000', gold: 999_999_999 },
    { productId: 'GOLD_1000', quantity: 100 },
  ])('rejects client-controlled price/gold fields: %j', async (body) => {
    const app = await application();
    await request(app.getHttpServer())
      .post('/api/payments/orders')
      .set('Cookie', 'session=value')
      .set('Idempotency-Key', 'safe_idempotency_key_1000')
      .send(body)
      .expect(400);
    expect(payments.createOrder).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an unknown product and passes only the catalog productId', async () => {
    const app = await application();
    await request(app.getHttpServer())
      .post('/api/payments/orders')
      .set('Cookie', 'session=value')
      .set('Idempotency-Key', 'safe_idempotency_key_1001')
      .send({ productId: 'GOLD_UNKNOWN' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/payments/orders')
      .set('Cookie', 'session=value')
      .set('Idempotency-Key', 'safe_idempotency_key_1002')
      .send({ productId: 'GOLD_1000' })
      .expect(201);
    expect(payments.createOrder).toHaveBeenCalledWith('90000001', 'GOLD_1000', 'safe_idempotency_key_1002');
    const body = payments.createOrder.mock.calls[0];
    expect(JSON.stringify(body)).not.toContain('price');
    expect(JSON.stringify(body)).not.toContain('gold');
    await app.close();
  });

  it('confirms only the authenticated account with the exact callback fields', async () => {
    const app = await application();
    const callback = {
      orderId: 'GOLD_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      paymentKey: 'test-payment-key',
      amount: 10_000,
    };
    await request(app.getHttpServer())
      .post('/api/payments/confirm')
      .set('Cookie', 'session=value')
      .send(callback)
      .expect(200);
    expect(payments.confirm).toHaveBeenCalledWith('90000001', {
      orderId: callback.orderId,
      paymentKey: callback.paymentKey,
      amountKrw: callback.amount,
    });
    expect(auth.enforceRateLimit).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('rejects malformed confirm callbacks before the payment service', async () => {
    const app = await application();
    await request(app.getHttpServer())
      .post('/api/payments/confirm')
      .set('Cookie', 'session=value')
      .send({ orderId: 'wrong', paymentKey: '', amount: 0, gold: 999 })
      .expect(400);
    expect(payments.confirm).not.toHaveBeenCalled();
    await app.close();
  });

  it('accepts only the official Toss payment webhook envelope and transmission id', async () => {
    const app = await application();
    const body = {
      eventType: 'PAYMENT_STATUS_CHANGED',
      data: {
        orderId: 'GOLD_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        paymentKey: 'test-payment-key',
        status: 'DONE',
      },
    };
    await request(app.getHttpServer())
      .post('/api/payments/webhooks/toss')
      .set('tosspayments-webhook-transmission-id', 'transmission-safe-1')
      .send(body)
      .expect(200);
    expect(payments.reconcileTossWebhook).toHaveBeenCalledWith({
      eventType: body.eventType,
      orderId: body.data.orderId,
      paymentKey: body.data.paymentKey,
      providerStatus: body.data.status,
      transmissionId: 'transmission-safe-1',
    });

    jest.clearAllMocks();
    await request(app.getHttpServer())
      .post('/api/payments/webhooks/toss')
      .send(body)
      .expect(400);
    expect(payments.reconcileTossWebhook).not.toHaveBeenCalled();
    await app.close();
  });
});
