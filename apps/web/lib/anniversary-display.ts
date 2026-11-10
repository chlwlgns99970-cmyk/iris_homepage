import type { PortalAnniversary, PortalBirthday } from './api';

export type AnniversaryView = {
  joinedDate: string;
  joinedDays: string;
  nextMilestone: string;
  birthday: string;
  birthdayDetail?: string;
  joinCelebration?: string;
  birthdayCelebration?: string;
};

function amount(value: number) {
  return value.toLocaleString('ko-KR');
}

function calendarDate(value: string) {
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? [];
  return year ? `${year}.${month}.${day}` : value;
}

export function anniversaryView(
  anniversary?: PortalAnniversary | null,
  birthday?: PortalBirthday | null,
): AnniversaryView {
  const view: AnniversaryView = {
    joinedDate: anniversary?.joinedDate ? calendarDate(anniversary.joinedDate) : '기록 없음',
    joinedDays: anniversary?.joinedDays === null || anniversary?.joinedDays === undefined
      ? '확인 불가'
      : `${amount(anniversary.joinedDays)}일`,
    nextMilestone: anniversary?.nextMilestone
      ? `${calendarDate(anniversary.nextMilestone.date)} · 가입 ${amount(anniversary.nextMilestone.days)}일`
      : '확인 불가',
    birthday: birthday?.registered && birthday.month && birthday.day
      ? `${birthday.month}월 ${birthday.day}일`
      : '미등록',
  };

  if (birthday?.registered && birthday.leapDayObservedOn) {
    const [month, day] = birthday.leapDayObservedOn.split('-').map(Number);
    view.birthdayDetail = `평년 기념일 ${month}월 ${day}일`;
  } else if (!birthday?.registered) {
    view.birthdayDetail = '카카오톡에서 /생일등록 MM-DD';
  }

  if (anniversary?.todayRewardStatus === 'paid' && anniversary.todayMilestone) {
    view.joinCelebration = `🎉 가입 ${amount(anniversary.todayMilestone.days)}일을 축하합니다! 시즌포인트 ${amount(anniversary.todayMilestone.points)}P 지급`;
  }
  if (birthday?.rewardStatus === 'paid' && birthday.isToday) {
    view.birthdayCelebration = '🎂 생일을 축하합니다! 골드 1,000,000G 지급';
  }
  return view;
}
