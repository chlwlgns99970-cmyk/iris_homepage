import { config } from 'dotenv';
import { resolve } from 'node:path';

const result = config({
  path: resolve(__dirname, '../../../.env'),
  quiet: true,
});

if (result.error) {
  throw new Error('E2E 테스트에 필요한 루트 .env 파일을 불러오지 못했습니다.');
}

if (!process.env.DATABASE_URL) {
  throw new Error('E2E 테스트에 필요한 DATABASE_URL이 설정되지 않았습니다.');
}

if (!process.env.REDIS_URL) {
  throw new Error('E2E 테스트에 필요한 REDIS_URL이 설정되지 않았습니다.');
}
