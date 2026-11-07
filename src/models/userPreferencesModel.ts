/**
 * User Preferences Model & Validation
 *
 * Supports user preferences for:
 * - Distance Unit: "Kilometres" | "Miles" (Default: "Kilometres")
 * - Energy Unit: "Calories" | "Kilojoules" (Default: "Calories")
 * - Start of Week: "Saturday" | "Sunday" | "Monday" (Default: "Saturday")
 */

export type DistanceUnit = 'Kilometres' | 'Miles';
export type EnergyUnit = 'Calories' | 'Kilojoules';
export type StartOfWeek = 'Saturday' | 'Sunday' | 'Monday';

export interface UserPreferences {
  distanceUnit: DistanceUnit;
  energyUnit: EnergyUnit;
  startOfWeek: StartOfWeek;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  distanceUnit: 'Kilometres',
  energyUnit: 'Calories',
  startOfWeek: 'Saturday',
};

export const VALID_DISTANCE_UNITS: DistanceUnit[] = ['Kilometres', 'Miles'];
export const VALID_ENERGY_UNITS: EnergyUnit[] = ['Calories', 'Kilojoules'];
export const VALID_START_OF_WEEK: StartOfWeek[] = ['Saturday', 'Sunday', 'Monday'];

export const START_OF_WEEK_DAYS: Record<StartOfWeek, number> = {
  Sunday: 0,
  Monday: 1,
  Saturday: 6,
};

/**
 * Normalizes input distance unit, mapping "Kilometers" (US spelling) to canonical "Kilometres".
 */
export function normalizeDistanceUnit(val: any): DistanceUnit | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed === 'Kilometres' || trimmed === 'Miles') return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower === 'kilometres' || lower === 'kilometers') return 'Kilometres';
  if (lower === 'miles' || lower === 'mile') return 'Miles';
  return null;
}

/**
 * Normalizes input energy unit.
 */
export function normalizeEnergyUnit(val: any): EnergyUnit | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed === 'Calories' || trimmed === 'Kilojoules') return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower === 'calories' || lower === 'calorie' || lower === 'kcal') return 'Calories';
  if (lower === 'kilojoules' || lower === 'kilojoule' || lower === 'kj') return 'Kilojoules';
  return null;
}

/**
 * Normalizes start of week.
 */
export function normalizeStartOfWeek(val: any): StartOfWeek | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed === 'Saturday' || trimmed === 'Sunday' || trimmed === 'Monday') return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower === 'saturday') return 'Saturday';
  if (lower === 'sunday') return 'Sunday';
  if (lower === 'monday') return 'Monday';
  return null;
}

/**
 * Merges any raw preference object or null with system defaults.
 */
export function mergeWithDefaultPreferences(prefs?: any): UserPreferences {
  if (!prefs || typeof prefs !== 'object') {
    return { ...DEFAULT_USER_PREFERENCES };
  }
  return {
    distanceUnit: normalizeDistanceUnit(prefs.distanceUnit) || DEFAULT_USER_PREFERENCES.distanceUnit,
    energyUnit: normalizeEnergyUnit(prefs.energyUnit) || DEFAULT_USER_PREFERENCES.energyUnit,
    startOfWeek: normalizeStartOfWeek(prefs.startOfWeek) || DEFAULT_USER_PREFERENCES.startOfWeek,
  };
}

/**
 * Validates and sanitizes a PATCH payload for preferences.
 * Throws a 400 error if any specified field is invalid.
 */
export function validateAndSanitizePreferencesUpdate(input: any): Partial<UserPreferences> {
  if (!input || typeof input !== 'object') {
    throw {
      status: 400,
      error: 'validation_error',
      message: 'Request body must be an object with preference fields',
    };
  }

  const updates: Partial<UserPreferences> = {};

  if (input.distanceUnit !== undefined) {
    const normalized = normalizeDistanceUnit(input.distanceUnit);
    if (!normalized) {
      throw {
        status: 400,
        error: 'validation_error',
        message: `Invalid distanceUnit: "${input.distanceUnit}". Must be one of: ${VALID_DISTANCE_UNITS.join(', ')}`,
      };
    }
    updates.distanceUnit = normalized;
  }

  if (input.energyUnit !== undefined) {
    const normalized = normalizeEnergyUnit(input.energyUnit);
    if (!normalized) {
      throw {
        status: 400,
        error: 'validation_error',
        message: `Invalid energyUnit: "${input.energyUnit}". Must be one of: ${VALID_ENERGY_UNITS.join(', ')}`,
      };
    }
    updates.energyUnit = normalized;
  }

  if (input.startOfWeek !== undefined) {
    const normalized = normalizeStartOfWeek(input.startOfWeek);
    if (!normalized) {
      throw {
        status: 400,
        error: 'validation_error',
        message: `Invalid startOfWeek: "${input.startOfWeek}". Must be one of: ${VALID_START_OF_WEEK.join(', ')}`,
      };
    }
    updates.startOfWeek = normalized;
  }

  if (Object.keys(updates).length === 0) {
    throw {
      status: 400,
      error: 'validation_error',
      message: 'At least one valid preference field must be provided (distanceUnit, energyUnit, startOfWeek)',
    };
  }

  return updates;
}

/**
 * Resolves the start of week date (YYYY-MM-DD) for a given date and configured start day.
 * Default start day is Saturday.
 */
export function resolveWeekStartDate(todayStr: string, startOfWeek: StartOfWeek = 'Saturday'): string {
  const targetDay = START_OF_WEEK_DAYS[startOfWeek] ?? 6;
  const d = new Date(todayStr + 'T00:00:00Z');
  const currentDay = d.getUTCDay();
  const diff = (currentDay - targetDay + 7) % 7;
  
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().split('T')[0];
}
