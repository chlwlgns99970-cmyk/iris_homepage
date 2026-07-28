const SEOUL_TIME_ZONE = 'Asia/Seoul';

export function nextSeoulMidnight(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(value.year);
  const month = Number(value.month);
  const day = Number(value.day);
  if (![year, month, day].every(Number.isSafeInteger)) {
    throw new Error('Unable to calculate the Seoul session boundary');
  }
  return new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0));
}
