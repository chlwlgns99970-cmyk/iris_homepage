import {
  fixedWebSessionExpiry,
  WEB_SESSION_DURATION_MS,
  WEB_SESSION_DURATION_SECONDS,
} from './auth.time';

describe('fixed 30-day browser session boundary', () => {
  it.each([
    ['morning', '2026-07-28T00:00:00.000Z', '2026-08-27T00:00:00.000Z'],
    ['23:59 KST', '2026-07-28T14:59:00.000Z', '2026-08-27T14:59:00.000Z'],
    ['after midnight KST', '2026-07-28T15:00:01.000Z', '2026-08-27T15:00:01.000Z'],
  ])('%s expires exactly 30 days after issuance', (_label, input, expected) => {
    expect(fixedWebSessionExpiry(new Date(input)).toISOString()).toBe(expected);
  });

  it('uses exactly 2,592,000 seconds', () => {
    expect(WEB_SESSION_DURATION_SECONDS).toBe(2_592_000);
    expect(WEB_SESSION_DURATION_MS).toBe(2_592_000_000);
  });

  it('rejects an invalid issuance date', () => {
    expect(() => fixedWebSessionExpiry(new Date(Number.NaN))).toThrow(
      'Unable to calculate the web session expiry',
    );
  });
});
