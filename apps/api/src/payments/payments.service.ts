import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentOrderStatus, Prisma, type PaymentOrder } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma.service';
import {
  GOLD_FULFILLMENT,
  type GoldFulfillmentClient,
} from './gold-fulfillment.client';
import {
  createGoldPurchase,
  CUSTOM_GOLD_PRODUCT_ID,
  goldOrderName,
  isValidStoredGoldOrder,
  PAYMENT_POLICY,
  type GoldPurchase,
} from './payment-products';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider';

const ORDER_ID_PATTERN = /^GOLD_[A-F0-9]{32}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

type SafeOrder = {
  orderId: string;
  productId: string;
  productName: string;
  priceKrw: number;
  goldAmount: number;
  status: string;
  currentGold?: string;
  createdAt: string;
  paidAt?: string;
  fulfilledAt?: string;
  cancelledAt?: string;
  refundedAt?: string;
};

export type TossWebhookInput = {
  eventType: string;
  orderId: string;
  paymentKey: string;
  providerStatus: string;
  transmissionId: string;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(GOLD_FULFILLMENT) private readonly fulfillment: GoldFulfillmentClient,
  ) {}

  storefront() {
    return {
      enabled: this.provider.enabled,
      provider: this.provider.enabled ? this.provider.name : 'disabled',
      sandbox: this.provider.sandbox,
      fulfillmentEnabled: this.fulfillment.enabled,
      policy: PAYMENT_POLICY,
    };
  }

  async createOrder(botUid: string, priceKrw: number, idempotencyKey: string) {
    this.assertProviderEnabled();
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException({
        code: 'PAYMENT_IDEMPOTENCY_KEY_INVALID',
        message: '안전한 주문 멱등키가 필요합니다.',
      });
    }
    const purchase = createGoldPurchase(priceKrw);
    const account = await this.account(botUid);
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey, 'utf8').digest('hex');
    const existing = await this.prisma.paymentOrder.findUnique({ where: { idempotencyKeyHash } });
    if (existing) {
      this.assertIdempotentOrder(existing, account.id, purchase);
      return this.replayOrder(existing, account.id);
    }

    const orderId = `GOLD_${randomUUID().replaceAll('-', '').toUpperCase()}`;
    let order: PaymentOrder;
    try {
      order = await this.prisma.paymentOrder.create({
        data: {
          orderId,
          webAccountId: account.id,
          productId: CUSTOM_GOLD_PRODUCT_ID,
          priceKrw: purchase.priceKrw,
          goldAmount: purchase.goldAmount,
          provider: this.provider.name,
          idempotencyKeyHash,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const replay = await this.prisma.paymentOrder.findUnique({ where: { idempotencyKeyHash } });
        if (replay) {
          this.assertIdempotentOrder(replay, account.id, purchase);
          return this.replayOrder(replay, account.id);
        }
      }
      throw error;
    }

    await this.audit('payment_order_created', account.id, order.orderId, {
      productId: CUSTOM_GOLD_PRODUCT_ID,
      priceKrw: purchase.priceKrw,
      goldAmount: purchase.goldAmount,
    });
    try {
      const created = await this.provider.createPayment({
        orderId: order.orderId,
        amountKrw: purchase.priceKrw,
        orderName: purchase.name,
        customerKey: this.customerKey(account.id),
      });
      return {
        order: this.safeOrder(order),
        checkoutUrl: created.checkoutUrl,
        checkout: created.checkout,
        replayed: false,
      };
    } catch (error) {
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: PaymentOrderStatus.FAILED, failureCode: 'provider_create_failed' },
      });
      await this.audit('payment_verification_failed', account.id, order.orderId, { code: 'provider_create_failed' });
      throw error;
    }
  }

  async confirm(
    botUid: string,
    input: { orderId: string; paymentKey: string; amountKrw: number },
  ) {
    this.assertProviderEnabled();
    this.assertOrderId(input.orderId);
    const account = await this.account(botUid);
    let order = await this.ownedOrder(account.id, input.orderId);

    if (input.amountKrw !== order.priceKrw) {
      throw new ConflictException({
        code: 'PAYMENT_CALLBACK_AMOUNT_MISMATCH',
        message: '결제 요청 금액이 서버 주문 금액과 일치하지 않습니다.',
      });
    }
    if (order.status === PaymentOrderStatus.COMPLETED) {
      if (order.providerPaymentKey !== input.paymentKey) {
        throw new ConflictException({ code: 'PAYMENT_KEY_MISMATCH', message: '결제 승인 정보가 주문과 일치하지 않습니다.' });
      }
      return this.safeOrder(order);
    }

    if (!isValidStoredGoldOrder(order)) {
      await this.failOrder(order, account.id, 'order_product_mismatch');
      throw new ConflictException({ code: 'PAYMENT_ORDER_INVALID', message: '주문 정보를 안전하게 확인하지 못했습니다.' });
    }

    if (order.status === PaymentOrderStatus.PENDING) {
      const duplicate = await this.prisma.paymentOrder.findUnique({ where: { providerPaymentKey: input.paymentKey } });
      if (duplicate && duplicate.id !== order.id) {
        throw new ConflictException({ code: 'PAYMENT_ALREADY_USED', message: '이미 처리된 결제 승인입니다.' });
      }

      const verified = await this.provider.verifyPayment({
        orderId: order.orderId,
        paymentKey: input.paymentKey,
        amountKrw: order.priceKrw,
      });
      if (
        verified.status !== 'approved'
        || !verified.paymentKey
        || verified.orderId !== order.orderId
        || verified.paymentKey !== input.paymentKey
      ) {
        await this.failOrder(order, account.id, `provider_${verified.status}`);
        throw new ConflictException({ code: 'PAYMENT_NOT_APPROVED', message: '승인된 결제를 확인하지 못했습니다.' });
      }
      if (verified.amountKrw !== order.priceKrw) {
        await this.failOrder(order, account.id, 'amount_mismatch');
        throw new ConflictException({ code: 'PAYMENT_AMOUNT_MISMATCH', message: '승인 금액이 주문 금액과 일치하지 않습니다.' });
      }
      if (verified.paymentKey.length > 200) {
        await this.failOrder(order, account.id, 'payment_key_invalid');
        throw new ConflictException({ code: 'PAYMENT_VERIFICATION_FAILED', message: '결제 승인 정보를 확인하지 못했습니다.' });
      }
      await this.recordApproved(order, account.id, verified.paymentKey);
      order = await this.ownedOrder(account.id, input.orderId);
    }

    if (order.providerPaymentKey !== input.paymentKey) {
      throw new ConflictException({ code: 'PAYMENT_KEY_MISMATCH', message: '결제 승인 정보가 주문과 일치하지 않습니다.' });
    }
    return this.fulfillApprovedOrder(botUid, account.id, order);
  }

  async reconcileTossWebhook(input: TossWebhookInput) {
    if (!this.provider.enabled || this.provider.name !== 'toss') {
      throw new NotFoundException({ code: 'PAYMENT_WEBHOOK_NOT_FOUND', message: '요청한 경로를 찾을 수 없습니다.' });
    }
    if (
      input.eventType !== 'PAYMENT_STATUS_CHANGED'
      || !ORDER_ID_PATTERN.test(input.orderId)
      || input.paymentKey.length < 1
      || input.paymentKey.length > 200
      || input.providerStatus.length < 1
      || input.providerStatus.length > 40
      || input.transmissionId.length < 1
      || input.transmissionId.length > 200
    ) {
      throw new BadRequestException({ code: 'TOSS_WEBHOOK_INVALID', message: '웹훅 요청 형식이 올바르지 않습니다.' });
    }

    const stored = await this.prisma.paymentOrder.findUnique({
      where: { orderId: input.orderId },
      include: { webAccount: { select: { botUid: true } } },
    });
    if (!stored || stored.provider !== 'toss') return { received: true };
    if (!isValidStoredGoldOrder(stored)) {
      throw new ConflictException({ code: 'PAYMENT_ORDER_INVALID', message: '주문 정보를 안전하게 확인하지 못했습니다.' });
    }

    const verified = await this.provider.lookupPayment(stored.orderId);
    if (
      verified.orderId !== stored.orderId
      || verified.paymentKey !== input.paymentKey
      || verified.amountKrw !== stored.priceKrw
    ) {
      throw new ConflictException({ code: 'TOSS_WEBHOOK_MISMATCH', message: '웹훅 결제 정보가 서버 주문과 일치하지 않습니다.' });
    }

    let order: PaymentOrder = stored;
    if (verified.status === 'approved' && order.status === PaymentOrderStatus.PENDING) {
      await this.recordApproved(order, stored.webAccountId, verified.paymentKey!);
      order = await this.ownedOrder(stored.webAccountId, stored.orderId);
    }

    if (
      verified.status === 'cancelled'
      && (order.status === PaymentOrderStatus.PENDING || order.status === PaymentOrderStatus.PAID)
    ) {
      await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: PaymentOrderStatus.CANCELLED, cancelledAt: new Date(), failureCode: null },
      });
    } else if (verified.status === 'failed' && order.status === PaymentOrderStatus.PENDING) {
      await this.failOrder(order, stored.webAccountId, `toss_${verified.providerStatus.toLowerCase()}`);
    } else if (verified.status === 'approved') {
      await this.fulfillApprovedOrder(stored.webAccount.botUid, stored.webAccountId, order);
    }

    await this.audit('payment_webhook_reconciled', stored.webAccountId, stored.orderId, {
      providerStatus: verified.providerStatus,
      transmissionRef: createHash('sha256').update(input.transmissionId).digest('hex').slice(0, 16),
    });
    return { received: true };
  }

  async cancel(botUid: string, orderId: string) {
    this.assertProviderEnabled();
    this.assertOrderId(orderId);
    const account = await this.account(botUid);
    const order = await this.ownedOrder(account.id, orderId);
    if (order.status === PaymentOrderStatus.CANCELLED) return this.safeOrder(order);
    if (order.status !== PaymentOrderStatus.PENDING) {
      throw new ConflictException({ code: 'PAYMENT_CANNOT_CANCEL', message: '취소할 수 없는 주문 상태입니다.' });
    }

    if (this.provider.name === 'mock' || order.providerPaymentKey) {
      const cancelled = await this.provider.cancelPayment({
        orderId: order.orderId,
        paymentKey: order.providerPaymentKey ?? undefined,
        cancelReason: '사용자 결제 요청 취소',
      });
      if (!cancelled.cancelled) {
        throw new ConflictException({ code: 'PAYMENT_CANNOT_CANCEL', message: '결제를 취소하지 못했습니다.' });
      }
    }

    const updated = await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: PaymentOrderStatus.CANCELLED, cancelledAt: new Date(), failureCode: null },
    });
    await this.audit('payment_cancelled', account.id, order.orderId, {});
    return this.safeOrder(updated);
  }

  async history(botUid: string) {
    const account = await this.account(botUid);
    const orders = await this.prisma.paymentOrder.findMany({
      where: { webAccountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: orders.map((order) => this.safeOrder(order)) };
  }

  async getOrder(botUid: string, orderId: string) {
    this.assertOrderId(orderId);
    const account = await this.account(botUid);
    return this.safeOrder(await this.ownedOrder(account.id, orderId));
  }

  private async replayOrder(order: PaymentOrder, webAccountId: string) {
    if (order.status !== PaymentOrderStatus.PENDING) {
      return { order: this.safeOrder(order), checkoutUrl: undefined, checkout: undefined, replayed: true };
    }
    if (!isValidStoredGoldOrder(order)) {
      throw new ConflictException({ code: 'PAYMENT_ORDER_INVALID', message: '주문 정보를 안전하게 확인하지 못했습니다.' });
    }
    const created = await this.provider.createPayment({
      orderId: order.orderId,
      amountKrw: order.priceKrw,
      orderName: goldOrderName(order.goldAmount),
      customerKey: this.customerKey(webAccountId),
    });
    return {
      order: this.safeOrder(order),
      checkoutUrl: created.checkoutUrl,
      checkout: created.checkout,
      replayed: true,
    };
  }

  private async recordApproved(order: PaymentOrder, webAccountId: string, paymentKey: string) {
    try {
      const transition = await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: PaymentOrderStatus.PENDING },
        data: {
          status: PaymentOrderStatus.PAID,
          providerPaymentKey: paymentKey,
          paidAt: new Date(),
          failureCode: null,
        },
      });
      if (transition.count > 0) {
        await this.audit('payment_approved', webAccountId, order.orderId, {
          productId: order.productId,
          priceKrw: order.priceKrw,
        });
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'PAYMENT_ALREADY_USED', message: '이미 처리된 결제 승인입니다.' });
      }
      throw error;
    }
  }

  private async fulfillApprovedOrder(botUid: string, webAccountId: string, initialOrder: PaymentOrder) {
    let order = initialOrder;
    if (!isValidStoredGoldOrder(order)) {
      throw new ConflictException({ code: 'PAYMENT_ORDER_INVALID', message: '주문 정보를 안전하게 확인하지 못했습니다.' });
    }
    if (order.status === PaymentOrderStatus.COMPLETED) return this.safeOrder(order);
    if (order.status === PaymentOrderStatus.PAID && !this.fulfillment.enabled) return this.safeOrder(order);

    if (order.status === PaymentOrderStatus.PAID) {
      const transition = await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: PaymentOrderStatus.PAID },
        data: { status: PaymentOrderStatus.FULFILLING, fulfillmentStartedAt: new Date(), failureCode: null },
      });
      if (transition.count > 0) {
        await this.audit('gold_fulfillment_started', webAccountId, order.orderId, {
          productId: order.productId,
          goldAmount: order.goldAmount,
        });
      }
      order = await this.ownedOrder(webAccountId, order.orderId);
    }

    if (order.status === PaymentOrderStatus.COMPLETED) return this.safeOrder(order);
    if (order.status !== PaymentOrderStatus.FULFILLING) {
      throw new ConflictException({ code: 'PAYMENT_ORDER_NOT_FULFILLABLE', message: '지급할 수 없는 주문 상태입니다.' });
    }

    try {
      const result = await this.fulfillment.fulfill({
        orderId: order.orderId,
        botUid,
        productId: order.productId,
        goldAmount: order.goldAmount,
      });
      const currentGold = BigInt(result.currentGold);
      await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: PaymentOrderStatus.FULFILLING },
        data: {
          status: PaymentOrderStatus.COMPLETED,
          goldBalanceAfter: currentGold,
          fulfilledAt: new Date(),
          failureCode: null,
        },
      });
      await this.audit('gold_fulfillment_completed', webAccountId, order.orderId, {
        productId: order.productId,
        goldAmount: order.goldAmount,
        replayed: result.replayed,
      });
      return this.safeOrder(await this.ownedOrder(webAccountId, order.orderId));
    } catch (error) {
      await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: PaymentOrderStatus.FULFILLING },
        data: { failureCode: 'gold_fulfillment_failed' },
      });
      await this.audit('gold_fulfillment_failed', webAccountId, order.orderId, { code: 'gold_fulfillment_failed' });
      throw error;
    }
  }

  private assertProviderEnabled() {
    if (!this.provider.enabled) {
      throw new ServiceUnavailableException({
        code: 'PAYMENTS_NOT_CONFIGURED',
        message: '실제 결제 시스템을 준비 중입니다.',
      });
    }
  }

  private assertOrderId(orderId: string) {
    if (!ORDER_ID_PATTERN.test(orderId)) {
      throw new NotFoundException({ code: 'PAYMENT_ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' });
    }
  }

  private async account(botUid: string) {
    const account = await this.prisma.webAccount.findUnique({ where: { botUid }, select: { id: true } });
    if (!account) throw new NotFoundException({ code: 'PAYMENT_ACCOUNT_NOT_FOUND', message: '로그인 계정을 찾을 수 없습니다.' });
    return account;
  }

  private async ownedOrder(webAccountId: string, orderId: string) {
    const order = await this.prisma.paymentOrder.findFirst({ where: { orderId, webAccountId } });
    if (!order) throw new NotFoundException({ code: 'PAYMENT_ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' });
    return order;
  }

  private async failOrder(order: PaymentOrder, webAccountId: string, code: string) {
    await this.prisma.paymentOrder.updateMany({
      where: { id: order.id, status: PaymentOrderStatus.PENDING },
      data: { status: PaymentOrderStatus.FAILED, failureCode: code },
    });
    await this.audit('payment_verification_failed', webAccountId, order.orderId, { code });
  }

  private customerKey(webAccountId: string) {
    return `customer_${createHash('sha256').update(webAccountId, 'utf8').digest('hex').slice(0, 32)}`;
  }

  private assertIdempotentOrder(order: PaymentOrder, webAccountId: string, purchase: GoldPurchase) {
    if (
      order.webAccountId !== webAccountId
      || order.priceKrw !== purchase.priceKrw
      || order.goldAmount !== purchase.goldAmount
      || !isValidStoredGoldOrder(order)
    ) {
      throw new ConflictException({ code: 'PAYMENT_IDEMPOTENCY_CONFLICT', message: '주문을 생성할 수 없습니다.' });
    }
  }

  private safeOrder(order: PaymentOrder): SafeOrder {
    return {
      orderId: order.orderId,
      productId: order.productId,
      productName: goldOrderName(order.goldAmount),
      priceKrw: order.priceKrw,
      goldAmount: order.goldAmount,
      status: order.status.toLowerCase(),
      ...(order.goldBalanceAfter === null ? {} : { currentGold: order.goldBalanceAfter.toString() }),
      createdAt: order.createdAt.toISOString(),
      ...(order.paidAt ? { paidAt: order.paidAt.toISOString() } : {}),
      ...(order.fulfilledAt ? { fulfilledAt: order.fulfilledAt.toISOString() } : {}),
      ...(order.cancelledAt ? { cancelledAt: order.cancelledAt.toISOString() } : {}),
      ...(order.refundedAt ? { refundedAt: order.refundedAt.toISOString() } : {}),
    };
  }

  private async audit(action: string, actorId: string, targetId: string, metadata: Record<string, unknown>) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: 'web_account',
          actorId,
          action,
          targetType: 'payment_order',
          targetId,
          metadata: metadata as Prisma.InputJsonObject,
        },
      });
      this.logger.log(action);
    } catch {
      this.logger.error('payment_audit_log_failed', { action });
    }
  }
}
