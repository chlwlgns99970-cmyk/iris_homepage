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

export type PortalDashboard = {
  meta: { version: number; generatedAt: string };
  accountGender: PortalGender;
  accountNickname: string;
  summary: [string, string, string?][];
  systems: unknown[];
  characters: PortalCharacter[];
  artworks: unknown[];
};

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
    summary: data.summary as PortalDashboard['summary'],
    systems: data.systems,
    characters,
    artworks: data.artworks,
  };
}
