import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GOLD_FULFILLMENT, HttpGoldFulfillmentClient } from './gold-fulfillment.client';
import { getPaymentConfig } from './payment.config';
import {
  DisabledPaymentProvider,
  MockPaymentProvider,
  PAYMENT_PROVIDER,
} from './payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () => {
        const config = getPaymentConfig();
        return config.provider === 'mock' ? new MockPaymentProvider() : new DisabledPaymentProvider();
      },
    },
    {
      provide: GOLD_FULFILLMENT,
      useFactory: () => new HttpGoldFulfillmentClient(getPaymentConfig()),
    },
  ],
})
export class PaymentsModule {}
