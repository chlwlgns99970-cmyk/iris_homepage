import type { PortalCharacter } from './api';

export type CharacterJob = PortalCharacter['job'];
export type CharacterGender = PortalCharacter['gender'];
export type CharacterImageVariant = 'card' | 'profile';

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

export function resolveAccountGender(
  characters: readonly PortalCharacter[],
): CharacterGender {
  const current = characters.find((character) => character.current);
  if (current) return current.gender;

  return characters.find(
    (character) => character.gender === 'male' || character.gender === 'female',
  )?.gender ?? 'unknown';
}

export function resolveCharacterImage(
  job: CharacterJob,
  gender: CharacterGender = 'unknown',
  variant: CharacterImageVariant = 'card',
) {
  const images = characterImages[job];
  if (gender === 'male' || gender === 'female') return images[gender];
  return variant === 'profile' ? images.profileFallback : images.fallback;
}
