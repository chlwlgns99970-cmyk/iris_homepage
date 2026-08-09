import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentOrderStatus, type PaymentOrder } from '@prisma/client';
import type { GoldFulfillmentClient, GoldFulfillmentRequest } from './gold-fulfillment.client';
import { CUSTOM_GOLD_PRODUCT_ID } from './payment-products';
import { MockPaymentProvider, type PaymentProvider } from './payment.provider';
import { PaymentsService } from './payments.service';

const BOT_UID_A = '90000001';
const BOT_UID_B = '90000002';

class FakePrisma {
  readonly accounts = new Map([[BOT_UID_A, { id: 'account-a' }], [BOT_UID_B, { id: 'account-b' }]]);
  readonly orders: PaymentOrder[] = [];
  readonly audits: string[] = [];
  sequence = 0;

  webAccount: { findUnique: (args: { where: { botUid: string } }) => Promise<{ id: string } | null> };

  paymentOrder: {
    findUnique: (args: {
      where: { idempotencyKeyHash?: string; providerPaymentKey?: string; orderId?: string };
      include?: unknown;
    }) => Promise<(PaymentOrder & { webAccount?: { botUid: string } }) | null>;
    create: (args: { data: Partial<PaymentOrder> }) => Promise<PaymentOrder>;
    findFirst: (args: { where: { orderId: string; webAccountId: string } }) => Promise<PaymentOrder | null>;
    findMany: (args: { where: { webAccountId: string } }) => Promise<PaymentOrder[]>;
    update: (args: { where: { id: string }; data: Partial<PaymentOrder> }) => Promise<PaymentOrder>;
    updateMany: (args: { where: { id: string; status?: PaymentOrderStatus }; data: Partial<PaymentOrder> }) => Promise<{ count: number }>;
  };

  auditLog = { create: async ({ data }: { data: { action: string } }) => {
    this.audits.push(data.action);
    return data;
  } };

  constructor() {
    this.webAccount = {
      findUnique: async ({ where }) => this.accounts.get(where.botUid) ?? null,
    };
    this.paymentOrder = {
      findUnique: async ({ where, include }) => {
        const order = this.orders.find((entry) => (
          (where.idempotencyKeyHash !== undefined && entry.idempotencyKeyHash === where.idempotencyKeyHash)
          || (where.providerPaymentKey !== undefined && entry.providerPaymentKey === where.providerPaymentKey)
          || (where.orderId !== undefined && entry.orderId === where.orderId)
        )) ?? null;
        if (!order || !include) return order;
        const botUid = [...this.accounts.entries()].find(([, account]) => account.id === order.webAccountId)?.[0];
        return botUid ? { ...order, webAccount: { botUid } } : order;
      },
      create: async ({ data }) => {
      const now = new Date('2026-08-09T00:00:00.000Z');
      const order = {
        id: `order-${++this.sequence}`,
        orderId: data.orderId,
        webAccountId: data.webAccountId,
        productId: data.productId,
        priceKrw: data.priceKrw,
        goldAmount: data.goldAmount,
        status: PaymentOrderStatus.PENDING,
        provider: data.provider,
        providerPaymentKey: null,
        idempotencyKeyHash: data.idempotencyKeyHash,
        goldBalanceAfter: null,
        failureCode: null,
        createdAt: now,
        paidAt: null,
        fulfillmentStartedAt: null,
        fulfilledAt: null,
        cancelledAt: null,
        refundedAt: null,
      } as PaymentOrder;
      this.orders.push(order);
        return order;
      },
      findFirst: async ({ where }) => (
        this.orders.find((order) => order.orderId === where.orderId && order.webAccountId === where.webAccountId) ?? null
      ),
      findMany: async ({ where }) => (
        this.orders.filter((order) => order.webAccountId === where.webAccountId).reverse()
      ),
      update: async ({ where, data }) => {
        const order = this.orders.find((entry) => entry.id === where.id);
        if (!order) throw new Error('missing order');
        Object.assign(order, data);
        return order;
      },
      updateMany: async ({ where, data }) => {
        const order = this.orders.find((entry) => entry.id === where.id);
        if (!order || (where.status && order.status !== where.status)) return { count: 0 };
        if (data.providerPaymentKey && this.orders.some((entry) => (
          entry.id !== order.id && entry.providerPaymentKey === data.providerPaymentKey
        ))) throw Object.assign(new Error('duplicate payment key'), { code: 'P2002' });
        Object.assign(order, data);
        return { count: 1 };
      },
    };
  }
}

class FakeFulfillment implements GoldFulfillmentClient {
  readonly enabled = true;
  readonly calls: GoldFulfillmentRequest[] = [];
  fail = false;

  async fulfill(input: GoldFulfillmentRequest) {
    this.calls.push(input);
    if (this.fail) throw new Error('injected fulfillment failure');
    return { fulfilled: true as const, replayed: this.calls.length > 1, currentGold: String(input.goldAmount + 500) };
  }
}

function fixture() {
  const prisma = new FakePrisma();
  const provider = new MockPaymentProvider();
  const fulfillment = new FakeFulfillment();
  const service = new PaymentsService(prisma as never, provider, fulfillment);
  return { prisma, provider, fulfillment, service };
}

function confirm(service: PaymentsService, orderId: string, paymentKey: string, amountKrw: number) {
  return service.confirm(BOT_UID_A, { orderId, paymentKey, amountKrw });
}

describe('PaymentsService', () => {
  it('creates from priceKrw only and replays an idempotency key without a second order', async () => {
    const f = fixture();
    const key = 'safe_idempotency_key_0001';
    const first = await f.service.createOrder(BOT_UID_A, 1_000, key);
    const second = await f.service.createOrder(BOT_UID_A, 1_000, key);
    expect(first.order).toEqual(expect.objectContaining({
      productId: CUSTOM_GOLD_PRODUCT_ID,
      priceKrw: 1_000,
      goldAmount: 2_000_000,
    }));
    expect(second.replayed).toBe(true);
    expect(f.prisma.orders).toHaveLength(1);
  });

  it('rejects reuse of an idempotency key with a different amount', async () => {
    const f = fixture();
    const key = 'safe_idempotency_key_0014';
    await f.service.createOrder(BOT_UID_A, 1_000, key);
    await expect(f.service.createOrder(BOT_UID_A, 1_100, key)).rejects.toThrow(ConflictException);
    expect(f.prisma.orders).toHaveLength(1);
  });

  it.each([0, 1, 50, 99, 101, 250, 50_100, -100, 1.5, Number.NaN])(
    'rejects an invalid server-side amount: %p',
    async (priceKrw) => {
      const f = fixture();
      await expect(f.service.createOrder(BOT_UID_A, priceKrw, 'safe_idempotency_key_0015'))
        .rejects.toThrow(BadRequestException);
      expect(f.prisma.orders).toHaveLength(0);
    },
  );

  it('fulfills an approved order once and never duplicates gold for an order replay', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 10_000, 'safe_idempotency_key_0002');
    f.provider.approve(created.order.orderId, 10_000, 'provider-payment-1');
    const first = await confirm(f.service, created.order.orderId, 'provider-payment-1', 10_000);
    const second = await confirm(f.service, created.order.orderId, 'provider-payment-1', 10_000);
    expect(first).toEqual(expect.objectContaining({ status: 'completed', goldAmount: 20_000_000 }));
    expect(second).toEqual(first);
    expect(f.fulfillment.calls).toHaveLength(1);
    expect(f.prisma.audits).toEqual(expect.arrayContaining([
      'payment_order_created',
      'payment_approved',
      'gold_fulfillment_started',
      'gold_fulfillment_completed',
    ]));
  });

  it('rejects provider amount mismatch and grants zero gold', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 3_000, 'safe_idempotency_key_0003');
    f.provider.approve(created.order.orderId, 1, 'provider-payment-2');
    await expect(confirm(f.service, created.order.orderId, 'provider-payment-2', 3_000)).rejects.toThrow(ConflictException);
    expect(f.fulfillment.calls).toHaveLength(0);
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.FAILED);
  });

  it('rejects a manipulated callback amount before provider approval and leaves the order pending', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 10_000, 'safe_idempotency_key_0008');
    f.provider.approve(created.order.orderId, 10_000, 'provider-payment-8');
    await expect(confirm(f.service, created.order.orderId, 'provider-payment-8', 1)).rejects.toThrow(ConflictException);
    expect(f.fulfillment.calls).toHaveLength(0);
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.PENDING);
  });

  it('records a sandbox approval as paid while fulfillment is deliberately disabled', async () => {
    const f = fixture();
    const disabledFulfillment: GoldFulfillmentClient = {
      enabled: false,
      fulfill: jest.fn(),
    };
    const service = new PaymentsService(f.prisma as never, f.provider, disabledFulfillment);
    const created = await service.createOrder(BOT_UID_A, 1_000, 'safe_idempotency_key_0009');
    f.provider.approve(created.order.orderId, 1_000, 'provider-payment-9');
    await expect(confirm(service, created.order.orderId, 'provider-payment-9', 1_000))
      .resolves.toEqual(expect.objectContaining({ status: 'paid' }));
    expect(disabledFulfillment.fulfill).not.toHaveBeenCalled();
  });

  it.each([
    [100, 200_000],
    [200, 400_000],
    [500, 1_000_000],
    [1_000, 2_000_000],
    [12_300, 24_600_000],
    [50_000, 100_000_000],
  ])(
    'approves the server-calculated amount for %i KRW without granting gold in Sandbox',
    async (priceKrw, goldAmount) => {
      const f = fixture();
      const disabledFulfillment: GoldFulfillmentClient = { enabled: false, fulfill: jest.fn() };
      const service = new PaymentsService(f.prisma as never, f.provider, disabledFulfillment);
      const created = await service.createOrder(
        BOT_UID_A,
        priceKrw,
        `safe_custom_approval_${priceKrw}`,
      );
      f.provider.approve(created.order.orderId, priceKrw, `provider-${priceKrw}`);
      await expect(confirm(service, created.order.orderId, `provider-${priceKrw}`, priceKrw))
        .resolves.toEqual(expect.objectContaining({
          status: 'paid',
          productId: CUSTOM_GOLD_PRODUCT_ID,
          priceKrw,
          goldAmount,
        }));
      expect(disabledFulfillment.fulfill).not.toHaveBeenCalled();
    },
  );

  it('rejects a changed orderId and an order owned by another account', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 1_000, 'safe_idempotency_key_0011');
    f.provider.approve(created.order.orderId, 1_000, 'provider-payment-11');
    await expect(f.service.confirm(BOT_UID_A, {
      orderId: 'GOLD_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      paymentKey: 'provider-payment-11',
      amountKrw: 1_000,
    })).rejects.toThrow();
    await expect(f.service.confirm(BOT_UID_B, {
      orderId: created.order.orderId,
      paymentKey: 'provider-payment-11',
      amountKrw: 1_000,
    })).rejects.toThrow();
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.PENDING);
    expect(f.fulfillment.calls).toHaveLength(0);
  });

  it('does not approve or grant gold when the provider reports failure', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 3_000, 'safe_idempotency_key_0012');
    f.provider.fail(created.order.orderId, 3_000);
    await expect(confirm(f.service, created.order.orderId, 'provider-payment-12', 3_000))
      .rejects.toThrow(ConflictException);
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.FAILED);
    expect(f.fulfillment.calls).toHaveLength(0);
  });

  it('does not mark a fulfillment failure completed and permits no cross-account history', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 5_000, 'safe_idempotency_key_0004');
    f.provider.approve(created.order.orderId, 5_000, 'provider-payment-3');
    f.fulfillment.fail = true;
    await expect(confirm(f.service, created.order.orderId, 'provider-payment-3', 5_000)).rejects.toThrow('injected');
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.FULFILLING);
    expect((await f.service.history(BOT_UID_B)).items).toHaveLength(0);
    await expect(f.service.getOrder(BOT_UID_B, created.order.orderId)).rejects.toThrow();
    f.fulfillment.fail = false;
    await expect(confirm(f.service, created.order.orderId, 'provider-payment-3', 5_000))
      .resolves.toEqual(expect.objectContaining({ status: 'completed' }));
    expect(f.fulfillment.calls).toHaveLength(2);
  });

  it('blocks a duplicate provider payment key across different orders', async () => {
    const f = fixture();
    const a = await f.service.createOrder(BOT_UID_A, 1_000, 'safe_idempotency_key_0005');
    const b = await f.service.createOrder(BOT_UID_A, 3_000, 'safe_idempotency_key_0006');
    f.provider.approve(a.order.orderId, 1_000, 'same-provider-key');
    f.provider.approve(b.order.orderId, 3_000, 'same-provider-key');
    await confirm(f.service, a.order.orderId, 'same-provider-key', 1_000);
    await expect(confirm(f.service, b.order.orderId, 'same-provider-key', 3_000)).rejects.toThrow(ConflictException);
    expect(f.fulfillment.calls).toHaveLength(1);
  });

  it('refuses order creation while the payment provider is disabled', async () => {
    const f = fixture();
    const disabled = new PaymentsService(f.prisma as never, { ...f.provider, enabled: false } as never, f.fulfillment);
    await expect(disabled.createOrder(BOT_UID_A, 1_000, 'safe_idempotency_key_0007'))
      .rejects.toThrow(ServiceUnavailableException);
  });

  it('reconciles duplicate Toss webhooks through provider lookup without duplicate fulfillment', async () => {
    const f = fixture();
    const tossProvider: PaymentProvider = {
      name: 'toss',
      enabled: true,
      sandbox: true,
      createPayment: f.provider.createPayment.bind(f.provider),
      verifyPayment: f.provider.verifyPayment.bind(f.provider),
      lookupPayment: f.provider.lookupPayment.bind(f.provider),
      cancelPayment: f.provider.cancelPayment.bind(f.provider),
    };
    const service = new PaymentsService(f.prisma as never, tossProvider, f.fulfillment);
    const created = await service.createOrder(BOT_UID_A, 3_000, 'safe_idempotency_key_0010');
    f.provider.approve(created.order.orderId, 3_000, 'provider-payment-10');
    const webhook = {
      eventType: 'PAYMENT_STATUS_CHANGED',
      orderId: created.order.orderId,
      paymentKey: 'provider-payment-10',
      providerStatus: 'DONE',
      transmissionId: 'transmission-safe-0010',
    };
    await expect(service.reconcileTossWebhook(webhook)).resolves.toEqual({ received: true });
    await expect(service.reconcileTossWebhook(webhook)).resolves.toEqual({ received: true });
    expect(f.fulfillment.calls).toHaveLength(1);
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.COMPLETED);
  });

  it('cancels a pending order idempotently without approving or fulfilling it', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 50_000, 'safe_idempotency_key_0013');
    await expect(f.service.cancel(BOT_UID_A, created.order.orderId))
      .resolves.toEqual(expect.objectContaining({ status: 'cancelled' }));
    await expect(f.service.cancel(BOT_UID_A, created.order.orderId))
      .resolves.toEqual(expect.objectContaining({ status: 'cancelled' }));
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.CANCELLED);
    expect(f.fulfillment.calls).toHaveLength(0);
  });
});
