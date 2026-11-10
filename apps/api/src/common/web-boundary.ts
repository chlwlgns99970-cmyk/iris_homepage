import type { RequestHandler } from 'express';
import { getAllowedOrigins } from './cors';

// The public HTTPS proxy must forward only /api/ paths; /internal/ is local-only.
export function webBoundary(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  const origins = new Set(getAllowedOrigins(env.NODE_ENV, env.CORS_ORIGINS));
  const publicOnly = env.API_PUBLIC_WEB_ONLY === 'true';
  return (request, response, next) => {
    const path = request.path;
    if (publicOnly && !path.startsWith('/api/')) {
      const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '');
      const forwarded = ['forwarded','x-forwarded-for','x-real-ip','cf-connecting-ip'].some(name=>request.headers[name] !== undefined);
      const internalApproval = path === '/internal/auth/device/approve' && request.method === 'POST';
      const localHealth = path === '/health' && request.method === 'GET';
      // Express routes are case-insensitive by default: reject every unlisted spelling here.
      if (!local || forwarded || (!internalApproval && !localHealth)) {
        response.status(404).json({code:'NOT_FOUND',message:'찾을 수 없습니다.'});return;
      }
    }
    if (publicOnly && path.startsWith('/api/')) {
      const readPath = (
        path === '/api/auth/me' || path === '/api/portal/dashboard'
        || /^\/api\/notices(?:\/[A-Za-z0-9_-]+)?$/.test(path)
        || path === '/api/payments/products'
      );
      const authWritePath = (
        /^\/api\/auth\/device\/(?:start|restart|poll|complete|cancel)$/.test(path)
        || path === '/api/auth/logout'
      );
      const allowed = (request.method === 'GET' && readPath)
        || (request.method === 'POST' && authWritePath)
        || (request.method === 'OPTIONS' && (readPath || authWritePath));
      if (!allowed) { response.status(404).json({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' }); return; }
    }
    if (request.method === 'POST' && path.startsWith('/api/auth/')) {
      const origin = request.headers.origin;
      if ((origin && !origins.has(origin)) || (!origin && env.NODE_ENV === 'production')) {
        response.status(403).json({ code: 'WEB_ORIGIN_REJECTED', message: '허용되지 않은 요청 출처입니다.' }); return;
      }
    }
    next();
  };
}
