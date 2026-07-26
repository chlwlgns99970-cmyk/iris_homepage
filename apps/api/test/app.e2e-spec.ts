import {
  Controller,
  Get,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { buildCorsOptions } from '../src/common/cors';
import { PrismaService } from '../src/infrastructure/prisma.service';

@Controller('__test')
class TestErrorController {
  @Get('error')
  error(): never {
    throw new Error('internal database detail');
  }
}

describe('API contracts', () => {
  let app: INestApplication | undefined;
  const createdRequestIds = new Set<string>();
  const testBotUid = String(
    90000000 + ((process.pid + Date.now()) % 9999999),
  ).slice(0, 8);
  const otherTestBotUid = String(Number(testBotUid) === 99999999
    ? Number(testBotUid) - 1
    : Number(testBotUid) + 1);

  beforeAll(async () => {
    process.env.WEB_AUTH_ENABLED = 'true';
    process.env.WEB_AUTH_INTERNAL_TOKEN = 'internal-e2e-token-value-1234567890';
    process.env.TOKEN_HASH_SECRET = 'token-hash-e2e-secret-value-1234567';
    process.env.SESSION_SECRET = 'session-e2e-secret-value-1234567890';
    process.env.WEB_SESSION_COOKIE_NAME = 'natebe_session_e2e';
    app = (
      await Test.createTestingModule({
        imports: [AppModule],
        controllers: [TestErrorController],
      }).compile()
    ).createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    app.enableCors(buildCorsOptions('test', 'http://localhost:3000'));
    await app.init();
  });

  afterAll(async () => {
    if (!app) return;
    try {
      const prisma = app.get(PrismaService);
      const account = await prisma.webAccount.findUnique({
        where: { botUid: testBotUid },
      });
      if (account) {
        await prisma.webSession.deleteMany({ where: { webAccountId: account.id } });
        await prisma.webAccount.delete({ where: { id: account.id } });
      }
      expect(await prisma.webAccount.count({
        where: { botUid: testBotUid },
      })).toBe(0);
      const requestIds = [...createdRequestIds];
      if (requestIds.length > 0) {
        await prisma.webLoginRequest.deleteMany({
          where: { id: { in: requestIds } },
        });
        expect(await prisma.webLoginRequest.count({
          where: { id: { in: requestIds } },
        })).toBe(0);
      }
    } finally {
      await app.close();
    }
  });

  it('rejects invalid ranking type', () =>
    request(app!.getHttpServer()).get('/api/rankings?type=nope').expect(400));

  it('reports unconfigured ranking', () =>
    request(app!.getHttpServer()).get('/api/rankings?type=power').expect(503));

  it('does not fake UID linking', () =>
    request(app!.getHttpServer())
      .post('/api/auth/link/consume')
      .send({ uid: '00000008', code: '123456' })
      .expect(503)
      .expect(({ body }) => {
        expect(body.code).toBe('IRIS_LINK_NOT_CONFIGURED');
        expect(body.message).toBe('봇 UID 연결 서버가 아직 구성되지 않았습니다.');
      }));

  it('blocks anonymous admin writes', () =>
    request(app!.getHttpServer()).post('/api/admin/notices').send({}).expect(401));

  it('allows the configured CORS origin with credentials', () =>
    request(app!.getHttpServer())
      .get('/api/rankings?type=power')
      .set('Origin', 'http://localhost:3000')
      .expect('access-control-allow-origin', 'http://localhost:3000')
      .expect('access-control-allow-credentials', 'true')
      .expect(503));

  it('blocks an unconfigured CORS origin', () =>
    request(app!.getHttpServer())
      .get('/api/rankings?type=power')
      .set('Origin', 'https://evil.example.com')
      .expect((response) => {
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      })
      .expect(500));

  it('hides internal details from a generic 500 response', () =>
    request(app!.getHttpServer())
      .get('/__test/error')
      .expect(500)
      .expect(({ body }) => {
        expect(body.code).toBe('INTERNAL_ERROR');
        expect(body.message).toBe('서버 오류가 발생했습니다.');
        expect(JSON.stringify(body)).not.toContain('internal database detail');
      }));

  it('completes the device flow once and maintains then revokes the cookie session', async () => {
    const started = await request(app!.getHttpServer())
      .post('/api/auth/device/start')
      .expect(201);
    createdRequestIds.add(started.body.requestId);
    expect(started.body.userCode).toMatch(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
    expect(started.body.deviceSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const prisma = app!.get(PrismaService);
    const stored = await prisma.webLoginRequest.findUnique({
      where: { id: started.body.requestId },
    });
    expect(stored?.userCodeHash).not.toContain(started.body.userCode);
    expect(stored?.deviceSecretHash).not.toContain(started.body.deviceSecret);

    await request(app!.getHttpServer())
      .post('/api/auth/device/poll')
      .send({ requestId: started.body.requestId, deviceSecret: started.body.deviceSecret })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ status: 'pending' }));

    await request(app!.getHttpServer())
      .post('/internal/auth/device/approve')
      .send({ userCode: started.body.userCode, botUid: testBotUid })
      .expect(404);

    await request(app!.getHttpServer())
      .post('/internal/auth/device/approve')
      .set('x-web-auth-internal-token', 'internal-e2e-token-value-1234567890')
      .send({ userCode: started.body.userCode, botUid: testBotUid })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('approved'));

    await request(app!.getHttpServer())
      .post('/internal/auth/device/approve')
      .set('x-web-auth-internal-token', 'internal-e2e-token-value-1234567890')
      .send({ userCode: started.body.userCode, botUid: testBotUid })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('already_approved'));

    await request(app!.getHttpServer())
      .post('/internal/auth/device/approve')
      .set('x-web-auth-internal-token', 'internal-e2e-token-value-1234567890')
      .send({ userCode: started.body.userCode, botUid: otherTestBotUid })
      .expect(409);

    await request(app!.getHttpServer())
      .post('/api/auth/device/poll')
      .send({ requestId: started.body.requestId, deviceSecret: 'x'.repeat(43) })
      .expect(404);

    await request(app!.getHttpServer())
      .post('/api/auth/device/poll')
      .send({ requestId: started.body.requestId, deviceSecret: started.body.deviceSecret })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('approved');
        expect(body.botUid).toBe(testBotUid);
      });

    const completions = await Promise.all([
      request(app!.getHttpServer())
        .post('/api/auth/device/complete')
        .send({ requestId: started.body.requestId, deviceSecret: started.body.deviceSecret }),
      request(app!.getHttpServer())
        .post('/api/auth/device/complete')
        .send({ requestId: started.body.requestId, deviceSecret: started.body.deviceSecret }),
    ]);
    expect(completions.map(({ status }) => status).sort()).toEqual([200, 409]);
    const completed = completions.find(({ status }) => status === 200)!;
    const cookie = completed.headers['set-cookie']?.[0] as string;
    expect(cookie).toContain('natebe_session_e2e=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(JSON.stringify(completed.body)).not.toContain('sessionToken');

    const session = await prisma.webSession.findFirst({
      where: { webAccount: { botUid: testBotUid } },
    });
    expect(session?.sessionHash).not.toContain(cookie.split('=')[1]?.split(';')[0]);

    await request(app!.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({
        authenticated: true,
        botUid: testBotUid,
      }));

    await request(app!.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(200);

    await request(app!.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ authenticated: false }));
  });

  it('cancels a pending request and rejects later approval', async () => {
    const started = await request(app!.getHttpServer())
      .post('/api/auth/device/start')
      .expect(201);
    createdRequestIds.add(started.body.requestId);
    await request(app!.getHttpServer())
      .post('/api/auth/device/cancel')
      .send({ requestId: started.body.requestId, deviceSecret: started.body.deviceSecret })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('cancelled'));
    await request(app!.getHttpServer())
      .post('/api/auth/device/poll')
      .send({ requestId: started.body.requestId, deviceSecret: started.body.deviceSecret })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('cancelled'));
    await request(app!.getHttpServer())
      .post('/internal/auth/device/approve')
      .set('x-web-auth-internal-token', 'internal-e2e-token-value-1234567890')
      .send({ userCode: started.body.userCode, botUid: testBotUid })
      .expect(409);
  });
});
