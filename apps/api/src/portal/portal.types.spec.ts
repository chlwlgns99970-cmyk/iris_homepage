import { parsePortalDashboard } from './portal.types';

describe('portal response validation', () => {
  const valid = {
    meta: { version: 1, uid: '00000008', generatedAt: '2026-07-25T00:00:00.000Z' },
    summary: [], systems: [], characters: [], artworks: [],
  };

  it('accepts the expected UID and shape', () => {
    expect(parsePortalDashboard(valid, '00000008')).toEqual(valid);
  });

  it('rejects a UID mismatch or raw malformed response', () => {
    expect(() => parsePortalDashboard(valid, '00000009')).toThrow('invalid response');
    expect(() => parsePortalDashboard({ users: {} }, '00000008')).toThrow('invalid response');
  });

  it.each(['male', 'female', 'unknown'] as const)('accepts gender %s', (gender) => {
    const value = {
      ...valid,
      characters: [{ id: 'warrior', job: 'warrior', gender, current: true }],
    };
    expect(parsePortalDashboard(value, '00000008').characters[0].gender).toBe(gender);
  });

  it('normalizes a missing legacy gender to unknown', () => {
    const value = {
      ...valid,
      characters: [{ id: 'archer', job: 'archer' }],
    };
    expect(parsePortalDashboard(value, '00000008').characters[0].gender).toBe('unknown');
  });

  it('rejects invalid gender and duplicate jobs', () => {
    expect(() => parsePortalDashboard({
      ...valid,
      characters: [{ id: 'mage', job: 'mage', gender: 'private' }],
    }, '00000008')).toThrow('invalid response');
    expect(() => parsePortalDashboard({
      ...valid,
      characters: [
        { id: 'warrior-1', job: 'warrior', gender: 'male' },
        { id: 'warrior-2', job: 'warrior', gender: 'female' },
      ],
    }, '00000008')).toThrow('invalid response');
  });
});
