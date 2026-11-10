import assert from 'node:assert/strict';
import test from 'node:test';
import { palaceLawView } from './palace-law-display.ts';

test('formats server law timestamps in Asia/Seoul and keeps the server effect text', () => {
  assert.deepEqual(
    palaceLawView({
      type: 'combat', name: '전투 장려령', description: '보스·탑·레이드 최종 공격력 +3%',
      proclaimedAt: '2026-08-11T05:07:00.000Z', nextChangeAt: '2026-08-11T06:00:00.000Z', enhancementUsedToday: false,
    }),
    {
      active: true, name: '전투 장려령', description: '보스·탑·레이드 최종 공격력 +3%',
      proclaimedAt: '2026-08-11 14:07 KST', nextChangeAt: '15:00 KST', enhancementStatus: '오늘 사용 가능',
    },
  );
});

test('renders the inactive fallback without inventing a proclamation time', () => {
  const view = palaceLawView({
    type: 'none', name: '없음', description: '현재 왕궁 점령자가 새로운 법령을 선포할 수 있습니다.',
    proclaimedAt: null, nextChangeAt: null, enhancementUsedToday: true,
  });
  assert.equal(view.active, false);
  assert.equal(view.proclaimedAt, '선포 전');
  assert.equal(view.nextChangeAt, '선포 후 다음 정각');
  assert.equal(view.enhancementStatus, '오늘 사용함');
});
