import {
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WebAccountStatus, WebLoginRequestStatus } from '@prisma/client';
import type { CookieOptions } from 'express';
import { PrismaService } from '../infrastructure/prisma.service';
import { RedisService } from '../infrastructure/redis.service';
import {
  assertWebAuthEnabled,
  getWebAuthConfig,
  type WebAuthConfig,
} from './auth.config';
import {
  generateSecret,
  generateUserCode,
  hmac,
  safeHashEqual,
  safeSecretEqual,
} from './auth.crypto';
import { fixedWebSessionExpiry } from './auth.time';

const INVALID_CODE = {
  code: 'WEB_AUTH_CODE_INVALID',
  message: '웹 인증코드가 올바르지 않거나 만료되었습니다.',
};

const PENDING_COOKIE_VERSION = 1;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_CODE_PATTERN = /^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/;
const DEVICE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type PendingCredential = {
  v: typeof PENDING_COOKIE_VERSION;
  requestId: string;
  userCode: string;
  deviceSecret: string;
  expiresAt: number;
};

type PublicDeviceRequest = {
  requestId: string;
  userCode: string;
  deviceSecret: string;
  expiresAt: string;
};

@Injectable()
export class AuthService {
  readonly config: WebAuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.config = getWebAuthConfig();
  }

  async enforceRateLimit(scope: string, subject: string, limit: number, windowSeconds: number) {
    assertWebAuthEnabled(this.config);
    const subjectHash = hmac(subject || 'unknown', this.config.tokenHashSecret);
    const allowed = await this.redis.consumeRateLimit(
      `web-auth:${scope}:${subjectHash}`,
      limit,
      windowSeconds,
    );
    if (!allowed) {
      throw new HttpException({
        code: 'WEB_AUTH_RATE_LIMITED',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async start(pendingToken: string | null = null) {
    assertWebAuthEnabled(this.config);
    void this.cleanup().catch(() => undefined);
    if (pendingToken) {
      const resumed = await this.resumePendingRequest(pendingToken);
      if (resumed) return resumed;
    }
    return this.createPendingRequest();
  }

  async restart(pendingToken: string | null = null) {
    assertWebAuthEnabled(this.config);
    const credential = pendingToken ? this.parsePendingToken(pendingToken) : null;
    if (credential) {
      await this.prisma.webLoginRequest.updateMany({
        where: {
          id: credential.requestId,
          deviceSecretHash: hmac(credential.deviceSecret, this.config.tokenHashSecret),
          status: { in: [WebLoginRequestStatus.PENDING, WebLoginRequestStatus.APPROVED] },
        },
        data: {
          status: WebLoginRequestStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
    }
    return this.createPendingRequest();
  }

  private async createPendingRequest() {
    const deviceSecret = generateSecret();
    const deviceSecretHash = hmac(deviceSecret, this.config.tokenHashSecret);
    const expiresAt = new Date(Date.now() + this.config.requestTtlMs);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const userCode = generateUserCode();
      try {
        const request = await this.prisma.webLoginRequest.create({
          data: {
            userCodeHash: hmac(userCode, this.config.tokenHashSecret),
            deviceSecretHash,
            expiresAt,
          },
          select: { id: true },
        });
        const publicRequest: PublicDeviceRequest = {
          requestId: request.id,
          userCode,
          deviceSecret,
          expiresAt: expiresAt.toISOString(),
        };
        return {
          request: publicRequest,
          pendingToken: this.signPendingToken({
            v: PENDING_COOKIE_VERSION,
            requestId: publicRequest.requestId,
            userCode: publicRequest.userCode,
            deviceSecret: publicRequest.deviceSecret,
            expiresAt: expiresAt.getTime(),
          }),
          expiresAt,
          resumed: false,
        };
      } catch {
        if (attempt === 3) throw new ConflictException('인증 요청을 생성하지 못했습니다.');
      }
    }
    throw new ConflictException('인증 요청을 생성하지 못했습니다.');
  }

  private async resumePendingRequest(pendingToken: string) {
    const credential = this.parsePendingToken(pendingToken);
    if (!credential) return null;
    const request = await this.prisma.webLoginRequest.findUnique({
      where: { id: credential.requestId },
    });
    if (
      !request
      || request.expiresAt.getTime() !== credential.expiresAt
      || request.expiresAt.getTime() <= Date.now()
      || !safeHashEqual(
        hmac(credential.deviceSecret, this.config.tokenHashSecret),
        request.deviceSecretHash,
      )
      || !safeHashEqual(
        hmac(credential.userCode, this.config.tokenHashSecret),
        request.userCodeHash,
      )
      || (
        request.status !== WebLoginRequestStatus.PENDING
        && request.status !== WebLoginRequestStatus.APPROVED
      )
    ) {
      return null;
    }
    const expiresAt = request.expiresAt;
    return {
      request: {
        requestId: credential.requestId,
        userCode: credential.userCode,
        deviceSecret: credential.deviceSecret,
        expiresAt: expiresAt.toISOString(),
      },
      pendingToken,
      expiresAt,
      resumed: true,
    };
  }

  private signPendingToken(credential: PendingCredential) {
    const payload = Buffer.from(JSON.stringify(credential), 'utf8').toString('base64url');
    return `${payload}.${hmac(payload, this.config.tokenHashSecret)}`;
  }

  private parsePendingToken(token: string): PendingCredential | null {
    if (token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    if (!payload || !signature || !safeHashEqual(
      hmac(payload, this.config.tokenHashSecret),
      signature,
    )) return null;
    try {
      const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<PendingCredential>;
      if (
        value.v !== PENDING_COOKIE_VERSION
        || typeof value.requestId !== 'string'
        || !REQUEST_ID_PATTERN.test(value.requestId)
        || typeof value.userCode !== 'string'
        || !USER_CODE_PATTERN.test(value.userCode)
        || typeof value.deviceSecret !== 'string'
        || !DEVICE_SECRET_PATTERN.test(value.deviceSecret)
        || !Number.isSafeInteger(value.expiresAt)
      ) return null;
      return value as PendingCredential;
    } catch {
      return null;
    }
  }

  private async verifiedRequest(requestId: string, deviceSecret: string) {
    assertWebAuthEnabled(this.config);
    const request = await this.prisma.webLoginRequest.findUnique({ where: { id: requestId } });
    if (
      !request
      || !safeHashEqual(
        hmac(deviceSecret, this.config.tokenHashSecret),
        request.deviceSecretHash,
      )
    ) {
      throw new NotFoundException({
        code: 'WEB_AUTH_REQUEST_INVALID',
        message: '인증 요청을 확인할 수 없습니다.',
      });
    }
    return request;
  }

  async poll(requestId: string, deviceSecret: string) {
    const request = await this.verifiedRequest(requestId, deviceSecret);
    if (
      request.expiresAt.getTime() <= Date.now()
      && (request.status === WebLoginRequestStatus.PENDING
        || request.status === WebLoginRequestStatus.APPROVED)
    ) {
      await this.prisma.webLoginRequest.updateMany({
        where: { id: request.id, status: request.status },
        data: { status: WebLoginRequestStatus.EXPIRED },
      });
      return { status: 'expired' as const };
    }
    if (request.status === WebLoginRequestStatus.APPROVED) {
      return { status: 'approved' as const, botUid: request.approvedBotUid };
    }
    return { status: request.status.toLowerCase() as 'pending' | 'expired' | 'cancelled' | 'consumed' };
  }

  verifyInternalToken(token: unknown) {
    assertWebAuthEnabled(this.config);
    if (typeof token !== 'string' || !safeSecretEqual(token, this.config.internalToken)) {
      throw new NotFoundException('찾을 수 없습니다.');
    }
  }

  async approve(userCode: string, botUid: string) {
    assertWebAuthEnabled(this.config);
    const userCodeHash = hmac(userCode.toUpperCase(), this.config.tokenHashSecret);

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.webLoginRequest.findUnique({ where: { userCodeHash } });
      if (!request) throw new NotFoundException(INVALID_CODE);
      if (request.expiresAt.getTime() <= Date.now()) {
        if (
          request.status === WebLoginRequestStatus.PENDING
          || request.status === WebLoginRequestStatus.APPROVED
        ) {
          await tx.webLoginRequest.updateMany({
            where: { id: request.id, status: request.status },
            data: { status: WebLoginRequestStatus.EXPIRED },
          });
        }
        throw new GoneException(INVALID_CODE);
      }
      if (
        request.status === WebLoginRequestStatus.APPROVED
        && request.approvedBotUid === botUid
      ) {
        return { status: 'already_approved' as const };
      }
      if (request.status !== WebLoginRequestStatus.PENDING) {
        throw new ConflictException({
          code: 'WEB_AUTH_CODE_ALREADY_USED',
          message: '이미 처리된 웹 인증 요청입니다.',
        });
      }
      const updated = await tx.webLoginRequest.updateMany({
        where: { id: request.id, status: WebLoginRequestStatus.PENDING },
        data: {
          status: WebLoginRequestStatus.APPROVED,
          approvedBotUid: botUid,
          approvedAt: new Date(),
        },
      });
      if (updated.count === 1) return { status: 'approved' as const };

      const current = await tx.webLoginRequest.findUnique({ where: { id: request.id } });
      if (
        current?.status === WebLoginRequestStatus.APPROVED
        && current.approvedBotUid === botUid
      ) {
        return { status: 'already_approved' as const };
      }
      throw new ConflictException({
        code: 'WEB_AUTH_CODE_CONFLICT',
        message: '다른 계정이 이미 승인한 인증 요청입니다.',
      });
    });
  }

  async complete(
    requestId: string,
    deviceSecret: string,
    currentSessionToken: string | null = null,
  ) {
    const request = await this.verifiedRequest(requestId, deviceSecret);
    if (request.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        code: 'WEB_AUTH_REQUEST_EXPIRED',
        message: '웹 인증 요청이 만료되었습니다.',
      });
    }
    if (
      request.status !== WebLoginRequestStatus.APPROVED
      || !request.approvedBotUid
    ) {
      throw new ConflictException({
        code: 'WEB_AUTH_REQUEST_NOT_APPROVED',
        message: '아직 승인되지 않은 인증 요청입니다.',
      });
    }
    const approvedBotUid = request.approvedBotUid;
    const sessionToken = generateSecret();
    const sessionHash = hmac(sessionToken, this.config.sessionSecret);
    const now = new Date();
    const sessionExpiresAt = fixedWebSessionExpiry(now);

    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.webAccount.upsert({
        where: { botUid: approvedBotUid },
        create: {
          botUid: approvedBotUid,
          lastLoginAt: now,
        },
        update: { lastLoginAt: now },
      });
      if (account.status === WebAccountStatus.SUSPENDED) {
        throw new ForbiddenException({
          code: 'WEB_ACCOUNT_SUSPENDED',
          message: '사용할 수 없는 웹 계정입니다.',
        });
      }
      const consumed = await tx.webLoginRequest.updateMany({
        where: {
          id: request.id,
          status: WebLoginRequestStatus.APPROVED,
          consumedAt: null,
          expiresAt: { gt: now },
          approvedBotUid,
        },
        data: {
          status: WebLoginRequestStatus.CONSUMED,
          consumedAt: now,
        },
      });
      if (consumed.count !== 1) {
        throw new ConflictException({
          code: 'WEB_AUTH_REQUEST_CONSUMED',
          message: '이미 완료되었거나 승인되지 않은 인증 요청입니다.',
        });
      }
      if (currentSessionToken) {
        await tx.webSession.updateMany({
          where: {
            sessionHash: hmac(currentSessionToken, this.config.sessionSecret),
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }
      await tx.webSession.create({
        data: {
          sessionHash,
          webAccountId: account.id,
          expiresAt: sessionExpiresAt,
        },
      });
      return { botUid: account.botUid };
    });

    return { ...result, sessionToken, expiresAt: sessionExpiresAt };
  }

  async cancel(requestId: string, deviceSecret: string) {
    const request = await this.verifiedRequest(requestId, deviceSecret);
    if (
      request.status === WebLoginRequestStatus.CONSUMED
      || request.status === WebLoginRequestStatus.EXPIRED
    ) {
      return { status: request.status.toLowerCase() };
    }
    await this.prisma.webLoginRequest.updateMany({
      where: {
        id: request.id,
        status: { in: [WebLoginRequestStatus.PENDING, WebLoginRequestStatus.APPROVED] },
      },
      data: {
        status: WebLoginRequestStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
    return { status: 'cancelled' };
  }

  sessionCookieOptions(expiresAt?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: expiresAt ? Math.max(0, expiresAt.getTime() - Date.now()) : this.config.sessionTtlMs,
    };
  }

  pendingCookieOptions(expiresAt: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    };
  }

  readSessionToken(cookieHeader: string | undefined) {
    return this.readCookie(cookieHeader, this.config.cookieName);
  }

  readPendingToken(cookieHeader: string | undefined) {
    return this.readCookie(cookieHeader, this.config.pendingCookieName);
  }

  private readCookie(cookieHeader: string | undefined, cookieName: string) {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      const name = part.slice(0, separator).trim();
      if (name !== cookieName) continue;
      try {
        return decodeURIComponent(part.slice(separator + 1));
      } catch {
        return null;
      }
    }
    return null;
  }

  async me(sessionToken: string | null) {
    assertWebAuthEnabled(this.config);
    if (!sessionToken) return { authenticated: false as const };
    const session = await this.prisma.webSession.findUnique({
      where: { sessionHash: hmac(sessionToken, this.config.sessionSecret) },
      include: { webAccount: true },
    });
    if (
      !session
      || session.revokedAt
      || session.expiresAt.getTime() <= Date.now()
      || session.webAccount.status !== WebAccountStatus.ACTIVE
    ) {
      return { authenticated: false as const };
    }
    await this.prisma.webSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return { authenticated: true as const, botUid: session.webAccount.botUid };
  }

  async logout(sessionToken: string | null) {
    assertWebAuthEnabled(this.config);
    if (sessionToken) {
      await this.prisma.webSession.updateMany({
        where: {
          sessionHash: hmac(sessionToken, this.config.sessionSecret),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  private async cleanup() {
    const cutoff = new Date(Date.now() - this.config.cleanupRetentionMs);
    await this.prisma.webSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          { revokedAt: { lt: cutoff } },
        ],
      },
    });
    await this.prisma.webLoginRequest.deleteMany({
      where: {
        updatedAt: { lt: cutoff },
        status: {
          in: [
            WebLoginRequestStatus.EXPIRED,
            WebLoginRequestStatus.CONSUMED,
            WebLoginRequestStatus.CANCELLED,
          ],
        },
      },
    });
  }
}
