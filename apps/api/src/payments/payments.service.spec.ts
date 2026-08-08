import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentOrderStatus, type PaymentOrder } from '@prisma/client';
import type { GoldFulfillmentClient, GoldFulfillmentRequest } from './gold-fulfillment.client';
import { MockPaymentProvider } from './payment.provider';
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
    findUnique: (args: { where: { idempotencyKeyHash: string } }) => Promise<PaymentOrder | null>;
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
      findUnique: async ({ where }) => (
        this.orders.find((order) => order.idempotencyKeyHash === where.idempotencyKeyHash) ?? null
      ),
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

describe('PaymentsService', () => {
  it('creates from productId only and replays an idempotency key without a second order', async () => {
    const f = fixture();
    const key = 'safe_idempotency_key_0001';
    const first = await f.service.createOrder(BOT_UID_A, 'GOLD_1000', key);
    const second = await f.service.createOrder(BOT_UID_A, 'GOLD_1000', key);
    expect(first.order).toEqual(expect.objectContaining({ priceKrw: 1_000, goldAmount: 2_000_000 }));
    expect(second.replayed).toBe(true);
    expect(f.prisma.orders).toHaveLength(1);
  });

  it('fulfills an approved order once and never duplicates gold for an order replay', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 'GOLD_10000', 'safe_idempotency_key_0002');
    f.provider.approve(created.order.orderId, 10_000, 'provider-payment-1');
    const first = await f.service.confirm(BOT_UID_A, created.order.orderId);
    const second = await f.service.confirm(BOT_UID_A, created.order.orderId);
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
    const created = await f.service.createOrder(BOT_UID_A, 'GOLD_3000', 'safe_idempotency_key_0003');
    f.provider.approve(created.order.orderId, 1, 'provider-payment-2');
    await expect(f.service.confirm(BOT_UID_A, created.order.orderId)).rejects.toThrow(ConflictException);
    expect(f.fulfillment.calls).toHaveLength(0);
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.FAILED);
  });

  it('does not mark a fulfillment failure completed and permits no cross-account history', async () => {
    const f = fixture();
    const created = await f.service.createOrder(BOT_UID_A, 'GOLD_5000', 'safe_idempotency_key_0004');
    f.provider.approve(created.order.orderId, 5_000, 'provider-payment-3');
    f.fulfillment.fail = true;
    await expect(f.service.confirm(BOT_UID_A, created.order.orderId)).rejects.toThrow('injected');
    expect(f.prisma.orders[0].status).toBe(PaymentOrderStatus.FULFILLING);
    expect((await f.service.history(BOT_UID_B)).items).toHaveLength(0);
    await expect(f.service.getOrder(BOT_UID_B, created.order.orderId)).rejects.toThrow();
  });

  it('blocks a duplicate provider payment key across different orders', async () => {
    const f = fixture();
    const a = await f.service.createOrder(BOT_UID_A, 'GOLD_1000', 'safe_idempotency_key_0005');
    const b = await f.service.createOrder(BOT_UID_A, 'GOLD_3000', 'safe_idempotency_key_0006');
    f.provider.approve(a.order.orderId, 1_000, 'same-provider-key');
    f.provider.approve(b.order.orderId, 3_000, 'same-provider-key');
    await f.service.confirm(BOT_UID_A, a.order.orderId);
    await expect(f.service.confirm(BOT_UID_A, b.order.orderId)).rejects.toThrow(ConflictException);
    expect(f.fulfillment.calls).toHaveLength(1);
  });

  it('refuses order creation while real payments or fulfillment are disabled', async () => {
    const f = fixture();
    const disabled = new PaymentsService(f.prisma as never, { ...f.provider, enabled: false } as never, f.fulfillment);
    await expect(disabled.createOrder(BOT_UID_A, 'GOLD_1000', 'safe_idempotency_key_0007'))
      .rejects.toThrow(ServiceUnavailableException);
  });
});
