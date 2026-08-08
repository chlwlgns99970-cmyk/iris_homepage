import { BadRequestException } from '@nestjs/common';

export const GOLD_PER_KRW = 2_000;

const productRows = [
  ['GOLD_1000', 1_000],
  ['GOLD_3000', 3_000],
  ['GOLD_5000', 5_000],
  ['GOLD_10000', 10_000],
  ['GOLD_30000', 30_000],
  ['GOLD_50000', 50_000],
] as const;

export type GoldProductId = (typeof productRows)[number][0];

export type GoldProduct = Readonly<{
  id: GoldProductId;
  name: string;
  priceKrw: number;
  goldAmount: number;
}>;

export const GOLD_PRODUCTS: readonly GoldProduct[] = Object.freeze(
  productRows.map(([id, priceKrw]) => Object.freeze({
    id,
    name: `${(priceKrw * GOLD_PER_KRW).toLocaleString('en-US')} 골드`,
    priceKrw,
    goldAmount: priceKrw * GOLD_PER_KRW,
  })),
);

const productsById = new Map(GOLD_PRODUCTS.map((product) => [product.id, product]));

export function getGoldProduct(productId: string) {
  const product = productsById.get(productId as GoldProductId);
  if (!product) {
    throw new BadRequestException({
      code: 'PAYMENT_PRODUCT_INVALID',
      message: '구매할 수 없는 상품입니다.',
    });
  }
  return product;
}
