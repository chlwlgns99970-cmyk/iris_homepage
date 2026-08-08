import { IsIn, IsInt, IsString, Length, Matches, Min } from 'class-validator';
import { GOLD_PRODUCTS, type GoldProductId } from './payment-products';

const productIds = GOLD_PRODUCTS.map((product) => product.id);

export class CreatePaymentOrderDto {
  @IsString()
  @IsIn(productIds)
  productId!: GoldProductId;
}

export class ConfirmPaymentDto {
  @IsString()
  @Matches(/^GOLD_[A-F0-9]{32}$/)
  orderId!: string;

  @IsString()
  @Length(1, 200)
  paymentKey!: string;

  @IsInt()
  @Min(1)
  amount!: number;
}

export class LegacyConfirmPaymentDto {
  @IsString()
  @Length(1, 200)
  paymentKey!: string;

  @IsInt()
  @Min(1)
  amount!: number;
}
