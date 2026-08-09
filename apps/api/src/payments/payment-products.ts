import { BadRequestException } from '@nestjs/common';

export const MIN_PAYMENT_KRW = 100;
export const MAX_PAYMENT_KRW = 50_000;
export const PAYMENT_STEP_KRW = 100;
export const GOLD_PER_KRW = 2_000;
export const CUSTOM_GOLD_PRODUCT_ID = 'GOLD_CUSTOM';

const legacyProductIds = new Set([
  'GOLD_1000',
  'GOLD_3000',
  'GOLD_5000',
  'GOLD_10000',
  'GOLD_30000',
  'GOLD_50000',
]);

export const PAYMENT_POLICY = Object.freeze({
  minPaymentKrw: MIN_PAYMENT_KRW,
  maxPaymentKrw: MAX_PAYMENT_KRW,
  paymentStepKrw: PAYMENT_STEP_KRW,
  goldPerKrw: GOLD_PER_KRW,
});

export type GoldPurchase = Readonly<{
  id: typeof CUSTOM_GOLD_PRODUCT_ID;
  name: string;
  priceKrw: number;
  goldAmount: number;
}>;

function invalidPrice(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

export function validatePaymentPrice(priceKrw: unknown): asserts priceKrw is number {
  if (typeof priceKrw !== 'number' || !Number.isSafeInteger(priceKrw)) {
    invalidPrice('PAYMENT_PRICE_INTEGER_REQUIRED', '결제 금액은 정수로 입력해 주세요.');
  }
  if (priceKrw < MIN_PAYMENT_KRW) {
    invalidPrice('PAYMENT_PRICE_BELOW_MINIMUM', `최소 결제 금액은 ${MIN_PAYMENT_KRW}원입니다.`);
  }
  if (priceKrw > MAX_PAYMENT_KRW) {
    invalidPrice('PAYMENT_PRICE_ABOVE_MAXIMUM', `최대 결제 금액은 ${MAX_PAYMENT_KRW.toLocaleString('en-US')}원입니다.`);
  }
  if (priceKrw % PAYMENT_STEP_KRW !== 0) {
    invalidPrice('PAYMENT_PRICE_STEP_INVALID', `결제 금액은 ${PAYMENT_STEP_KRW}원 단위로 입력해 주세요.`);
  }
}

export function calculateGoldAmount(priceKrw: unknown) {
  validatePaymentPrice(priceKrw);
  return priceKrw * GOLD_PER_KRW;
}

export function createGoldPurchase(priceKrw: unknown): GoldPurchase {
  validatePaymentPrice(priceKrw);
  const goldAmount = priceKrw * GOLD_PER_KRW;
  return Object.freeze({
    id: CUSTOM_GOLD_PRODUCT_ID,
    name: `${goldAmount.toLocaleString('en-US')} 골드`,
    priceKrw,
    goldAmount,
  });
}

export function isValidStoredGoldOrder(input: {
  productId: string;
  priceKrw: unknown;
  goldAmount: unknown;
}) {
  try {
    const expectedGold = calculateGoldAmount(input.priceKrw);
    const supportedProductId = input.productId === CUSTOM_GOLD_PRODUCT_ID
      || (legacyProductIds.has(input.productId) && input.productId === `GOLD_${input.priceKrw}`);
    return supportedProductId && input.goldAmount === expectedGold;
  } catch {
    return false;
  }
}

export function goldOrderName(goldAmount: number) {
  return `${goldAmount.toLocaleString('en-US')} 골드`;
}
