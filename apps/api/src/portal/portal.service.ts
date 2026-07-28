import { Injectable, ServiceUnavailableException, NotFoundException, BadGatewayException } from '@nestjs/common';
import { getPortalConfig } from './portal.config';
import { parsePortalDashboard, type PortalDashboard } from './portal.types';

@Injectable()
export class PortalService {
  private readonly config = getPortalConfig();
  private readonly cache = new Map<string, { expiresAt: number; data: PortalDashboard }>();

  async dashboard(botUid: string) {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException({ code: 'PORTAL_DASHBOARD_NOT_CONFIGURED', message: 'RPG 대시보드 연결이 아직 구성되지 않았습니다.' });
    }
    const cached = this.cache.get(botUid);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.url}/internal/portal/dashboard`, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-bot-internal-api-token': this.config.token },
        body: JSON.stringify({ botUid }),
      });
      const length = Number(response.headers.get('content-length') || 0);
      if (length > this.config.maxResponseBytes) throw new Error('response too large');
      const text = await response.text();
      if (Buffer.byteLength(text) > this.config.maxResponseBytes) throw new Error('response too large');
      if (!response.ok) {
        const errorBody = JSON.parse(text || '{}') as { code?: string };
        if (response.status === 404 && errorBody.code === 'PORTAL_USER_NOT_FOUND') {
          throw new NotFoundException({ code: 'PORTAL_USER_NOT_FOUND', message: '연결된 RPG 캐릭터 정보를 찾지 못했습니다.' });
        }
        throw new BadGatewayException({ code: 'PORTAL_PROVIDER_UNAVAILABLE', message: 'RPG 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
      }
      const data = parsePortalDashboard(JSON.parse(text));
      if (data.characters.length > 0) {
        this.cache.set(botUid, { expiresAt: Date.now() + this.config.cacheTtlMs, data });
      } else {
        this.cache.delete(botUid);
      }
      return data;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadGatewayException) throw error;
      throw new BadGatewayException({ code: 'PORTAL_PROVIDER_UNAVAILABLE', message: 'RPG 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    } finally {
      clearTimeout(timer);
    }
  }
}
