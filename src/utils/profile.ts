import type { PlayerProfile } from './types';

/**
 * Character creation (player_profile_and_stats_v1 §1): the profile gates
 * flavour, never content (ADR-15). Everything here is pure so the form, the
 * save migration and the tests share one definition of "valid".
 */

export const NAME_MIN = 2;
export const NAME_MAX = 14;
export const AGE_MIN = 20;
export const AGE_MAX = 26;

export const GENDERS = ['M', 'F'] as const;
export type Gender = (typeof GENDERS)[number];

export const DEGREES = ['B.E/B.Tech', 'B.Sc', 'BCA', 'MCA', 'B.Com', 'Other'] as const;
export type Degree = (typeof DEGREES)[number];

/** 1 = light wheatish … 5 = deep brown (design system `c.skin.1..5`). */
export const SKIN_TONES = [1, 2, 3, 4, 5] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
  'Chandigarh', 'Andaman & Nicobar', 'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep',
  'Outside India',
] as const;

export const defaultProfile = (): PlayerProfile => ({
  name: '',
  gender: 'M',
  age: 22,
  hometown: { state: 'Karnataka', town: '' },
  college: '',
  degree: 'B.E/B.Tech',
  skin: 3,
});

/** Problems with a profile, empty when it is playable. Only `name` can block. */
export function validateProfile(profile: PlayerProfile): string[] {
  const problems: string[] = [];
  const name = profile.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    problems.push(`Name must be ${NAME_MIN}–${NAME_MAX} characters`);
  }
  if (!Number.isInteger(profile.age) || profile.age < AGE_MIN || profile.age > AGE_MAX) {
    problems.push(`Age must be ${AGE_MIN}–${AGE_MAX}`);
  }
  if (!GENDERS.includes(profile.gender)) problems.push('Gender must be M or F');
  if (!SKIN_TONES.includes(profile.skin)) problems.push('Skin tone must be 1–5');
  if (!DEGREES.includes(profile.degree)) problems.push('Unknown degree');
  return problems;
}

/**
 * Gender + skin assign the sprite (P1_P2 §2.1): no customisation beyond the
 * profile. Sheet keys match scripts/import-sheet.mjs: `player_<m|f>_<skin>`,
 * imported from src/assets/_raw/characters/player_<m|f>.png with the skin
 * remapped per tone. Age variants (bag/attire) wait for attire layers (T-022).
 */
export const sheetForProfile = (profile: PlayerProfile): string =>
  `player_${profile.gender.toLowerCase()}_${profile.skin}`;

/** Every sheet the pipeline must produce, so a validator can check the set. */
export const ALL_PLAYER_SHEETS: readonly string[] = GENDERS.flatMap((g) =>
  SKIN_TONES.map((s) => `player_${g.toLowerCase()}_${s}`),
);
