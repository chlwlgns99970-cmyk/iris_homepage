import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const PHONE_LEASE_DURATION_MS = 2 * 60 * 60 * 1000;
const LEASE_CACHE_MS = 15_000;
let cachedLease: {url: string; secret: string; fetchImpl: typeof fetch; receivedAt: number; lease: PhoneOriginLease} | undefined;
export type PhoneOriginLease = {
  version: 1;
  origin: string;
  issuedAt: string;
  expiresAt: string;
  instanceId: string;
  mac: string;
};

export function relayOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash
    || !/^[a-z0-9]{6,63}(?:\.app)?\.lhr\.life$/.test(url.hostname)) {
    throw new Error('PHONE_ORIGIN_REJECTED');
  }
  return url.origin;
}

function signingKey(key: string) {
  if (key.length < 32) throw new Error('PHONE_LEASE_NOT_CONFIGURED');
  return key;
}

function payload(lease: Omit<PhoneOriginLease, 'mac'>) {
  return JSON.stringify([lease.version, lease.origin, lease.issuedAt, lease.expiresAt, lease.instanceId]);
}

export function createPhoneOriginLease(origin: string, key: string, instanceId: string, now = Date.now()): PhoneOriginLease {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(instanceId)) throw new Error('PHONE_LEASE_INSTANCE_INVALID');
  const record: Omit<PhoneOriginLease, 'mac'> = {
    version: 1, origin: relayOrigin(origin), instanceId,
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + PHONE_LEASE_DURATION_MS).toISOString(),
  };
  return {...record, mac: createHmac('sha256', signingKey(key)).update(payload(record)).digest('hex')};
}

export function verifyPhoneOriginLease(input: unknown, key: string, now = Date.now()): PhoneOriginLease {
  if (!input || typeof input !== 'object') throw new Error('PHONE_LEASE_INVALID');
  const record = input as PhoneOriginLease;
  if (Object.keys(record).sort().join(',') !== 'expiresAt,instanceId,issuedAt,mac,origin,version'
    || record.version !== 1 || typeof record.origin !== 'string' || typeof record.issuedAt !== 'string'
    || typeof record.expiresAt !== 'string' || typeof record.instanceId !== 'string'
    || typeof record.mac !== 'string' || !/^[a-f0-9]{64}$/.test(record.mac)
    || !/^[a-zA-Z0-9-]{16,80}$/.test(record.instanceId)) throw new Error('PHONE_LEASE_INVALID');
  const issued = Date.parse(record.issuedAt), expiry = Date.parse(record.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expiry) || issued > now + 30_000
    || expiry <= now || expiry - issued !== PHONE_LEASE_DURATION_MS) throw new Error('PHONE_LEASE_EXPIRED');
  if (record.origin !== relayOrigin(record.origin)) throw new Error('PHONE_ORIGIN_REJECTED');
  const expected = createHmac('sha256', signingKey(key)).update(payload(record)).digest();
  if (!timingSafeEqual(expected, Buffer.from(record.mac, 'hex'))) throw new Error('PHONE_LEASE_SIGNATURE_INVALID');
  return record;
}

export function createPhoneOriginProof(origin: string, instanceId: string, challenge: string, key: string) {
  if (!/^[a-f0-9]{64}$/.test(challenge) || !/^[a-zA-Z0-9-]{16,80}$/.test(instanceId)) throw new Error('PHONE_PROOF_INVALID');
  const record = {origin:relayOrigin(origin),instanceId,challenge};
  const mac = createHmac('sha256',signingKey(key)).update(JSON.stringify(['iris-web-origin-proof-v1',record.origin,instanceId,challenge])).digest('hex');
  return {...record,mac};
}

export function verifyPhoneOriginProof(value: unknown, lease: PhoneOriginLease, challenge: string, key: string) {
  if (!value || typeof value !== 'object') throw new Error('PHONE_PROOF_INVALID');
  const proof = value as ReturnType<typeof createPhoneOriginProof>;
  if (Object.keys(proof).sort().join(',') !== 'challenge,instanceId,mac,origin'
    || proof.origin !== lease.origin || proof.instanceId !== lease.instanceId || proof.challenge !== challenge
    || typeof proof.mac !== 'string' || !/^[a-f0-9]{64}$/.test(proof.mac)) throw new Error('PHONE_PROOF_INVALID');
  const expected = createPhoneOriginProof(lease.origin,lease.instanceId,challenge,key);
  if (!timingSafeEqual(Buffer.from(expected.mac,'hex'),Buffer.from(proof.mac,'hex'))) throw new Error('PHONE_PROOF_INVALID');
}

export function publicPhonePath(path: string, method: string) {
  const read = path === '/api/auth/me' || path === '/api/portal/dashboard'
    || path === '/api/payments/products'
    || /^\/api\/notices(?:\/[A-Za-z0-9_-]+)?$/.test(path);
  const write = /^\/api\/auth\/device\/(?:start|restart|poll|complete|cancel)$/.test(path)
    || path === '/api/auth/logout';
  return (method === 'GET' && read) || (method === 'POST' && write)
    || (method === 'OPTIONS' && (read || write));
}

async function limitedBody(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal) {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    while (true) {
      if (signal.aborted) throw new Error('PHONE_PROXY_TIMEOUT');
      const {done, value} = await reader.read();
      if (signal.aborted) throw new Error('PHONE_PROXY_TIMEOUT');
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('PHONE_PROXY_TOO_LARGE'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

export async function forwardPhoneRequest(request: Request, path: string, {
  env = process.env, fetchImpl = fetch, now = () => Date.now(), timeoutMs = 6_000,
}: {env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number} = {}) {
  const error = (status: number, code: string, message: string) => Response.json({code, message}, {
    status, headers: {'Cache-Control':'private, no-store', Vary:'Cookie'},
  });
  if (env.PHONE_ORIGIN_LEASE_ENABLED !== 'true' || !publicPhonePath(path, request.method)) {
    return error(404, 'NOT_FOUND', '찾을 수 없습니다.');
  }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  const timings: Record<string, number> = {};
  let stage = 'configuration';
  const cancel = () => controller.abort();
  request.signal.addEventListener('abort', cancel, {once: true});
  if (request.signal.aborted) controller.abort();
  try {
    const leaseUrl = new URL(env.PHONE_ORIGIN_LEASE_URL || '');
    if (leaseUrl.protocol !== 'https:' || leaseUrl.port || leaseUrl.username || leaseUrl.password
      || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(leaseUrl.hostname)
      || leaseUrl.pathname !== '/routing/phone-origin.json' || leaseUrl.search || leaseUrl.hash) {
      throw new Error('PHONE_LEASE_NOT_CONFIGURED');
    }
    stage = 'connection_metadata';
    let started = performance.now();
    const secret = env.PHONE_ORIGIN_LEASE_SECRET || '';
    const cached = cachedLease;
    let lease: PhoneOriginLease;
    if (cached && cached.url === leaseUrl.href && cached.secret === secret && cached.fetchImpl === fetchImpl
      && now() >= cached.receivedAt && now() - cached.receivedAt < LEASE_CACHE_MS) {
      lease = verifyPhoneOriginLease(cached.lease, secret, now());
    } else {
      cachedLease = undefined;
      const metadata = await fetchImpl(leaseUrl, {cache:'no-store', redirect:'error', signal:controller.signal});
      if (!metadata.ok) throw new Error('PHONE_LEASE_UNAVAILABLE');
      const leaseBytes = await limitedBody(metadata.body, 8_192, controller.signal);
      lease = verifyPhoneOriginLease(JSON.parse(leaseBytes.toString('utf8')), secret, now());
      cachedLease = {url:leaseUrl.href, secret, fetchImpl, receivedAt:now(), lease:Object.freeze(lease)};
    }
    timings.lease = performance.now() - started;
    stage = 'request_body';
    const body = await limitedBody(request.body, 16_384, controller.signal);
    // A signed URL alone cannot prove a rotating free hostname still reaches this phone.
    // Check a fresh challenge against this exact relay instance before sending any cookie/body.
    stage = 'phone_identity';
    started = performance.now();
    const challenge = randomBytes(32).toString('hex');
    const proof = await fetchImpl(lease.origin + '/api/connection-proof?challenge=' + challenge, {
      headers:{Accept:'application/json'},cache:'no-store',redirect:'error',signal:controller.signal,
    });
    if (!proof.ok) throw new Error('PHONE_PROOF_UNAVAILABLE');
    verifyPhoneOriginProof(JSON.parse((await limitedBody(proof.body,8192,controller.signal)).toString('utf8')),
      lease,challenge,env.PHONE_ORIGIN_LEASE_SECRET || '');
    timings.proof = performance.now() - started;
    const query = new URL(request.url).search;
    const headers = new Headers({Accept:'application/json'});
    // Never forward arbitrary browser/server credentials or internal API headers.
    for (const name of ['cookie','content-type','origin']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    stage = 'phone_api';
    started = performance.now();
    const upstream = await fetchImpl(lease.origin + path + query, {
      method:request.method, headers, body:body.length ? body : undefined,
      cache:'no-store', redirect:'error', signal:controller.signal,
    });
    const content = await limitedBody(upstream.body, 524_288, controller.signal);
    if (upstream.status !== 204 && !upstream.headers.get('content-type')?.includes('application/json')) {
      throw new Error('PHONE_PROXY_RESPONSE_INVALID');
    }
    timings.api = performance.now() - started;
    const responseHeaders = new Headers({'Cache-Control':'private, no-store, max-age=0', Vary:'Cookie'});
    responseHeaders.set('Server-Timing', Object.entries(timings).map(([name, duration]) => name + ';dur=' + duration.toFixed(1)).join(', '));
    for (const name of ['content-type','retry-after']) {
      const value = upstream.headers.get(name); if (value) responseHeaders.set(name,value);
    }
    for (const value of upstream.headers.getSetCookie()) responseHeaders.append('set-cookie', value);
    return new Response(upstream.status === 204 ? null : content, {status:upstream.status, headers:responseHeaders});
  } catch (caught) {
    if (stage === 'phone_identity' || stage === 'connection_metadata') cachedLease = undefined;
    const code = caught instanceof Error && /^PHONE_[A-Z_]+$/.test(caught.message) ? caught.message : 'PHONE_PROXY_UNAVAILABLE';
    console.warn('phone_portal_unavailable', {stage, code});
    if (stage === 'request_body' && code === 'PHONE_PROXY_TOO_LARGE') {
      return errorResponse(413);
    }
    return error(503, 'PHONE_PORTAL_UNAVAILABLE', '휴대폰 게임 서버 연결을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.');
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', cancel); }
}

function errorResponse(status: number) {
  return Response.json({code:'REQUEST_TOO_LARGE',message:'요청 크기가 너무 큽니다.'}, {
    status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'},
  });
}
