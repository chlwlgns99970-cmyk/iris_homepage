import type { PortalPalaceLaw } from './api';

function kst(value: string, timeOnly = false) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    ...(timeOnly ? {} : { year: 'numeric', month: '2-digit', day: '2-digit' }),
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return timeOnly ? `${map.hour}:${map.minute}` : `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

export function palaceLawView(law: PortalPalaceLaw) {
  return {
    active: law.type !== 'none',
    name: law.name,
    description: law.description,
    proclaimedAt: law.proclaimedAt ? `${kst(law.proclaimedAt)} KST` : '선포 전',
    nextChangeAt: law.nextChangeAt ? `${kst(law.nextChangeAt, true)} KST` : '선포 후 다음 정각',
    enhancementStatus: law.enhancementUsedToday ? '오늘 사용함' : '오늘 사용 가능',
  };
}
