import { IsDivisibleBy, IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { MAX_PAYMENT_KRW, MIN_PAYMENT_KRW, PAYMENT_STEP_KRW } from './payment-products';

export class CreatePaymentOrderDto {
  @IsInt()
  @Min(MIN_PAYMENT_KRW)
  @Max(MAX_PAYMENT_KRW)
  @IsDivisibleBy(PAYMENT_STEP_KRW)
  priceKrw!: number;
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
