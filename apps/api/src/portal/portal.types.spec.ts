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
      anniversary: null,
      birthday: null,
      palaceLaw: {
        type: 'none', name: '없음',
        description: '현재 왕궁 점령자가 새로운 법령을 선포할 수 있습니다.',
        proclaimedAt: null, nextChangeAt: null, enhancementUsedToday: false,
      },
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
      anniversary: null,
      birthday: null,
      palaceLaw: {
        type: 'none', name: '없음',
        description: '현재 왕궁 점령자가 새로운 법령을 선포할 수 있습니다.',
        proclaimedAt: null, nextChangeAt: null, enhancementUsedToday: false,
      },
    });
    expect(parsed).not.toHaveProperty('uid');
    expect(parsed).not.toHaveProperty('accountKey');
    expect(parsed.meta).not.toHaveProperty('uid');
  });

  it('preserves server-provided equipment display names and read-only ticket quantity', () => {
    const equipment = {
      id: 'equipment', icon: '🗡️', title: '장비창', command: '/장비창', description: '실제 장비',
      metrics: [['이름 변경권', '3개', '카카오톡: /장비이름변경 번호 새이름']],
      content: { type:'table', title:'보유 장비', headers:['이름'], rows:[['전설검👑']] },
    };
    const parsed = parsePortalDashboard({ ...valid, systems:[equipment] });
    expect(parsed.systems).toEqual([equipment]);
    expect(parsed).not.toHaveProperty('rename');
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

  it('sanitizes anniversary and birthday fields without exposing reward or operation internals', () => {
    const parsed = parsePortalDashboard({
      ...valid,
      anniversary: {
        joinedDate: '2025-08-10',
        joinedDays: 365,
        nextMilestone: { date: '2026-08-10', days: 365, points: 365, kinds: ['annual'], operationId: 'private' },
        todayMilestone: { date: '2026-08-10', days: 365, points: 365, kinds: ['annual'] },
        todayRewardStatus: 'paid',
        todayReward: { points: 365 },
        executedSlots: { private: true },
      },
      birthday: {
        registered: true,
        month: 2,
        day: 29,
        leapDayObservedOn: '02-28',
        isToday: false,
        rewardStatus: 'not_due',
        reward: { gold: 1000000 },
        uid: 'private',
      },
    });
    expect(parsed.anniversary).toEqual({
      joinedDate: '2025-08-10',
      joinedDays: 365,
      nextMilestone: { date: '2026-08-10', days: 365, points: 365, kinds: ['annual'] },
      todayMilestone: { date: '2026-08-10', days: 365, points: 365, kinds: ['annual'] },
      todayRewardStatus: 'paid',
    });
    expect(parsed.birthday).toEqual({
      registered: true,
      month: 2,
      day: 29,
      leapDayObservedOn: '02-28',
      isToday: false,
      rewardStatus: 'not_due',
    });
    expect(parsed.anniversary).not.toHaveProperty('todayReward');
    expect(parsed.anniversary?.nextMilestone).not.toHaveProperty('operationId');
    expect(parsed.birthday).not.toHaveProperty('reward');
    expect(parsed.birthday).not.toHaveProperty('uid');
  });

  it('rejects malformed anniversary and birthday fields', () => {
    expect(() => parsePortalDashboard({
      ...valid,
      anniversary: { joinedDate: '2026-02-30', joinedDays: 1, nextMilestone: null, todayMilestone: null, todayRewardStatus: 'paid' },
    })).toThrow('invalid response');
    expect(() => parsePortalDashboard({
      ...valid,
      birthday: { registered: true, month: 2, day: 29, leapDayObservedOn: '02-27', isToday: false, rewardStatus: 'not_due' },
    })).toThrow('invalid response');
    expect(() => parsePortalDashboard({
      ...valid,
      birthday: { registered: true, month: 4, day: 31, leapDayObservedOn: null, isToday: false, rewardStatus: 'not_due' },
    })).toThrow('invalid response');
  });

  it('sanitizes a server-provided palace law without exposing owner or operation internals', () => {
    const parsed = parsePortalDashboard({
      ...valid,
      palaceLaw: {
        type: 'combat', name: '전투 장려령', description: '보스·탑·레이드 최종 공격력 +3%',
        proclaimedAt: '2026-08-11T05:07:00.000Z', nextChangeAt: '2026-08-11T06:00:00.000Z',
        enhancementUsedToday: false, proclaimedByUid: 'private', operationId: 'private',
      },
    });
    expect(parsed.palaceLaw).toEqual({
      type: 'combat', name: '전투 장려령', description: '보스·탑·레이드 최종 공격력 +3%',
      proclaimedAt: '2026-08-11T05:07:00.000Z', nextChangeAt: '2026-08-11T06:00:00.000Z',
      enhancementUsedToday: false,
    });
    expect(parsed.palaceLaw).not.toHaveProperty('proclaimedByUid');
    expect(parsed.palaceLaw).not.toHaveProperty('operationId');
  });

  it('fails closed for malformed palace-law payloads', () => {
    expect(() => parsePortalDashboard({ ...valid, palaceLaw: { type: 'private' } })).toThrow('invalid response');
    expect(() => parsePortalDashboard({
      ...valid,
      palaceLaw: { type: 'none', name: '없음', description: '없음', proclaimedAt: valid.meta.generatedAt, nextChangeAt: null, enhancementUsedToday: false },
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
