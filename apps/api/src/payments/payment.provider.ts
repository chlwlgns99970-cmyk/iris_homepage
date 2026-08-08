import { ServiceUnavailableException } from '@nestjs/common';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type CreateProviderPayment = {
  orderId: string;
  amountKrw: number;
  orderName: string;
  customerKey: string;
};

export type ConfirmProviderPayment = {
  orderId: string;
  paymentKey: string;
  amountKrw: number;
};

export type CancelProviderPayment = {
  orderId: string;
  paymentKey?: string;
  cancelReason: string;
};

export type ProviderCheckout = {
  kind: 'toss-widget';
  clientKey: string;
  customerKey: string;
};

export type ProviderPayment = {
  status: 'approved' | 'failed' | 'cancelled';
  amountKrw: number;
  paymentKey?: string;
  orderId: string;
  providerStatus: string;
};

export interface PaymentProvider {
  readonly name: string;
  readonly enabled: boolean;
  readonly sandbox: boolean;
  createPayment(input: CreateProviderPayment): Promise<{ checkoutUrl?: string; checkout?: ProviderCheckout }>;
  verifyPayment(input: ConfirmProviderPayment): Promise<ProviderPayment>;
  lookupPayment(orderId: string): Promise<ProviderPayment>;
  cancelPayment(input: CancelProviderPayment): Promise<{ cancelled: boolean }>;
}

export class DisabledPaymentProvider implements PaymentProvider {
  readonly name = 'disabled';
  readonly enabled = false;
  readonly sandbox = false;

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'PAYMENTS_NOT_CONFIGURED',
      message: '실제 결제 시스템을 준비 중입니다.',
    });
  }

  createPayment(): Promise<never> { return Promise.reject(this.unavailable()); }
  verifyPayment(): Promise<never> { return Promise.reject(this.unavailable()); }
  lookupPayment(): Promise<never> { return Promise.reject(this.unavailable()); }
  cancelPayment(): Promise<never> { return Promise.reject(this.unavailable()); }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly enabled = true;
  readonly sandbox = true;
  private readonly payments = new Map<string, ProviderPayment>();

  async createPayment(input: CreateProviderPayment) {
    this.payments.set(input.orderId, {
      status: 'failed',
      amountKrw: input.amountKrw,
      orderId: input.orderId,
      providerStatus: 'READY',
    });
    return { checkoutUrl: undefined };
  }

  approve(orderId: string, amountKrw: number, paymentKey = `mock_${orderId}`) {
    this.payments.set(orderId, {
      status: 'approved',
      amountKrw,
      paymentKey,
      orderId,
      providerStatus: 'DONE',
    });
  }

  fail(orderId: string, amountKrw: number) {
    this.payments.set(orderId, {
      status: 'failed',
      amountKrw,
      orderId,
      providerStatus: 'ABORTED',
    });
  }

  async verifyPayment(input: ConfirmProviderPayment) {
    return this.payments.get(input.orderId) ?? {
      status: 'failed' as const,
      amountKrw: 0,
      orderId: input.orderId,
      providerStatus: 'NOT_FOUND',
    };
  }

  async lookupPayment(orderId: string) {
    return this.payments.get(orderId) ?? {
      status: 'failed' as const,
      amountKrw: 0,
      orderId,
      providerStatus: 'NOT_FOUND',
    };
  }

  async cancelPayment(input: CancelProviderPayment) {
    const current = this.payments.get(input.orderId);
    if (!current || current.status === 'approved') return { cancelled: false };
    this.payments.set(input.orderId, { ...current, status: 'cancelled', providerStatus: 'CANCELED' });
    return { cancelled: true };
  }
}
