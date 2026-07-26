import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable() export class PrismaService extends PrismaClient implements OnModuleDestroy { async onModuleDestroy(){ await this.$disconnect(); } async status(){ try { await this.$queryRaw`SELECT 1`; return 'connected'; } catch { return 'disconnected'; } } }
