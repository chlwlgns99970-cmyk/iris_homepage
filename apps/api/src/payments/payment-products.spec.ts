import { BadRequestException } from '@nestjs/common';
import {
  calculateGoldAmount,
  createGoldPurchase,
  CUSTOM_GOLD_PRODUCT_ID,
  GOLD_PER_KRW,
  isValidStoredGoldOrder,
  MAX_PAYMENT_KRW,
  MIN_PAYMENT_KRW,
  PAYMENT_STEP_KRW,
} from './payment-products';

describe('custom gold payment policy', () => {
  it.each([
    [100, 200_000],
    [200, 400_000],
    [500, 1_000_000],
    [1_000, 2_000_000],
    [12_300, 24_600_000],
    [50_000, 100_000_000],
  ])('calculates %i KRW as %i gold only on the server', (priceKrw, goldAmount) => {
    expect(calculateGoldAmount(priceKrw)).toBe(goldAmount);
    expect(createGoldPurchase(priceKrw)).toEqual({
      id: CUSTOM_GOLD_PRODUCT_ID,
      name: `${goldAmount.toLocaleString('en-US')} 골드`,
      priceKrw,
      goldAmount,
    });
    expect(goldAmount).toBe(priceKrw * GOLD_PER_KRW);
  });

  it.each([0, 1, 50, 99, 101, 250, 50_100, -100, 1.5, '100', 'not-a-number', Number.NaN])(
    'rejects an invalid payment amount: %p',
    (priceKrw) => {
      expect(() => calculateGoldAmount(priceKrw)).toThrow(BadRequestException);
    },
  );

  it('keeps the limits in one server policy', () => {
    expect({ MIN_PAYMENT_KRW, MAX_PAYMENT_KRW, PAYMENT_STEP_KRW, GOLD_PER_KRW }).toEqual({
      MIN_PAYMENT_KRW: 100,
      MAX_PAYMENT_KRW: 50_000,
      PAYMENT_STEP_KRW: 100,
      GOLD_PER_KRW: 2_000,
    });
  });

  it('accepts new custom orders and keeps legacy fixed orders readable', () => {
    expect(isValidStoredGoldOrder({
      productId: CUSTOM_GOLD_PRODUCT_ID,
      priceKrw: 12_300,
      goldAmount: 24_600_000,
    })).toBe(true);
    expect(isValidStoredGoldOrder({
      productId: 'GOLD_1000',
      priceKrw: 1_000,
      goldAmount: 2_000_000,
    })).toBe(true);
    expect(isValidStoredGoldOrder({
      productId: 'GOLD_CUSTOM',
      priceKrw: 100,
      goldAmount: 999_999_999,
    })).toBe(false);
  });
});
