export type PortalCharacter = {
  id: string;
  job: 'warrior' | 'archer' | 'mage';
  gender: 'male' | 'female' | 'unknown';
  current?: boolean;
  name?: string;
  level?: string;
  power?: string;
  weapon?: string;
  title?: string;
  rebirth?: string;
  tower?: string;
  raid?: string;
};

export type PortalGender = PortalCharacter['gender'];

export type PortalFortune =
  | { active: false }
  | {
    active: true;
    type: 'boss_damage' | 'tower_damage' | 'raid_damage' | 'exp_gain' | 'gold_gain' | 'chat_gold' | 'shop_discount';
    name: string;
    description: string;
    expiresAt: string;
  };

export type PortalAnniversaryMilestone = {
  date: string;
  days: number;
  points: number;
  kinds: ('day10' | 'hundred' | 'annual')[];
};

export type PortalAnniversary = {
  joinedDate: string | null;
  joinedDays: number | null;
  nextMilestone: PortalAnniversaryMilestone | null;
  todayMilestone: PortalAnniversaryMilestone | null;
  todayRewardStatus: 'paid' | 'pending' | 'not_due';
};

export type PortalBirthday = {
  registered: boolean;
  month: number | null;
  day: number | null;
  leapDayObservedOn: '02-28' | '03-01' | null;
  isToday: boolean;
  rewardStatus: 'paid' | 'pending' | 'not_due';
};

export type PortalPalaceLaw = {
  type: 'none' | 'combat' | 'growth' | 'commerce' | 'enhancement';
  name: string;
  description: string;
  proclaimedAt: string | null;
  nextChangeAt: string | null;
  enhancementUsedToday: boolean;
};

export type PortalDashboard = {
  meta: { version: number; generatedAt: string };
  accountGender: PortalGender;
  accountNickname: string;
  fortune: PortalFortune;
  anniversary: PortalAnniversary | null;
  birthday: PortalBirthday | null;
  palaceLaw: PortalPalaceLaw;
  summary: [string, string, string?][];
  systems: unknown[];
  characters: PortalCharacter[];
  artworks: unknown[];
};

const rewardStatuses = new Set(['paid', 'pending', 'not_due']);
const milestoneKinds = new Set(['day10', 'hundred', 'annual']);

function validDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validMonthDay(month: unknown, day: unknown) {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(2024, Number(month) - 1, Number(day)));
  return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
}

function parseMilestone(value: unknown): PortalAnniversaryMilestone | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object') throw new Error('invalid response');
  const milestone = value as Record<string, unknown>;
  if (
    !validDateKey(milestone.date)
    || !nonNegativeInteger(milestone.days)
    || !nonNegativeInteger(milestone.points)
    || !Array.isArray(milestone.kinds)
    || milestone.kinds.some((kind) => typeof kind !== 'string' || !milestoneKinds.has(kind))
  ) throw new Error('invalid response');
  return {
    date: milestone.date,
    days: milestone.days,
    points: milestone.points,
    kinds: [...new Set(milestone.kinds)] as PortalAnniversaryMilestone['kinds'],
  };
}

function parsePortalAnniversary(value: unknown): PortalAnniversary | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object') throw new Error('invalid response');
  const anniversary = value as Record<string, unknown>;
  if (
    anniversary.joinedDate !== null && !validDateKey(anniversary.joinedDate)
    || anniversary.joinedDays !== null && !nonNegativeInteger(anniversary.joinedDays)
    || typeof anniversary.todayRewardStatus !== 'string'
    || !rewardStatuses.has(anniversary.todayRewardStatus)
  ) throw new Error('invalid response');
  return {
    joinedDate: anniversary.joinedDate as string | null,
    joinedDays: anniversary.joinedDays as number | null,
    nextMilestone: parseMilestone(anniversary.nextMilestone),
    todayMilestone: parseMilestone(anniversary.todayMilestone),
    todayRewardStatus: anniversary.todayRewardStatus as PortalAnniversary['todayRewardStatus'],
  };
}

function parsePortalBirthday(value: unknown): PortalBirthday | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object') throw new Error('invalid response');
  const birthday = value as Record<string, unknown>;
  const registered = birthday.registered;
  const month = birthday.month;
  const day = birthday.day;
  const observed = birthday.leapDayObservedOn;
  if (
    typeof registered !== 'boolean'
    || typeof birthday.isToday !== 'boolean'
    || typeof birthday.rewardStatus !== 'string'
    || !rewardStatuses.has(birthday.rewardStatus)
    || (month !== null && (!Number.isInteger(month) || Number(month) < 1 || Number(month) > 12))
    || (day !== null && (!Number.isInteger(day) || Number(day) < 1 || Number(day) > 31))
    || (observed !== null && observed !== '02-28' && observed !== '03-01')
    || (registered && (month === null || day === null))
    || (registered && !validMonthDay(month, day))
    || (!registered && (month !== null || day !== null || observed !== null || birthday.isToday))
    || (!registered && birthday.rewardStatus !== 'not_due')
    || (observed !== null && !(month === 2 && day === 29))
  ) throw new Error('invalid response');
  return {
    registered,
    month: month as number | null,
    day: day as number | null,
    leapDayObservedOn: observed as PortalBirthday['leapDayObservedOn'],
    isToday: birthday.isToday,
    rewardStatus: birthday.rewardStatus as PortalBirthday['rewardStatus'],
  };
}

const palaceLawTypes = new Set(['none', 'combat', 'growth', 'commerce', 'enhancement']);

function parsePortalPalaceLaw(value: unknown): PortalPalaceLaw {
  if (value === undefined) {
    return {
      type: 'none',
      name: '없음',
      description: '현재 왕궁 점령자가 새로운 법령을 선포할 수 있습니다.',
      proclaimedAt: null,
      nextChangeAt: null,
      enhancementUsedToday: false,
    };
  }
  if (!value || typeof value !== 'object') throw new Error('invalid response');
  const law = value as Record<string, unknown>;
  if (
    typeof law.type !== 'string' || !palaceLawTypes.has(law.type)
    || typeof law.name !== 'string' || !law.name.trim() || law.name.length > 40
    || typeof law.description !== 'string' || !law.description.trim() || law.description.length > 160
    || law.proclaimedAt !== null && (typeof law.proclaimedAt !== 'string' || !Number.isFinite(Date.parse(law.proclaimedAt)))
    || law.nextChangeAt !== null && (typeof law.nextChangeAt !== 'string' || !Number.isFinite(Date.parse(law.nextChangeAt)))
    || typeof law.enhancementUsedToday !== 'boolean'
    || law.type === 'none' && (law.proclaimedAt !== null || law.nextChangeAt !== null)
  ) throw new Error('invalid response');
  return {
    type: law.type as PortalPalaceLaw['type'],
    name: law.name,
    description: law.description,
    proclaimedAt: law.proclaimedAt as string | null,
    nextChangeAt: law.nextChangeAt as string | null,
    enhancementUsedToday: law.enhancementUsedToday,
  };
}

const fortuneTypes = new Set([
  'boss_damage',
  'tower_damage',
  'raid_damage',
  'exp_gain',
  'gold_gain',
  'chat_gold',
  'shop_discount',
]);

function parsePortalFortune(value: unknown): PortalFortune {
  if (value === undefined) return { active: false };
  if (!value || typeof value !== 'object') throw new Error('invalid response');
  const fortune = value as Record<string, unknown>;
  if (fortune.active === false) return { active: false };
  if (
    fortune.active !== true
    || typeof fortune.type !== 'string' || !fortuneTypes.has(fortune.type)
    || typeof fortune.name !== 'string' || !fortune.name.trim() || fortune.name.length > 40
    || typeof fortune.description !== 'string' || !fortune.description.trim() || fortune.description.length > 160
    || typeof fortune.expiresAt !== 'string' || !Number.isFinite(Date.parse(fortune.expiresAt))
  ) throw new Error('invalid response');
  return {
    active: true,
    type: fortune.type as Extract<PortalFortune, { active: true }>['type'],
    name: fortune.name,
    description: fortune.description,
    expiresAt: fortune.expiresAt,
  };
}

const genderAliases: Record<string, PortalGender> = {
  male: 'male',
  m: 'male',
  man: 'male',
  남자: 'male',
  남성: 'male',
  female: 'female',
  f: 'female',
  woman: 'female',
  여자: 'female',
  여성: 'female',
};

function normalizePortalGender(value: unknown): PortalGender {
  if (typeof value !== 'string') return 'unknown';
  return genderAliases[value.trim().toLowerCase()] ?? 'unknown';
}

export function parsePortalDashboard(value: unknown): PortalDashboard {
  if (!value || typeof value !== 'object') throw new Error('invalid response');
  const data = value as Record<string, unknown>;
  const meta = data.meta as Record<string, unknown> | undefined;
  if (
    !meta || meta.version !== 1
    || typeof meta.generatedAt !== 'string' || !Number.isFinite(Date.parse(meta.generatedAt))
    || !Array.isArray(data.summary) || !Array.isArray(data.systems)
    || !Array.isArray(data.artworks)
  ) throw new Error('invalid response');
  const rawCharacters = Array.isArray(data.characters) ? data.characters : [];
  const jobs = new Set<string>();
  const characters = rawCharacters.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('invalid response');
    const character = candidate as Record<string, unknown>;
    if (
      typeof character.id !== 'string'
      || !['warrior', 'archer', 'mage'].includes(String(character.job))
      || jobs.has(String(character.job))
      || (character.gender !== undefined && !['male', 'female', 'unknown'].includes(String(character.gender)))
      || (character.current !== undefined && typeof character.current !== 'boolean')
    ) throw new Error('invalid response');
    jobs.add(String(character.job));
    return {
      ...character,
      gender: character.gender ?? 'unknown',
    } as PortalCharacter;
  });
  return {
    meta: {
      version: meta.version,
      generatedAt: meta.generatedAt,
    },
    accountGender: normalizePortalGender(data.accountGender),
    accountNickname: typeof data.accountNickname === 'string' ? data.accountNickname : '',
    fortune: parsePortalFortune(data.fortune),
    anniversary: parsePortalAnniversary(data.anniversary),
    birthday: parsePortalBirthday(data.birthday),
    palaceLaw: parsePortalPalaceLaw(data.palaceLaw),
    summary: data.summary as PortalDashboard['summary'],
    systems: data.systems,
    characters,
    artworks: data.artworks,
  };
}
