import { IsIn, IsString } from 'class-validator';
import { GOLD_PRODUCTS, type GoldProductId } from './payment-products';

const productIds = GOLD_PRODUCTS.map((product) => product.id);

export class CreatePaymentOrderDto {
  @IsString()
  @IsIn(productIds)
  productId!: GoldProductId;
}
