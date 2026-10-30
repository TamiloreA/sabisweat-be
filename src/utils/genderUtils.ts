/**
 * Gender utility functions
 * Normalizes input gender values to standard options:
 * - Female
 * - Male
 * - Non-binary
 * - Prefer not to say
 */

export type StandardGender = 'Female' | 'Male' | 'Non-binary' | 'Prefer not to say';

export const STANDARD_GENDERS: StandardGender[] = [
  'Female',
  'Male',
  'Non-binary',
  'Prefer not to say',
];

export function normalizeGender(val?: string | null): StandardGender | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'female' || lower === 'woman') {
    return 'Female';
  }
  if (lower === 'male' || lower === 'man') {
    return 'Male';
  }
  if (
    lower === 'non-binary' ||
    lower === 'nonbinary' ||
    lower === 'non_binary' ||
    lower === 'non binary'
  ) {
    return 'Non-binary';
  }
  if (
    lower === 'prefer not to say' ||
    lower === 'prefer_not_to_say' ||
    lower === 'others' ||
    lower === 'other'
  ) {
    return 'Prefer not to say';
  }

  // Exact match fallback
  if (STANDARD_GENDERS.includes(trimmed as StandardGender)) {
    return trimmed as StandardGender;
  }

  return null;
}
