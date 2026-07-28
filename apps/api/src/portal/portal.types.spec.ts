import { parsePortalDashboard } from './portal.types';

describe('portal response validation', () => {
  const valid = {
    meta: { version: 1, generatedAt: '2026-07-25T00:00:00.000Z' },
    summary: [], systems: [], characters: [], artworks: [],
  };

  it('accepts the bot dashboard shape without requiring a UID', () => {
    expect(parsePortalDashboard(valid)).toEqual(valid);
  });

  it('does not expose provider identity fields', () => {
    const parsed = parsePortalDashboard({
      ...valid,
      uid: 'provider-identity',
      accountKey: 'provider-account',
      meta: { ...valid.meta, uid: 'provider-identity' },
    });
    expect(parsed).toEqual(valid);
    expect(parsed).not.toHaveProperty('uid');
    expect(parsed).not.toHaveProperty('accountKey');
    expect(parsed.meta).not.toHaveProperty('uid');
  });

  it('rejects a raw malformed response', () => {
    expect(() => parsePortalDashboard({ users: {} })).toThrow('invalid response');
  });

  it.each(['male', 'female', 'unknown'] as const)('accepts gender %s', (gender) => {
    const value = {
      ...valid,
      characters: [{ id: 'warrior', job: 'warrior', gender, current: true }],
    };
    expect(parsePortalDashboard(value).characters[0].gender).toBe(gender);
  });

  it('normalizes a missing legacy gender to unknown', () => {
    const value = {
      ...valid,
      characters: [{ id: 'archer', job: 'archer' }],
    };
    expect(parsePortalDashboard(value).characters[0].gender).toBe('unknown');
  });

  it('rejects invalid gender and duplicate jobs', () => {
    expect(() => parsePortalDashboard({
      ...valid,
      characters: [{ id: 'mage', job: 'mage', gender: 'private' }],
    })).toThrow('invalid response');
    expect(() => parsePortalDashboard({
      ...valid,
      characters: [
        { id: 'warrior-1', job: 'warrior', gender: 'male' },
        { id: 'warrior-2', job: 'warrior', gender: 'female' },
      ],
    })).toThrow('invalid response');
  });
});
