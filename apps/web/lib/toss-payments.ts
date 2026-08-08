'use client';

const TOSS_SDK_URL = 'https://js.tosspayments.com/v2/standard';
let sdkPromise: Promise<TossPaymentsFactory> | null = null;

type TossPaymentWindow = {
  on(event: 'paymentRequest', callback: () => void | Promise<void>): void;
};

type TossWidgets = {
  setAmount(input: { currency: 'KRW'; value: number }): Promise<void>;
  renderPaymentWindow(): Promise<TossPaymentWindow>;
  requestPayment(input: {
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
  }): Promise<void>;
};

type TossPaymentsFactory = (clientKey: string) => {
  widgets(input: { customerKey: string }): TossWidgets;
};

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

function loadTossPayments() {
  if (typeof window === 'undefined') return Promise.reject(new Error('결제창은 브라우저에서만 열 수 있습니다.'));
  if (window.TossPayments) return Promise.resolve(window.TossPayments);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<TossPaymentsFactory>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TOSS_SDK_URL}"]`);
    const script = existing ?? document.createElement('script');
    const timeout = window.setTimeout(() => reject(new Error('토스 결제창을 불러오지 못했습니다.')), 10_000);
    const finish = () => {
      window.clearTimeout(timeout);
      if (window.TossPayments) resolve(window.TossPayments);
      else reject(new Error('토스 결제창을 안전하게 초기화하지 못했습니다.'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      reject(new Error('토스 결제창을 불러오지 못했습니다.'));
    }, { once: true });
    if (!existing) {
      script.src = TOSS_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

export async function openTossPaymentWindow(input: {
  clientKey: string;
  customerKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  successUrl: string;
  failUrl: string;
}) {
  if (!input.clientKey.startsWith('test_gck_')) throw new Error('Sandbox 결제 공개키가 올바르지 않습니다.');
  if (!/^customer_[a-f0-9]{32}$/.test(input.customerKey)) throw new Error('결제 고객 식별자가 올바르지 않습니다.');
  if (!/^GOLD_[A-F0-9]{32}$/.test(input.orderId)) throw new Error('결제 주문번호가 올바르지 않습니다.');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('결제 금액이 올바르지 않습니다.');

  const TossPayments = await loadTossPayments();
  const widgets = TossPayments(input.clientKey).widgets({ customerKey: input.customerKey });
  await widgets.setAmount({ currency: 'KRW', value: input.amount });
  const paymentWindow = await widgets.renderPaymentWindow();
  let requested = false;
  paymentWindow.on('paymentRequest', async () => {
    if (requested) return;
    requested = true;
    await widgets.requestPayment({
      orderId: input.orderId,
      orderName: input.orderName,
      successUrl: input.successUrl,
      failUrl: input.failUrl,
    });
  });
}
