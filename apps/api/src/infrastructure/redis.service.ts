import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from './prisma.service';
@Injectable() export class RedisService implements OnModuleDestroy {
  readonly store: 'redis' | 'postgres';
  private readonly client: Redis | null;
  constructor(private readonly prisma: PrismaService) {
    const configured = process.env.AUTH_RATE_LIMIT_STORE ?? 'redis';
    if (configured !== 'redis' && configured !== 'postgres') throw new Error('Invalid AUTH_RATE_LIMIT_STORE');
    this.store = configured;
    this.client = configured === 'redis' ? new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect:true, maxRetriesPerRequest:1, connectTimeout:1500, commandTimeout:2000,
      enableOfflineQueue:false, retryStrategy:attempt=>attempt<=10?Math.min(5000,attempt*250):null,
    }) : null;
    this.client?.on('error', () => { new Logger(RedisService.name).warn('web_redis_unavailable'); });
  }
  private connecting: Promise<unknown> | null = null;
  private async connectIfNeeded() {
    if (this.client && (this.client.status === 'wait' || this.client.status === 'end')) {
      if (!this.connecting) this.connecting = this.client.connect().finally(()=>{this.connecting=null;});
      await this.connecting;
    }
  }
  async status() {
    try {
      if (this.store === 'postgres') await this.prisma.$queryRaw`SELECT "key" FROM "web_rate_limits" LIMIT 0`;
      else { await this.connectIfNeeded(); if (await this.client!.ping() !== 'PONG') return 'disconnected'; }
      return 'connected';
    } catch { return 'disconnected'; }
  }
  async consumeRateLimit(key:string, limit:number, windowSeconds:number){
    if (key.length > 160 || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) throw new Error('Invalid rate limit');
    if (this.store === 'postgres') {
      const rows = await this.prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO "web_rate_limits" ("key", "count", "expiresAt")
        VALUES (${key}, 1, CURRENT_TIMESTAMP + ${windowSeconds} * INTERVAL '1 second')
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE WHEN "web_rate_limits"."expiresAt" <= CURRENT_TIMESTAMP THEN 1 ELSE LEAST("web_rate_limits"."count", 2147483646) + 1 END,
          "expiresAt" = CASE WHEN "web_rate_limits"."expiresAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + ${windowSeconds} * INTERVAL '1 second' ELSE "web_rate_limits"."expiresAt" END
        RETURNING "count"`;
      return rows[0].count <= limit;
    }
    await this.connectIfNeeded();
    const count = Number(await this.client!.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n", 1, key, String(windowSeconds)));
    return count <= limit;
  }
  async onModuleDestroy(){ this.client?.disconnect(); }
}
