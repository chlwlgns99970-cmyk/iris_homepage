const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

function validateApiBase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL은 공백만 입력할 수 없습니다.');
  }
  if (trimmed.startsWith('//')) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL에 protocol-relative URL을 사용할 수 없습니다.');
  }
  if (trimmed.startsWith('/')) {
    return trimmed.replace(/\/+$/, '');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('NEXT_PUBLIC_API_BASE_URL이 유효한 URL이 아닙니다.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL에는 안전한 http(s) URL만 사용할 수 있습니다.');
  }
  return trimmed.replace(/\/+$/, '');
}

export function resolveApiBase(
  nodeEnv = process.env.NODE_ENV,
  configuredBase = configuredApiBase,
) {
  if (configuredBase === '') {
    return nodeEnv === 'production' ? '' : 'http://localhost:3001';
  }
  if (configuredBase !== undefined) return validateApiBase(configuredBase);
  return nodeEnv === 'production' ? '' : 'http://localhost:3001';
}

export const API_BASE = resolveApiBase();

export type NoticeSummary = {
  id: string;
  type: string;
  title: string;
  summary: string;
  publishedAt: string | null;
};

export type Notice = NoticeSummary & { content: string };

export type ApiErrorBody = {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  requestId?: string;
};

export type DeviceStartResponse = {
  requestId: string;
  userCode: string;
  deviceSecret: string;
  expiresAt: string;
};

export type DevicePollResponse =
  | { status: 'pending' }
  | { status: 'approved'; botUid: string }
  | { status: 'expired' | 'cancelled' | 'consumed' };

export type PortalMetric = [label: string, value: string, detail?: string];

export type PortalContent =
  | { type: 'progress'; title: string; rows: [label: string, percent: number, detail?: string][] }
  | { type: 'items'; title: string; rows: [icon: string, label: string, value: string][] }
  | { type: 'table'; title: string; headers: string[]; rows: string[][] };

export type PortalSystem = {
  id: string;
  icon: string;
  title: string;
  command: string;
  description: string;
  metrics: PortalMetric[];
  content: PortalContent;
  rankings?: PortalRankings;
};

export type PortalRankingRow = {
  rank: number;
  nickname: string;
  job: string;
  value: string;
  current: boolean;
};

export type PortalRankingCategory = {
  id: 'power' | 'level' | 'exp' | 'gold' | 'tower' | 'raid' | 'warrior' | 'archer' | 'mage';
  label: string;
  rows: PortalRankingRow[];
};

export type PortalHallOfFameRow = {
  id: string;
  title: string;
  nickname: string;
  job: string;
  value: string;
  achievedAt?: string;
};

export type PortalRankings = {
  categories: PortalRankingCategory[];
  overall?: {
    combatPower: PortalRankingRow[];
    level: PortalRankingRow[];
    exp: PortalRankingRow[];
    gold: PortalRankingRow[];
    tower: PortalRankingRow[];
    raid: PortalRankingRow[];
  };
  byJob?: {
    warrior: PortalRankingRow[];
    archer: PortalRankingRow[];
    mage: PortalRankingRow[];
  };
  hallOfFame?: PortalHallOfFameRow[];
};

export type PortalCharacter = {
  id: string;
  job: 'warrior' | 'archer' | 'mage';
  gender: 'male' | 'female' | 'unknown';
  current?: boolean;
  name?: string;
  level?: string;
  power?: string;
  weapon?: string;
  title?: string;
  rebirth?: string;
  tower?: string;
  raid?: string;
};

export type PortalArtwork = {
  id: 'premium' | 'rebirth' | 'level100' | 'palace';
  title?: string;
  acquiredAt?: string;
  owned: boolean;
};

export type PortalDashboard = {
  meta: { version: number; generatedAt: string };
  systems: PortalSystem[];
  characters?: PortalCharacter[];
  artworks?: PortalArtwork[];
  summary?: PortalMetric[];
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(statusCode: number, body: ApiErrorBody) {
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message ?? '요청을 처리하지 못했습니다.';
    super(message);
    this.name = 'ApiError';
    this.statusCode = body.statusCode ?? statusCode;
    this.code = body.code ?? 'API_ERROR';
    this.requestId = body.requestId;
  }
}

export function buildRequestInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return {
    ...init,
    cache: 'no-store',
    credentials: 'include',
    headers,
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, buildRequestInit(init));
  if (!response.ok) {
    const body = await response.json().catch((): ApiErrorBody => ({
      message: '요청을 처리하지 못했습니다.',
    }));
    throw new ApiError(response.status, body as ApiErrorBody);
  }
  return response.json() as Promise<T>;
}

export const getNotices = () =>
  api<{ items: NoticeSummary[] }>('/api/notices?limit=10');

export const getNotice = (id: string) =>
  api<Notice>(`/api/notices/${encodeURIComponent(id)}`);

export const getRanking = (type: string) =>
  api<unknown>(`/api/rankings?type=${encodeURIComponent(type)}`);

export const linkAccount = (uid: string, code: string) =>
  api('/api/auth/link/consume', {
    method: 'POST',
    body: JSON.stringify({ uid, code }),
  });

export const startDeviceAuth = () =>
  api<DeviceStartResponse>('/api/auth/device/start', { method: 'POST' });

export const pollDeviceAuth = (requestId: string, deviceSecret: string) =>
  api<DevicePollResponse>('/api/auth/device/poll', {
    method: 'POST',
    body: JSON.stringify({ requestId, deviceSecret }),
  });

export const completeDeviceAuth = (requestId: string, deviceSecret: string) =>
  api<{ authenticated: true; botUid: string }>('/api/auth/device/complete', {
    method: 'POST',
    body: JSON.stringify({ requestId, deviceSecret }),
  });

export const cancelDeviceAuth = (requestId: string, deviceSecret: string) =>
  api<{ status: string }>('/api/auth/device/cancel', {
    method: 'POST',
    body: JSON.stringify({ requestId, deviceSecret }),
  });

export const getCurrentAuth = () =>
  api<{ authenticated: false } | { authenticated: true; botUid: string }>('/api/auth/me');

export const logout = () =>
  api<{ success: true }>('/api/auth/logout', { method: 'POST' });

export const getPortalDashboard = () =>
  api<PortalDashboard>('/api/portal/dashboard');
