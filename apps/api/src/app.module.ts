import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { NoticesModule } from './notices/notices.module';
import { RankingsModule } from './rankings/rankings.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { PortalModule } from './portal/portal.module';
import { PaymentsModule } from './payments/payments.module';

@Module({ imports: [InfrastructureModule, HealthModule, NoticesModule, RankingsModule, AuthModule, AdminModule, PortalModule, PaymentsModule] })
export class AppModule {}
