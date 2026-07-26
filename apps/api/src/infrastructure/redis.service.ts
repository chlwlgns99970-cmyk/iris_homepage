import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
@Injectable() export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect:true, maxRetriesPerRequest:1, retryStrategy:()=>null });
  async status(){ try { if(this.client.status === 'wait') await this.client.connect(); return (await this.client.ping()) === 'PONG' ? 'connected' : 'disconnected'; } catch { return 'disconnected'; } }
  async consumeRateLimit(key:string, limit:number, windowSeconds:number){
    if(this.client.status === 'wait') await this.client.connect();
    const count = await this.client.incr(key);
    if(count === 1) await this.client.expire(key, windowSeconds);
    return count <= limit;
  }
  async onModuleDestroy(){ if(this.client.status !== 'end') this.client.disconnect(); }
}
