import { nextSeoulMidnight } from './auth.time';

describe('Seoul session boundary', () => {
  it.each([
    ['morning', '2026-07-28T00:00:00.000Z', '2026-07-28T15:00:00.000Z'],
    ['afternoon', '2026-07-28T08:30:00.000Z', '2026-07-28T15:00:00.000Z'],
    ['23:59 KST', '2026-07-28T14:59:00.000Z', '2026-07-28T15:00:00.000Z'],
    ['after midnight KST', '2026-07-28T15:00:01.000Z', '2026-07-29T15:00:00.000Z'],
  ])('%s expires at the next Korean midnight', (_label, input, expected) => {
    expect(nextSeoulMidnight(new Date(input)).toISOString()).toBe(expected);
  });

  it('does not extend an already issued boundary', () => {
    const issued = nextSeoulMidnight(new Date('2026-07-28T01:00:00.000Z'));
    expect(issued.toISOString()).toBe('2026-07-28T15:00:00.000Z');
  });
});
