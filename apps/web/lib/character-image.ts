import type { PortalCharacter } from './api';

export type CharacterJob = PortalCharacter['job'];
export type CharacterGender = PortalCharacter['gender'];
export type CharacterImageVariant = 'card' | 'profile';

export const DEFAULT_PORTAL_CHARACTER: PortalCharacter = Object.freeze({
  id: 'warrior',
  job: 'warrior',
  gender: 'unknown',
  current: true,
});

// Display-only fallback: it never writes a character or UID back to the RPG service.
export function charactersWithDisplayFallback(
  characters: readonly PortalCharacter[] | undefined,
): readonly PortalCharacter[] {
  return characters?.length ? characters : [DEFAULT_PORTAL_CHARACTER];
}

const genderAliases: Record<string, CharacterGender> = {
  male: 'male',
  m: 'male',
  man: 'male',
  '남자': 'male',
  '남성': 'male',
  female: 'female',
  f: 'female',
  woman: 'female',
  '여자': 'female',
  '여성': 'female',
};

const jobAliases: Record<string, CharacterJob> = {
  warrior: 'warrior',
  '전사': 'warrior',
  archer: 'archer',
  '궁수': 'archer',
  mage: 'mage',
  '마법사': 'mage',
};

const characterImages: Record<CharacterJob, {
  fallback: string;
  profileFallback: string;
  male: string;
  female: string;
}> = {
  warrior: {
    fallback: '/assets/basic-warrior.webp',
    profileFallback: '/assets/basic-warrior-profile.webp',
    male: '/assets/characters/warrior-male.png',
    female: '/assets/characters/warrior-female.png',
  },
  archer: {
    fallback: '/assets/basic-archer.webp',
    profileFallback: '/assets/basic-archer-profile.webp',
    male: '/assets/characters/archer-male.png',
    female: '/assets/characters/archer-female.png',
  },
  mage: {
    fallback: '/assets/basic-mage.webp',
    profileFallback: '/assets/basic-mage-profile.webp',
    male: '/assets/characters/mage-male.png',
    female: '/assets/characters/mage-female.png',
  },
};

export function normalizeGender(value: unknown): CharacterGender {
  if (typeof value !== 'string') return 'unknown';
  return genderAliases[value.trim().toLowerCase()] ?? 'unknown';
}

export function normalizeJob(value: unknown): CharacterJob | 'unknown' {
  if (typeof value !== 'string') return 'unknown';
  return jobAliases[value.trim().toLowerCase()] ?? 'unknown';
}

export function resolveAccountGender(
  characters: readonly PortalCharacter[],
): CharacterGender {
  const current = characters.find((character) => character.current);
  const currentGender = normalizeGender(current?.gender);
  if (currentGender !== 'unknown') return currentGender;

  for (const character of characters) {
    const gender = normalizeGender(character.gender);
    if (gender !== 'unknown') return gender;
  }
  return 'unknown';
}

export function resolveEffectiveGender(
  characterGender: unknown,
  accountGender: unknown,
): CharacterGender {
  const normalizedCharacterGender = normalizeGender(characterGender);
  return normalizedCharacterGender !== 'unknown'
    ? normalizedCharacterGender
    : normalizeGender(accountGender);
}

export function resolveCharacterImage(
  job: CharacterJob,
  gender: unknown = 'unknown',
  variant: CharacterImageVariant = 'card',
) {
  const images = characterImages[job];
  const normalizedGender = normalizeGender(gender);
  if (normalizedGender === 'male' || normalizedGender === 'female') {
    return images[normalizedGender];
  }
  return variant === 'profile' ? images.profileFallback : images.fallback;
}
