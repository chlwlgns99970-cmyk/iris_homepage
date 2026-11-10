import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { buildCorsOptions } from './common/cors';
import { getApiServerConfig } from './common/server-config';
import { webBoundary } from './common/web-boundary';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '16kb' }));
  app.use(urlencoded({ extended: false, limit: '16kb' }));
  app.use(helmet());
  app.use(webBoundary());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors(buildCorsOptions());
  const express = app.getHttpAdapter().getInstance();
  express.set('json spaces', process.env.NODE_ENV === 'development' ? 2 : 0);
  const { host, port } = getApiServerConfig();
  app.enableShutdownHooks();
  await app.listen(port, host);
}
void bootstrap();
