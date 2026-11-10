import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // The JS adapter also runs on Android/Bionic without a native Prisma engine.
    super({ adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 10000,
      statement_timeout: 3000,
      query_timeout: 4000,
    }) });
  }
  async onModuleDestroy() { await this.$disconnect(); }
  async status() {
    try { await this.$queryRaw`SELECT 1`; return 'connected'; }
    catch { return 'disconnected'; }
  }
}
