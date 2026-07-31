import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_SESSION_BROWSER_NOTICE,
  AUTH_SESSION_PRIMARY_NOTICE,
} from './auth-session-policy.ts';

test('the authentication UI describes the fixed 30-day browser session', () => {
  assert.equal(
    AUTH_SESSION_PRIMARY_NOTICE,
    '한 번 인증하면 이 브라우저에서 30일간 로그인이 유지됩니다.',
  );
  assert.equal(
    AUTH_SESSION_BROWSER_NOTICE,
    '카카오톡 브라우저와 외부 브라우저는 각각 한 번씩 인증해야 합니다.',
  );
});
