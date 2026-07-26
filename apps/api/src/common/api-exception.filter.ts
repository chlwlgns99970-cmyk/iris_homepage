import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function getSafeRequestId(value: unknown) {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
    ? value
    : randomUUID();
}

export function getSafePath(request: Pick<Request, 'path' | 'originalUrl' | 'url'>) {
  if (typeof request.path === 'string' && request.path.startsWith('/')) {
    return request.path;
  }

  const candidate = request.originalUrl ?? request.url;
  if (typeof candidate !== 'string') return '/';
  const pathname = candidate.split(/[?#]/, 1)[0];
  return pathname?.startsWith('/') ? pathname : '/';
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const requestId = getSafeRequestId(request.headers['x-request-id']);
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const details = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const exposed = statusCode < 500 || details.code === 'IRIS_LINK_NOT_CONFIGURED';
    const fallbackMessage = exception instanceof Error ? exception.message : '요청을 처리할 수 없습니다.';
    const message = exposed ? String(details.message ?? fallbackMessage) : '서버 오류가 발생했습니다.';

    if (statusCode >= 500) {
      const exceptionName = exception instanceof Error
        ? exception.name
        : 'UnknownException';
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        JSON.stringify({
          requestId,
          method: request.method,
          path: getSafePath(request),
          statusCode,
          exceptionName,
        }),
        stack,
      );
    }

    response.status(statusCode).json({ statusCode, code: String(details.code ?? (statusCode === 400 ? 'INVALID_INPUT' : 'INTERNAL_ERROR')), message, requestId });
  }
}
