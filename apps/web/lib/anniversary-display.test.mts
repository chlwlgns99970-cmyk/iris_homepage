import assert from 'node:assert/strict';
import test from 'node:test';
import { anniversaryView } from './anniversary-display.ts';

test('missing data renders read-only guidance without a registration action', () => {
  assert.deepEqual(anniversaryView(), {
    joinedDate: '기록 없음',
    joinedDays: '확인 불가',
    nextMilestone: '확인 불가',
    birthday: '미등록',
    birthdayDetail: '카카오톡에서 /생일등록 MM-DD',
  });
});

test('registered leap birthday and next join milestone use sanitized display fields', () => {
  const view = anniversaryView({
    joinedDate: '2025-08-10',
    joinedDays: 365,
    nextMilestone: { date: '2026-08-10', days: 365, points: 365, kinds: ['annual'] },
    todayMilestone: null,
    todayRewardStatus: 'not_due',
  }, {
    registered: true,
    month: 2,
    day: 29,
    leapDayObservedOn: '03-01',
    isToday: false,
    rewardStatus: 'not_due',
  });
  assert.equal(view.joinedDate, '2025.08.10');
  assert.equal(view.joinedDays, '365일');
  assert.equal(view.nextMilestone, '2026.08.10 · 가입 365일');
  assert.equal(view.birthday, '2월 29일');
  assert.equal(view.birthdayDetail, '평년 기념일 3월 1일');
});

test('paid milestones render exact celebration rewards', () => {
  const view = anniversaryView({
    joinedDate: '2025-08-10',
    joinedDays: 365,
    nextMilestone: { date: '2026-08-10', days: 365, points: 365, kinds: ['annual'] },
    todayMilestone: { date: '2026-08-10', days: 365, points: 365, kinds: ['annual'] },
    todayRewardStatus: 'paid',
  }, {
    registered: true,
    month: 8,
    day: 10,
    leapDayObservedOn: null,
    isToday: true,
    rewardStatus: 'paid',
  });
  assert.equal(view.joinCelebration, '🎉 가입 365일을 축하합니다! 시즌포인트 365P 지급');
  assert.equal(view.birthdayCelebration, '🎂 생일을 축하합니다! 골드 1,000,000G 지급');
});
