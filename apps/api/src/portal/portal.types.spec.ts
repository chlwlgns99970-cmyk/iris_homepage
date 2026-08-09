import { parsePortalDashboard } from './portal.types';

describe('portal response validation', () => {
  const valid = {
    meta: { version: 1, generatedAt: '2026-07-25T00:00:00.000Z' },
    summary: [], systems: [], characters: [], artworks: [],
  };

  it('accepts the bot dashboard shape without requiring a UID', () => {
    expect(parsePortalDashboard(valid)).toEqual({
      ...valid,
      accountGender: 'unknown',
      accountNickname: '',
      fortune: { active: false },
    });
  });

  it('does not expose provider identity fields', () => {
    const parsed = parsePortalDashboard({
      ...valid,
      uid: 'provider-identity',
      accountKey: 'provider-account',
      meta: { ...valid.meta, uid: 'provider-identity' },
    });
    expect(parsed).toEqual({
      ...valid,
      accountGender: 'unknown',
      accountNickname: '',
      fortune: { active: false },
    });
    expect(parsed).not.toHaveProperty('uid');
    expect(parsed).not.toHaveProperty('accountKey');
    expect(parsed.meta).not.toHaveProperty('uid');
  });

  it('rejects a raw malformed response', () => {
    expect(() => parsePortalDashboard({ users: {} })).toThrow('invalid response');
  });

  it.each([
    'boss_damage', 'tower_damage', 'raid_damage', 'exp_gain',
    'gold_gain', 'chat_gold', 'shop_discount',
  ] as const)('accepts and sanitizes active fortune %s', (type) => {
    const fortune = {
      active: true,
      type,
      name: '오늘의 운세',
      description: '효과 설명',
      expiresAt: '2026-07-25T14:59:59.999Z',
      uid: 'private',
    };
    expect(parsePortalDashboard({ ...valid, fortune }).fortune).toEqual({
      active: true,
      type,
      name: '오늘의 운세',
      description: '효과 설명',
      expiresAt: '2026-07-25T14:59:59.999Z',
    });
  });

  it('normalizes missing fortune and rejects malformed fortune', () => {
    expect(parsePortalDashboard(valid).fortune).toEqual({ active: false });
    expect(parsePortalDashboard({ ...valid, fortune: { active: false, uid: 'private' } }).fortune)
      .toEqual({ active: false });
    expect(() => parsePortalDashboard({
      ...valid,
      fortune: { active: true, type: 'private', name: 'x', description: 'x', expiresAt: valid.meta.generatedAt },
    })).toThrow('invalid response');
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

  it.each([
    ['male', 'male'],
    ['남성', 'male'],
    ['female', 'female'],
    ['여자', 'female'],
    [undefined, 'unknown'],
    ['private', 'unknown'],
  ] as const)('normalizes account gender %s to %s', (accountGender, expected) => {
    expect(parsePortalDashboard({
      ...valid,
      accountGender,
      accountNickname: '단지얌',
    })).toMatchObject({
      accountGender: expected,
      accountNickname: '단지얌',
    });
  });

  it('treats malformed characters as empty and does not expose identity fields', () => {
    const parsed = parsePortalDashboard({
      ...valid,
      characters: { uid: 'private' },
      accountNickname: undefined,
      senderId: 'private',
    });
    expect(parsed.characters).toEqual([]);
    expect(parsed.accountNickname).toBe('');
    expect(parsed).not.toHaveProperty('senderId');
  });
});
