import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DASHBOARD_REFRESH_DEDUP_MS,
  shouldRefreshDashboard,
} from './dashboard-refresh.ts';

test('first dashboard request is always allowed', () => {
  assert.equal(shouldRefreshDashboard(0, 1), true);
});

test('focus and visibility events within the dedup window issue one request', () => {
  const requestedAt = 10_000;
  assert.equal(shouldRefreshDashboard(requestedAt, requestedAt + 10), false);
  assert.equal(
    shouldRefreshDashboard(requestedAt, requestedAt + DASHBOARD_REFRESH_DEDUP_MS),
    true,
  );
});

test('a stale dashboard is refreshed without changing the authentication session', () => {
  assert.equal(shouldRefreshDashboard(20_000, 25_000), true);
});
