import { supabase } from '../config/database';
import type { WeeklyReportDistanceEquivalent } from '../models/healthModel';

export interface DistanceEquivalentConfig {
  id: string;
  name: string;
  phrase: string;
  city: string;
  country_codes: string[];
  region: string;
  distance_m: number;
  card: 'photo' | 'compact';
  image_url: string | null;
  active: boolean;
}

export const DISTANCE_EQUIVALENTS_TABLE = 'distance_equivalents';
export const USER_WEEKLY_DISTANCE_EQUIVALENTS_TABLE = 'user_weekly_distance_equivalents';

export const MIN_MULTIPLIER = 1;
export const MAX_MULTIPLIER = 30;

/**
 * Default 20 launch comparisons (mirrors migration 039_distance_equivalents.sql).
 * Used as fallback ONLY if the remote config table has not been migrated yet.
 */
export const LAUNCH_DISTANCE_EQUIVALENTS: DistanceEquivalentConfig[] = [
  {
    id: 'lekki_ikoyi_link_bridge',
    name: 'Lekki-Ikoyi Link Bridge',
    phrase: 'the length of the Lekki-Ikoyi Link Bridge',
    city: 'Lagos',
    country_codes: ['NG'],
    region: 'Africa',
    distance_m: 1360,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'third_mainland_bridge',
    name: 'Third Mainland Bridge',
    phrase: 'the length of the Third Mainland Bridge',
    city: 'Lagos',
    country_codes: ['NG'],
    region: 'Africa',
    distance_m: 11800,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: '6th_october_bridge',
    name: '6th October Bridge',
    phrase: 'the length of the 6th October Bridge',
    city: 'Cairo',
    country_codes: ['EG'],
    region: 'Africa',
    distance_m: 20500,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'victoria_falls_bridge',
    name: 'Victoria Falls Bridge',
    phrase: 'the length of the Victoria Falls Bridge',
    city: 'Zambia / Zimbabwe',
    country_codes: ['ZM', 'ZW'],
    region: 'Africa',
    distance_m: 198,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'dubai_marina_walk',
    name: 'Dubai Marina Walk',
    phrase: 'the full Dubai Marina Walk',
    city: 'Dubai',
    country_codes: ['AE'],
    region: 'Middle East',
    distance_m: 7000,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'doha_corniche',
    name: 'Doha Corniche',
    phrase: 'the full Doha Corniche',
    city: 'Doha',
    country_codes: ['QA'],
    region: 'Middle East',
    distance_m: 7000,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'tower_bridge',
    name: 'Tower Bridge',
    phrase: 'the length of Tower Bridge',
    city: 'London',
    country_codes: ['GB'],
    region: 'Europe',
    distance_m: 244,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'champs_elysees',
    name: 'Champs-Élysées',
    phrase: 'the length of the Champs-Élysées',
    city: 'Paris',
    country_codes: ['FR'],
    region: 'Europe',
    distance_m: 1910,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'la_rambla',
    name: 'La Rambla',
    phrase: 'the length of La Rambla',
    city: 'Barcelona',
    country_codes: ['ES'],
    region: 'Europe',
    distance_m: 1200,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'english_channel_narrowest',
    name: 'English Channel at its narrowest',
    phrase: 'the length of the English Channel at its narrowest',
    city: 'Dover to Calais',
    country_codes: ['GB', 'FR'],
    region: 'Europe',
    distance_m: 33300,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'marina_bay_waterfront_promenade',
    name: 'Marina Bay Waterfront Promenade',
    phrase: 'the Marina Bay Waterfront Promenade',
    city: 'Singapore',
    country_codes: ['SG'],
    region: 'Asia',
    distance_m: 3500,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'bandra_worli_sea_link',
    name: 'Bandra-Worli Sea Link',
    phrase: 'the length of the Bandra-Worli Sea Link',
    city: 'Mumbai',
    country_codes: ['IN'],
    region: 'Asia',
    distance_m: 5600,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'golden_gate_bridge',
    name: 'Golden Gate Bridge',
    phrase: 'the length of the Golden Gate Bridge',
    city: 'San Francisco',
    country_codes: ['US'],
    region: 'North America',
    distance_m: 2737,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'copacabana_beach',
    name: 'Copacabana Beach',
    phrase: 'the length of Copacabana Beach',
    city: 'Rio de Janeiro',
    country_codes: ['BR'],
    region: 'South America',
    distance_m: 4000,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'bondi_to_coogee_coastal_walk',
    name: 'Bondi to Coogee Coastal Walk',
    phrase: 'the Bondi to Coogee Coastal Walk',
    city: 'Sydney',
    country_codes: ['AU'],
    region: 'Oceania',
    distance_m: 6000,
    card: 'photo',
    image_url: null,
    active: true,
  },
  {
    id: 'race_5k',
    name: '5K',
    phrase: 'a 5K',
    city: 'Global',
    country_codes: [],
    region: 'Race',
    distance_m: 5000,
    card: 'compact',
    image_url: null,
    active: true,
  },
  {
    id: 'race_10k',
    name: '10K',
    phrase: 'a 10K',
    city: 'Global',
    country_codes: [],
    region: 'Race',
    distance_m: 10000,
    card: 'compact',
    image_url: null,
    active: true,
  },
  {
    id: 'race_half_marathon',
    name: 'Half marathon',
    phrase: 'a half marathon',
    city: 'Global',
    country_codes: [],
    region: 'Race',
    distance_m: 21097.5,
    card: 'compact',
    image_url: null,
    active: true,
  },
  {
    id: 'race_marathon',
    name: 'Marathon',
    phrase: 'a marathon',
    city: 'Global',
    country_codes: [],
    region: 'Race',
    distance_m: 42195,
    card: 'compact',
    image_url: null,
    active: true,
  },
  {
    id: 'race_100k',
    name: '100K',
    phrase: 'a 100K',
    city: 'Global',
    country_codes: [],
    region: 'Race',
    distance_m: 100000,
    card: 'compact',
    image_url: null,
    active: true,
  },
];

const ISO_TO_COUNTRY_NAME: Record<string, string> = {
  NG: 'Nigeria',
  EG: 'Egypt',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
  AE: 'United Arab Emirates',
  QA: 'Qatar',
  GB: 'UK',
  FR: 'France',
  ES: 'Spain',
  SG: 'Singapore',
  IN: 'India',
  US: 'USA',
  BR: 'Brazil',
  AU: 'Australia',
  CA: 'Canada',
  ZA: 'South Africa',
  KE: 'Kenya',
  GH: 'Ghana',
  SA: 'Saudi Arabia',
  JP: 'Japan',
  DE: 'Germany',
  IT: 'Italy',
  NL: 'Netherlands',
  IE: 'Ireland',
};

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  nigeria: 'NG',
  egypt: 'EG',
  zambia: 'ZM',
  zimbabwe: 'ZW',
  'united arab emirates': 'AE',
  uae: 'AE',
  dubai: 'AE',
  qatar: 'QA',
  doha: 'QA',
  'united kingdom': 'GB',
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  france: 'FR',
  spain: 'ES',
  singapore: 'SG',
  india: 'IN',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  brazil: 'BR',
  brasil: 'BR',
  australia: 'AU',
  canada: 'CA',
  'south africa': 'ZA',
  kenya: 'KE',
  ghana: 'GH',
  'saudi arabia': 'SA',
  japan: 'JP',
  germany: 'DE',
  italy: 'IT',
  netherlands: 'NL',
  ireland: 'IE',
};

/**
 * Normalizes a profile country name or device region code into an ISO 3166-1 alpha-2 code.
 */
export function normalizeCountryToIsoCode(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (COUNTRY_NAME_TO_ISO[lower]) {
    return COUNTRY_NAME_TO_ISO[lower];
  }

  // Handle locale strings like "en-NG", "en_GB"
  const localeMatch = trimmed.match(/[-_]([A-Za-z]{2})$/);
  if (localeMatch) {
    return localeMatch[1].toUpperCase();
  }

  // Direct 2-letter ISO code
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return upper === 'UK' ? 'GB' : upper;
  }

  return null;
}

/**
 * Derives flag emoji(s) from ISO country codes. Global entries (empty codes) use 🌍.
 */
export function deriveFlagEmoji(countryCodes: string[]): string {
  if (!Array.isArray(countryCodes) || countryCodes.length === 0) {
    return '🌍';
  }
  return countryCodes
    .map((code) => {
      const upper = code.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(upper)) return '';
      return String.fromCodePoint(
        0x1f1e6 + (upper.charCodeAt(0) - 65),
        0x1f1e6 + (upper.charCodeAt(1) - 65)
      );
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Formats the secondary place label (city + country, or cross-border label, or Global).
 */
export function formatPlaceLabel(city: string, countryCodes: string[]): string {
  const cleanCity = (city || '').trim();
  if (!Array.isArray(countryCodes) || countryCodes.length === 0) {
    return cleanCity || 'Global';
  }
  if (countryCodes.length > 1) {
    if (cleanCity) return cleanCity;
    return countryCodes
      .map((c) => ISO_TO_COUNTRY_NAME[c.toUpperCase()] || c.toUpperCase())
      .join(' / ');
  }

  const code = countryCodes[0].trim().toUpperCase();
  const countryName = ISO_TO_COUNTRY_NAME[code] || code;
  if (!cleanCity || cleanCity.toLowerCase() === countryName.toLowerCase()) {
    return countryName;
  }
  return `${cleanCity}, ${countryName}`;
}

/**
 * Formats an entry's base distance for compact card subtitles (e.g. "42.195 km each", "198 m each").
 */
export function formatUnitDistanceLabel(distanceM: number): string {
  if (distanceM < 1000) {
    return `${Math.round(distanceM)} m each`;
  }
  const km = distanceM / 1000;
  // Strip trailing zeroes up to 4 decimals (preserves 42.195, 21.0975, 1.36, 5, 10, 100)
  const formatted = Number(km.toFixed(4)).toString();
  return `${formatted} km each`;
}

export interface FormattedMultiplier {
  displayValue: number;
  displayText: string;
  isWholeDisplay: boolean;
}

/**
 * Formats the multiplier following the brief's strict floor-rounding rules:
 * - Under 10: one decimal place, rounded down (8.657 -> "8.6×"). Whole numbers drop the decimal (5.0 -> "5×").
 * - 10 and over: whole number, rounded down (15.7 -> "15×").
 * Always rounds down so the app never claims more than the member covered.
 */
export function formatDistanceMultiplier(rawMultiplier: number): FormattedMultiplier {
  if (rawMultiplier >= 10) {
    const whole = Math.floor(rawMultiplier + 1e-9);
    return {
      displayValue: whole,
      displayText: `${whole}×`,
      isWholeDisplay: true,
    };
  }

  const flooredTenth = Math.floor(rawMultiplier * 10 + 1e-9) / 10;
  const isWhole = Math.abs(flooredTenth - Math.round(flooredTenth)) < 1e-9;
  if (isWhole) {
    const whole = Math.round(flooredTenth);
    return {
      displayValue: whole,
      displayText: `${whole}×`,
      isWholeDisplay: true,
    };
  }

  return {
    displayValue: Number(flooredTenth.toFixed(1)),
    displayText: `${flooredTenth.toFixed(1)}×`,
    isWholeDisplay: false,
  };
}

/**
 * Builds the copy sentence for a distance equivalent:
 * - 1 to under 2: "You've covered {phrase} {period}."
 * - Whole displayed multiplier (>= 2): "You've covered {phrase} {n} times {period}."
 * - Anything else (>= 2 with decimal): "You've covered {phrase} more than {n} times {period}."
 * Always uses "covered" (never "walked" or "ran").
 */
export function buildDistanceEquivalentSentence(
  phrase: string,
  rawMultiplier: number,
  formatted: FormattedMultiplier,
  periodLabel: string = 'this week'
): string {
  const cleanPhrase = phrase.trim();
  if (rawMultiplier < 2) {
    return `You've covered ${cleanPhrase} ${periodLabel}.`;
  }
  if (formatted.isWholeDisplay) {
    const wholeCount = Math.floor(formatted.displayValue + 1e-9);
    return `You've covered ${cleanPhrase} ${wholeCount} times ${periodLabel}.`;
  }
  const flooredCount = Math.floor(rawMultiplier + 1e-9);
  return `You've covered ${cleanPhrase} more than ${flooredCount} times ${periodLabel}.`;
}

/**
 * Deterministic 32-bit FNV-1a hash used to pick consistently per member per report period.
 */
function stableHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface SelectDistanceEquivalentParams {
  userId: string;
  weekStartDate: string;
  distanceMeters: number;
  countryCode: string | null;
  entries: DistanceEquivalentConfig[];
  pinnedEquivalentId?: string | null;
  previousEquivalentId?: string | null;
  periodLabel?: string;
}

/**
 * Pure selection engine implementing all display & selection rules from the Developer Brief.
 */
export function selectDistanceEquivalent(
  params: SelectDistanceEquivalentParams
): WeeklyReportDistanceEquivalent | null {
  const {
    userId,
    weekStartDate,
    distanceMeters,
    countryCode,
    entries,
    pinnedEquivalentId,
    previousEquivalentId,
    periodLabel = 'this week',
  } = params;

  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null;
  }

  // Filter active entries with multiplier in [1, 30]
  const eligible = entries.filter((entry) => {
    if (!entry.active) return false;
    if (!Number.isFinite(entry.distance_m) || entry.distance_m <= 0) return false;
    const mult = distanceMeters / entry.distance_m;
    return mult >= MIN_MULTIPLIER && mult <= MAX_MULTIPLIER;
  });

  if (eligible.length === 0) {
    return null;
  }

  let chosen: DistanceEquivalentConfig | undefined;

  // 1. Honor sticky pick for this report period if still active & eligible
  if (pinnedEquivalentId) {
    chosen = eligible.find((e) => e.id === pinnedEquivalentId);
  }

  if (!chosen) {
    // 2. Local first: if any eligible entry matches the member's country, pick from those
    const normalizedCountry = countryCode ? countryCode.trim().toUpperCase() : null;
    const localEligible = normalizedCountry
      ? eligible.filter((e) =>
          (e.country_codes || []).some((c) => c.trim().toUpperCase() === normalizedCountry)
        )
      : [];

    let pool = localEligible.length > 0 ? localEligible : eligible;

    // 3. Skip the entry shown in the member's previous report, unless it is the only one eligible
    if (previousEquivalentId && pool.length > 1) {
      const withoutPrevious = pool.filter((e) => e.id !== previousEquivalentId);
      if (withoutPrevious.length > 0) {
        pool = withoutPrevious;
      }
    }

    // 4. Deterministic selection per member per report period
    const sortedPool = [...pool].sort((a, b) => a.id.localeCompare(b.id));
    const idx = stableHash(`${userId}:${weekStartDate}`) % sortedPool.length;
    chosen = sortedPool[idx];
  }

  const rawMultiplier = distanceMeters / chosen.distance_m;
  const formatted = formatDistanceMultiplier(rawMultiplier);
  const countryCodes = Array.isArray(chosen.country_codes)
    ? chosen.country_codes.map((c) => c.trim().toUpperCase()).filter(Boolean)
    : [];

  const sanitizedImageUrl =
    typeof chosen.image_url === 'string' && chosen.image_url.trim().startsWith('https://')
      ? chosen.image_url.trim()
      : null;

  return {
    id: chosen.id,
    name: chosen.name,
    phrase: chosen.phrase,
    city: chosen.city,
    countryCodes,
    placeLabel: formatPlaceLabel(chosen.city, countryCodes),
    flagEmoji: deriveFlagEmoji(countryCodes),
    region: chosen.region,
    distanceM: Number(chosen.distance_m),
    unitDistanceLabel: formatUnitDistanceLabel(Number(chosen.distance_m)),
    card: chosen.card === 'photo' && sanitizedImageUrl ? 'photo' : 'compact',
    imageUrl: sanitizedImageUrl,
    multiplier: Math.round(rawMultiplier * 1000) / 1000,
    displayMultiplier: formatted.displayText,
    displayNumericMultiplier: formatted.displayValue,
    sentence: buildDistanceEquivalentSentence(chosen.phrase, rawMultiplier, formatted, periodLabel),
  };
}

function isMissingTableError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  );
}

/**
 * Loads all distance equivalent entries from remote config (Supabase table).
 * Falls back to LAUNCH_DISTANCE_EQUIVALENTS only when the table has not been created yet.
 */
export async function loadDistanceEquivalentsConfig(): Promise<DistanceEquivalentConfig[]> {
  try {
    const { data, error } = await supabase
      .from(DISTANCE_EQUIVALENTS_TABLE)
      .select('id, name, phrase, city, country_codes, region, distance_m, card, image_url, active');

    if (error) {
      if (isMissingTableError(error)) {
        return LAUNCH_DISTANCE_EQUIVALENTS;
      }
      console.warn('[distanceEquivalents] Error loading config table:', error.message);
      return LAUNCH_DISTANCE_EQUIVALENTS;
    }

    if (!Array.isArray(data)) {
      return LAUNCH_DISTANCE_EQUIVALENTS;
    }

    return data.map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      phrase: String(row.phrase),
      city: String(row.city ?? ''),
      country_codes: Array.isArray(row.country_codes) ? row.country_codes : [],
      region: String(row.region ?? ''),
      distance_m: Number(row.distance_m),
      card: row.card === 'photo' ? 'photo' : 'compact',
      image_url: typeof row.image_url === 'string' && row.image_url.trim() ? row.image_url.trim() : null,
      active: Boolean(row.active),
    }));
  } catch (err) {
    console.warn('[distanceEquivalents] Unexpected error loading config:', err);
    return LAUNCH_DISTANCE_EQUIVALENTS;
  }
}

/**
 * Resolves and persists the distance equivalent for a member's weekly report.
 */
export async function resolveWeeklyDistanceEquivalent(params: {
  userId: string;
  weekStartDate: string;
  distanceMeters: number;
  profileCountry?: string | null;
  deviceRegion?: string | null;
  periodLabel?: string;
}): Promise<WeeklyReportDistanceEquivalent | null> {
  const {
    userId,
    weekStartDate,
    distanceMeters,
    profileCountry,
    deviceRegion,
    periodLabel = 'this week',
  } = params;

  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null;
  }

  const entries = await loadDistanceEquivalentsConfig();
  const countryCode =
    normalizeCountryToIsoCode(profileCountry) || normalizeCountryToIsoCode(deviceRegion);

  let pinnedEquivalentId: string | null = null;
  let previousEquivalentId: string | null = null;
  let persistenceAvailable = true;

  try {
    const [currentPickRes, prevPickRes] = await Promise.all([
      supabase
        .from(USER_WEEKLY_DISTANCE_EQUIVALENTS_TABLE)
        .select('equivalent_id')
        .eq('user_id', userId)
        .eq('week_start_date', weekStartDate)
        .maybeSingle(),
      supabase
        .from(USER_WEEKLY_DISTANCE_EQUIVALENTS_TABLE)
        .select('equivalent_id')
        .eq('user_id', userId)
        .lt('week_start_date', weekStartDate)
        .order('week_start_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (currentPickRes.error && isMissingTableError(currentPickRes.error)) {
      persistenceAvailable = false;
    } else {
      pinnedEquivalentId = currentPickRes.data?.equivalent_id ?? null;
      previousEquivalentId = prevPickRes.data?.equivalent_id ?? null;
    }
  } catch {
    persistenceAvailable = false;
  }

  const selected = selectDistanceEquivalent({
    userId,
    weekStartDate,
    distanceMeters,
    countryCode,
    entries,
    pinnedEquivalentId,
    previousEquivalentId,
    periodLabel,
  });

  if (selected && persistenceAvailable && selected.id !== pinnedEquivalentId) {
    try {
      await supabase
        .from(USER_WEEKLY_DISTANCE_EQUIVALENTS_TABLE)
        .upsert(
          {
            user_id: userId,
            week_start_date: weekStartDate,
            equivalent_id: selected.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,week_start_date' }
        );
    } catch (err) {
      console.warn('[distanceEquivalents] Failed to persist weekly pick:', err);
    }
  }

  return selected;
}
