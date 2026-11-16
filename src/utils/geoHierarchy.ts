/**
 * Geographic Hierarchy & Relevance Utility
 *
 * Implements 4-tier location prioritisation:
 * - Tier 0: Official Sabi Sweat content (isOfficial = true)
 * - Tier 1: Exact Region (same country and region)
 * - Tier 2: Same Country
 * - Tier 3: Nearby / Neighbouring Countries
 * - Tier 4: Global / Other
 */

export const NEIGHBORING_COUNTRIES: Record<string, string[]> = {
  NG: ['BJ', 'NE', 'TD', 'CM', 'GH', 'TG', 'CI'], // Nigeria & ECOWAS/Central neighbours
  GH: ['TG', 'BF', 'CI', 'NG', 'BJ'],             // Ghana & West Africa neighbours
  KE: ['UG', 'TZ', 'ET', 'SS', 'SO', 'RW'],       // Kenya & East Africa
  UG: ['KE', 'TZ', 'RW', 'SS', 'CD'],             // Uganda
  TZ: ['KE', 'UG', 'RW', 'BI', 'MZ', 'MW', 'ZM'], // Tanzania
  ZA: ['NA', 'BW', 'ZW', 'MZ', 'SZ', 'LS'],       // South Africa
  GB: ['IE', 'FR', 'NL', 'BE'],                   // United Kingdom
  IE: ['GB', 'FR'],                               // Ireland
  US: ['CA', 'MX'],                               // United States
  CA: ['US'],                                     // Canada
  AE: ['SA', 'OM', 'QA', 'KW', 'BH'],             // UAE
  SA: ['AE', 'OM', 'QA', 'KW', 'BH', 'JO', 'YE'], // Saudi Arabia
  EG: ['LY', 'SD', 'IL', 'SA'],                   // Egypt
  RW: ['UG', 'TZ', 'BI', 'CD'],                   // Rwanda
  CM: ['NG', 'TD', 'CF', 'CG', 'GA', 'GQ'],       // Cameroon
  CI: ['GH', 'LR', 'GN', 'ML', 'BF'],             // Ivory Coast
  SN: ['MR', 'ML', 'GN', 'GW', 'GM'],             // Senegal
};

export interface GeoRankingTarget {
  isOfficial?: boolean;
  country?: string | null;
  region?: string | null;
  countries?: Array<{ countryCode?: string; country?: string; regions?: string[] }> | null;
  locationScope?: string | null;
}

/**
 * Returns a priority score where lower numbers indicate higher relevance:
 * 0: Official content
 * 1: Exact region match
 * 2: Same country match
 * 3: Neighbouring country match
 * 4: Global / Other
 */
export function getGeoPriority(
  userCountry?: string | null,
  userRegion?: string | null,
  target?: GeoRankingTarget
): number {
  if (target?.isOfficial) {
    return 0;
  }

  const uCountry = userCountry?.trim().toUpperCase();
  const uRegion = userRegion?.trim().toLowerCase();

  if (!uCountry) {
    return 4;
  }

  // Check multi-country clubs/items
  if (target?.countries && target.countries.length > 0) {
    let bestTier = 4;
    for (const c of target.countries) {
      const cCode = c.countryCode?.trim().toUpperCase() || c.country?.trim().toUpperCase();
      if (cCode === uCountry) {
        if (uRegion && c.regions && c.regions.some((r) => r.trim().toLowerCase() === uRegion)) {
          return 1; // Exact region match
        }
        if (bestTier > 2) bestTier = 2; // Same country
      } else if (cCode && NEIGHBORING_COUNTRIES[uCountry]?.includes(cCode)) {
        if (bestTier > 3) bestTier = 3; // Neighbouring
      }
    }
    return bestTier;
  }

  const tCountry = target?.country?.trim().toUpperCase();
  const tRegion = target?.region?.trim().toLowerCase();

  // Single country check
  if (tCountry && tCountry === uCountry) {
    if (uRegion && tRegion && tRegion === uRegion) {
      return 1; // Exact region match
    }
    return 2; // Same country
  }

  if (tCountry && NEIGHBORING_COUNTRIES[uCountry]?.includes(tCountry)) {
    return 3; // Neighbouring country
  }

  return 4; // Global or other
}

