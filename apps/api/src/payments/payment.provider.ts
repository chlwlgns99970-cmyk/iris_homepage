import { ServiceUnavailableException } from '@nestjs/common';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type CreateProviderPayment = {
  orderId: string;
  amountKrw: number;
  orderName: string;
};

export type ProviderPayment = {
  status: 'approved' | 'failed' | 'cancelled';
  amountKrw: number;
  paymentKey?: string;
};

export interface PaymentProvider {
  readonly name: string;
  readonly enabled: boolean;
  createPayment(input: CreateProviderPayment): Promise<{ checkoutUrl?: string }>;
  verifyPayment(orderId: string): Promise<ProviderPayment>;
  cancelPayment(orderId: string): Promise<{ cancelled: boolean }>;
}

export class DisabledPaymentProvider implements PaymentProvider {
  readonly name = 'disabled';
  readonly enabled = false;

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'PAYMENTS_NOT_CONFIGURED',
      message: '실제 결제 시스템을 준비 중입니다.',
    });
  }

  createPayment(): Promise<never> { return Promise.reject(this.unavailable()); }
  verifyPayment(): Promise<never> { return Promise.reject(this.unavailable()); }
  cancelPayment(): Promise<never> { return Promise.reject(this.unavailable()); }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly enabled = true;
  private readonly payments = new Map<string, ProviderPayment>();

  async createPayment(input: CreateProviderPayment) {
    this.payments.set(input.orderId, { status: 'failed', amountKrw: input.amountKrw });
    return { checkoutUrl: undefined };
  }

  approve(orderId: string, amountKrw: number, paymentKey = `mock_${orderId}`) {
    this.payments.set(orderId, { status: 'approved', amountKrw, paymentKey });
  }

  fail(orderId: string, amountKrw: number) {
    this.payments.set(orderId, { status: 'failed', amountKrw });
  }

  async verifyPayment(orderId: string) {
    return this.payments.get(orderId) ?? { status: 'failed' as const, amountKrw: 0 };
  }

  async cancelPayment(orderId: string) {
    const current = this.payments.get(orderId);
    if (!current || current.status === 'approved') return { cancelled: false };
    this.payments.set(orderId, { ...current, status: 'cancelled' });
    return { cancelled: true };
  }
}
