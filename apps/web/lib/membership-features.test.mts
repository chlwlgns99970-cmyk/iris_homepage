import assert from 'node:assert/strict';
import test from 'node:test';
import type { PortalDashboard, PortalRankings } from './api.ts';
import {
  buildMembershipRankingComparison,
  FREE_MEMBERSHIP_ENTITLEMENT,
  resolveMembershipEntitlement,
  shouldUseMembershipProfileFrame,
} from './membership-features.ts';

const dashboard = {
  meta: { version: 1, generatedAt: '2026-08-24T00:00:00.000Z' },
  systems: [],
} as PortalDashboard;

test('membership entitlement is safely disabled unless the server explicitly activates it', () => {
  assert.deepEqual(resolveMembershipEntitlement(undefined), FREE_MEMBERSHIP_ENTITLEMENT);
  assert.deepEqual(resolveMembershipEntitlement(dashboard), FREE_MEMBERSHIP_ENTITLEMENT);
  assert.deepEqual(resolveMembershipEntitlement({ ...dashboard, membershipActive: 'true' } as PortalDashboard), FREE_MEMBERSHIP_ENTITLEMENT);
  assert.deepEqual(resolveMembershipEntitlement({ ...dashboard, membership: { tier: 'FREE', active: true } } as PortalDashboard), FREE_MEMBERSHIP_ENTITLEMENT);
  const active = resolveMembershipEntitlement({ ...dashboard, membership: { tier: 'MEMBERSHIP', active: true } } as PortalDashboard);
  assert.deepEqual(active, { tier: 'MEMBERSHIP', active: true });
  assert.equal(shouldUseMembershipProfileFrame(active), true);
  assert.equal(shouldUseMembershipProfileFrame(FREE_MEMBERSHIP_ENTITLEMENT), false);
});

test('ranking comparison uses actual current rows and does not mutate provider data', () => {
  const rankings: PortalRankings = {
    categories: [
      { id: 'power', label: '전투력', rows: [
        { rank: 1, nickname: '위 모험가', job: '전사', value: '1,500', current: false },
        { rank: 2, nickname: '현재 모험가', job: '전사', value: '1,000', current: true },
        { rank: 3, nickname: '아래 모험가', job: '전사', value: '700', current: false },
      ] },
      { id: 'level', label: '레벨', rows: [
        { rank: 1, nickname: '위 모험가', job: '전사', value: 'Lv. 80', current: false },
        { rank: 2, nickname: '현재 모험가', job: '전사', value: 'Lv. 70', current: true },
        { rank: 3, nickname: '아래 모험가', job: '전사', value: 'Lv. 68', current: false },
      ] },
    ],
    byJob: {
      warrior: [{ rank: 1, nickname: '현재 모험가', job: '전사', value: '1,000', current: true }],
      archer: [],
      mage: [],
    },
  };
  const before = structuredClone(rankings);
  const result = buildMembershipRankingComparison(rankings);
  assert.equal(result?.overallRank, 2);
  assert.equal(result?.jobRank, 1);
  assert.equal(result?.metrics[0]?.above?.difference, 500);
  assert.equal(result?.metrics[0]?.below?.difference, 300);
  assert.equal(result?.metrics[1]?.above?.difference, 10);
  assert.equal(result?.metrics[1]?.below?.difference, 2);
  assert.deepEqual(rankings, before);
});

test('ranking comparison returns null without an authenticated current ranking row', () => {
  assert.equal(buildMembershipRankingComparison({
    categories: [{ id: 'power', label: '전투력', rows: [{ rank: 1, nickname: '모험가', job: '전사', value: '100', current: false }] }],
  }), null);
});
