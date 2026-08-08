import { BadRequestException } from '@nestjs/common';
import { GOLD_PER_KRW, GOLD_PRODUCTS, getGoldProduct } from './payment-products';

describe('gold payment products', () => {
  it.each([
    ['GOLD_1000', 1_000, 2_000_000],
    ['GOLD_3000', 3_000, 6_000_000],
    ['GOLD_5000', 5_000, 10_000_000],
    ['GOLD_10000', 10_000, 20_000_000],
    ['GOLD_30000', 30_000, 60_000_000],
    ['GOLD_50000', 50_000, 100_000_000],
  ])('%s is calculated only by the server catalog', (id, priceKrw, goldAmount) => {
    expect(getGoldProduct(id)).toEqual(expect.objectContaining({ id, priceKrw, goldAmount }));
    expect(goldAmount).toBe(priceKrw * GOLD_PER_KRW);
  });

  it('has exactly the six approved products and rejects unknown IDs', () => {
    expect(GOLD_PRODUCTS).toHaveLength(6);
    expect(() => getGoldProduct('GOLD_1')).toThrow(BadRequestException);
  });
});
