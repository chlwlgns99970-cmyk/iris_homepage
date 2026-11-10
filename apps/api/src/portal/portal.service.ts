import { Injectable, ServiceUnavailableException, NotFoundException, BadGatewayException, BadRequestException } from '@nestjs/common';
import { getPortalConfig } from './portal.config';
import { parsePortalDashboard, type PortalDashboard } from './portal.types';

@Injectable()
export class PortalService {
  private readonly config = getPortalConfig();
  private readonly cache = new Map<string, { expiresAt: number; data: PortalDashboard }>();

  async dashboard(botUid: string, { bypassCache = false, rankingPage = 1 }: { bypassCache?: boolean; rankingPage?: number } = {}) {
    if (!/^(?:\d{8}|P\d{8})$/.test(botUid) || !Number.isSafeInteger(rankingPage) || rankingPage < 1 || rankingPage > 10000000) {
      throw new BadRequestException({ code: 'INVALID_PORTAL_QUERY', message: '조회 값이 올바르지 않습니다.' });
    }
    if (!this.config.enabled) {
      throw new ServiceUnavailableException({ code: 'PORTAL_DASHBOARD_NOT_CONFIGURED', message: 'RPG 대시보드 연결이 아직 구성되지 않았습니다.' });
    }
    const cacheKey = `${botUid}:${rankingPage}`;
    if (bypassCache) this.cache.delete(cacheKey);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.url}/internal/portal/dashboard`, {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          'x-bot-internal-api-token': this.config.token,
        },
        body: JSON.stringify({ botUid, rankingPage }),
      });
      const length = Number(response.headers.get('content-length') || 0);
      if (length > this.config.maxResponseBytes) throw new Error('response too large');
      const text = await response.text();
      if (Buffer.byteLength(text) > this.config.maxResponseBytes) throw new Error('response too large');
      if (!response.ok) {
        const errorBody = JSON.parse(text || '{}') as { code?: string };
        if (response.status === 400 && errorBody.code === 'PORTAL_PAGE_OUT_OF_RANGE') {
          throw new BadRequestException({code:'PORTAL_PAGE_OUT_OF_RANGE',message:'해당 랭킹 페이지가 없습니다.'});
        }
        if (response.status === 404 && errorBody.code === 'PORTAL_USER_NOT_FOUND') {
          throw new NotFoundException({ code: 'PORTAL_USER_NOT_FOUND', message: '연결된 RPG 캐릭터 정보를 찾지 못했습니다.' });
        }
        throw new BadGatewayException({ code: 'PORTAL_PROVIDER_UNAVAILABLE', message: 'RPG 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
      }
      const data = parsePortalDashboard(JSON.parse(text));
      if (data.characters.length > 0) {
        this.cache.set(cacheKey, { expiresAt: Date.now() + this.config.cacheTtlMs, data });
      } else {
        this.cache.delete(cacheKey);
      }
      return data;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadGatewayException || error instanceof BadRequestException) throw error;
      throw new BadGatewayException({ code: 'PORTAL_PROVIDER_UNAVAILABLE', message: 'RPG 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    } finally {
      clearTimeout(timer);
    }
  }
}
