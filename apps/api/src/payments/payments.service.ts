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
import { getGoldProduct, GOLD_PRODUCTS, type GoldProductId } from './payment-products';
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
      enabled: this.provider.enabled && this.fulfillment.enabled,
      provider: this.provider.enabled ? this.provider.name : 'disabled',
      rate: { krw: 1, gold: 2_000 },
      products: GOLD_PRODUCTS,
    };
  }

  async createOrder(botUid: string, productId: GoldProductId, idempotencyKey: string) {
    this.assertEnabled();
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException({
        code: 'PAYMENT_IDEMPOTENCY_KEY_INVALID',
        message: '안전한 주문 식별값이 필요합니다.',
      });
    }
    const product = getGoldProduct(productId);
    const account = await this.account(botUid);
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey, 'utf8').digest('hex');
    const existing = await this.prisma.paymentOrder.findUnique({ where: { idempotencyKeyHash } });
    if (existing) {
      if (existing.webAccountId !== account.id) {
        throw new ConflictException({ code: 'PAYMENT_IDEMPOTENCY_CONFLICT', message: '주문을 생성할 수 없습니다.' });
      }
      return { order: this.safeOrder(existing), checkoutUrl: undefined, replayed: true };
    }

    const orderId = `GOLD_${randomUUID().replaceAll('-', '').toUpperCase()}`;
    let order: PaymentOrder;
    try {
      order = await this.prisma.paymentOrder.create({
        data: {
          orderId,
          webAccountId: account.id,
          productId: product.id,
          priceKrw: product.priceKrw,
          goldAmount: product.goldAmount,
          provider: this.provider.name,
          idempotencyKeyHash,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const replay = await this.prisma.paymentOrder.findUnique({ where: { idempotencyKeyHash } });
        if (replay?.webAccountId === account.id) {
          return { order: this.safeOrder(replay), checkoutUrl: undefined, replayed: true };
        }
      }
      throw error;
    }
    await this.audit('payment_order_created', account.id, order.orderId, {
      productId: product.id,
      priceKrw: product.priceKrw,
      goldAmount: product.goldAmount,
    });
    try {
      const created = await this.provider.createPayment({
        orderId: order.orderId,
        amountKrw: product.priceKrw,
        orderName: product.name,
      });
      return { order: this.safeOrder(order), checkoutUrl: created.checkoutUrl, replayed: false };
    } catch (error) {
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: PaymentOrderStatus.FAILED, failureCode: 'provider_create_failed' },
      });
      await this.audit('payment_verification_failed', account.id, order.orderId, { code: 'provider_create_failed' });
      throw error;
    }
  }

  async confirm(botUid: string, orderId: string) {
    this.assertEnabled();
    this.assertOrderId(orderId);
    const account = await this.account(botUid);
    let order = await this.ownedOrder(account.id, orderId);
    if (order.status === PaymentOrderStatus.COMPLETED) return this.safeOrder(order);

    const product = getGoldProduct(order.productId);
    if (order.priceKrw !== product.priceKrw || order.goldAmount !== product.goldAmount) {
      await this.failOrder(order, account.id, 'order_product_mismatch');
      throw new ConflictException({ code: 'PAYMENT_ORDER_INVALID', message: '주문 정보를 안전하게 확인할 수 없습니다.' });
    }

    if (order.status === PaymentOrderStatus.PENDING) {
      const verified = await this.provider.verifyPayment(order.orderId);
      if (verified.status !== 'approved' || !verified.paymentKey) {
        await this.failOrder(order, account.id, `provider_${verified.status}`);
        throw new ConflictException({ code: 'PAYMENT_NOT_APPROVED', message: '승인된 결제를 확인할 수 없습니다.' });
      }
      if (verified.amountKrw !== order.priceKrw) {
        await this.failOrder(order, account.id, 'amount_mismatch');
        throw new ConflictException({ code: 'PAYMENT_AMOUNT_MISMATCH', message: '승인 금액이 주문 금액과 일치하지 않습니다.' });
      }
      if (verified.paymentKey.length > 191) {
        await this.failOrder(order, account.id, 'payment_key_invalid');
        throw new ConflictException({ code: 'PAYMENT_VERIFICATION_FAILED', message: '결제 승인 정보를 확인할 수 없습니다.' });
      }
      try {
        await this.prisma.paymentOrder.updateMany({
          where: { id: order.id, status: PaymentOrderStatus.PENDING },
          data: {
            status: PaymentOrderStatus.PAID,
            providerPaymentKey: verified.paymentKey,
            paidAt: new Date(),
            failureCode: null,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException({ code: 'PAYMENT_ALREADY_USED', message: '이미 처리된 결제 승인입니다.' });
        }
        throw error;
      }
      await this.audit('payment_approved', account.id, order.orderId, {
        productId: order.productId,
        priceKrw: order.priceKrw,
      });
      order = await this.ownedOrder(account.id, orderId);
    }

    if (order.status === PaymentOrderStatus.PAID) {
      await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: PaymentOrderStatus.PAID },
        data: { status: PaymentOrderStatus.FULFILLING, fulfillmentStartedAt: new Date(), failureCode: null },
      });
      await this.audit('gold_fulfillment_started', account.id, order.orderId, {
        productId: order.productId,
        goldAmount: order.goldAmount,
      });
      order = await this.ownedOrder(account.id, orderId);
    }

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
      await this.audit('gold_fulfillment_completed', account.id, order.orderId, {
        productId: order.productId,
        goldAmount: order.goldAmount,
        replayed: result.replayed,
      });
      return this.safeOrder(await this.ownedOrder(account.id, orderId));
    } catch (error) {
      await this.prisma.paymentOrder.updateMany({
        where: { id: order.id, status: PaymentOrderStatus.FULFILLING },
        data: { failureCode: 'gold_fulfillment_failed' },
      });
      await this.audit('gold_fulfillment_failed', account.id, order.orderId, { code: 'gold_fulfillment_failed' });
      throw error;
    }
  }

  async cancel(botUid: string, orderId: string) {
    this.assertEnabled();
    this.assertOrderId(orderId);
    const account = await this.account(botUid);
    const order = await this.ownedOrder(account.id, orderId);
    if (order.status === PaymentOrderStatus.CANCELLED) return this.safeOrder(order);
    if (order.status !== PaymentOrderStatus.PENDING) {
      throw new ConflictException({ code: 'PAYMENT_CANNOT_CANCEL', message: '취소할 수 없는 주문 상태입니다.' });
    }
    const cancelled = await this.provider.cancelPayment(order.orderId);
    if (!cancelled.cancelled) {
      throw new ConflictException({ code: 'PAYMENT_CANNOT_CANCEL', message: '결제를 취소할 수 없습니다.' });
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

  private assertEnabled() {
    if (!this.provider.enabled || !this.fulfillment.enabled) {
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

  private safeOrder(order: PaymentOrder): SafeOrder {
    const product = getGoldProduct(order.productId);
    return {
      orderId: order.orderId,
      productId: order.productId,
      productName: product.name,
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
