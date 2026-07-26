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

export type PortalDashboard = {
  meta: { version: number; uid: string; generatedAt: string };
  summary: [string, string, string?][];
  systems: unknown[];
  characters: PortalCharacter[];
  artworks: unknown[];
};

export function parsePortalDashboard(value: unknown, expectedUid: string): PortalDashboard {
  if (!value || typeof value !== 'object') throw new Error('invalid response');
  const data = value as Record<string, unknown>;
  const meta = data.meta as Record<string, unknown> | undefined;
  if (
    !meta || meta.version !== 1 || meta.uid !== expectedUid
    || typeof meta.generatedAt !== 'string' || !Number.isFinite(Date.parse(meta.generatedAt))
    || !Array.isArray(data.summary) || !Array.isArray(data.systems)
    || !Array.isArray(data.characters) || !Array.isArray(data.artworks)
  ) throw new Error('invalid response');
  const jobs = new Set<string>();
  const characters = data.characters.map((candidate) => {
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
  return { ...(data as PortalDashboard), characters };
}
