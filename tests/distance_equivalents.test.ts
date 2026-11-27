import {
  LAUNCH_DISTANCE_EQUIVALENTS,
  buildDistanceEquivalentSentence,
  deriveFlagEmoji,
  formatDistanceMultiplier,
  formatPlaceLabel,
  formatUnitDistanceLabel,
  normalizeCountryToIsoCode,
  selectDistanceEquivalent,
  type DistanceEquivalentConfig,
} from '../src/services/distanceEquivalentsService';

describe('Distance Equivalents Engine', () => {
  describe('Launch library config (20 entries)', () => {
    it('contains exactly 20 launch entries: 15 places and 5 global races', () => {
      expect(LAUNCH_DISTANCE_EQUIVALENTS).toHaveLength(20);
      const photoEntries = LAUNCH_DISTANCE_EQUIVALENTS.filter((e) => e.card === 'photo');
      const compactRaces = LAUNCH_DISTANCE_EQUIVALENTS.filter((e) => e.card === 'compact');
      expect(photoEntries).toHaveLength(15);
      expect(compactRaces).toHaveLength(5);
      expect(compactRaces.every((r) => r.country_codes.length === 0 && r.region === 'Race')).toBe(true);
    });

    it('reflects brief updates: 6th October Bridge (20,500 m), English Channel (33,300 m), no Sea Point Promenade', () => {
      const ids = LAUNCH_DISTANCE_EQUIVALENTS.map((e) => e.id);
      expect(ids).not.toContain('sea_point_promenade');

      const sixthOct = LAUNCH_DISTANCE_EQUIVALENTS.find((e) => e.id === '6th_october_bridge');
      expect(sixthOct?.distance_m).toBe(20500);
      expect(sixthOct?.country_codes).toEqual(['EG']);

      const channel = LAUNCH_DISTANCE_EQUIVALENTS.find((e) => e.id === 'english_channel_narrowest');
      expect(channel?.distance_m).toBe(33300);
      expect(channel?.country_codes).toEqual(['GB', 'FR']);
    });

    it('uses neutral movement copy (never walked/ran/crossed on foot) and length phrasing for bridges/channel', () => {
      for (const entry of LAUNCH_DISTANCE_EQUIVALENTS) {
        expect(entry.phrase.toLowerCase()).not.toMatch(/\b(walked|ran|crossed)\b/);
        if (entry.name.includes('Bridge') || entry.name.includes('Sea Link') || entry.name.includes('Channel')) {
          expect(entry.phrase.toLowerCase()).toContain('the length of');
        }
      }
    });
  });

  describe('Multiplier formatting (always round down)', () => {
    it('formats under 10 to 1 decimal rounded down, dropping .0 on whole numbers', () => {
      expect(formatDistanceMultiplier(8.657)).toEqual({
        displayValue: 8.6,
        displayText: '8.6×',
        isWholeDisplay: false,
      });
      expect(formatDistanceMultiplier(5.0)).toEqual({
        displayValue: 5,
        displayText: '5×',
        isWholeDisplay: true,
      });
      expect(formatDistanceMultiplier(5.09)).toEqual({
        displayValue: 5,
        displayText: '5×',
        isWholeDisplay: true,
      });
      expect(formatDistanceMultiplier(1.8198)).toEqual({
        displayValue: 1.8,
        displayText: '1.8×',
        isWholeDisplay: false,
      });
    });

    it('formats 10 and over to a whole number rounded down', () => {
      expect(formatDistanceMultiplier(15.735)).toEqual({
        displayValue: 15,
        displayText: '15×',
        isWholeDisplay: true,
      });
      expect(formatDistanceMultiplier(10.99)).toEqual({
        displayValue: 10,
        displayText: '10×',
        isWholeDisplay: true,
      });
    });
  });

  describe('Sentence builder', () => {
    it('builds exact brief examples for 1..<2, whole number >=2, and fractional >=2', () => {
      // 1 to under 2
      const thirdMainlandMult = 15000 / 11800; // 1.27
      expect(
        buildDistanceEquivalentSentence(
          'the length of the Third Mainland Bridge',
          thirdMainlandMult,
          formatDistanceMultiplier(thirdMainlandMult),
          'this week'
        )
      ).toBe("You've covered the length of the Third Mainland Bridge this week.");

      // Whole displayed multiplier (21.4 km / 1.36 km = 15.735 -> 15×)
      const lekkiMult = 21400 / 1360;
      expect(
        buildDistanceEquivalentSentence(
          'the length of the Lekki-Ikoyi Link Bridge',
          lekkiMult,
          formatDistanceMultiplier(lekkiMult),
          'this week'
        )
      ).toBe("You've covered the length of the Lekki-Ikoyi Link Bridge 15 times this week.");

      // Fractional displayed multiplier (60.6 km / 7 km = 8.657 -> 8.6×)
      const marinaMult = 60600 / 7000;
      expect(
        buildDistanceEquivalentSentence(
          'the full Dubai Marina Walk',
          marinaMult,
          formatDistanceMultiplier(marinaMult),
          'this week'
        )
      ).toBe("You've covered the full Dubai Marina Walk more than 8 times this week.");
    });
  });

  describe('Selection rules (international first, fallback to local)', () => {
    it('prefers international entries over local entries when both are eligible', () => {
      const lagosResult = selectDistanceEquivalent({
        userId: 'user-lagos',
        weekStartDate: '2026-11-21',
        distanceMeters: 21400,
        countryCode: 'NG',
        entries: LAUNCH_DISTANCE_EQUIVALENTS,
      });
      expect(lagosResult).not.toBeNull();
      expect(lagosResult!.countryCodes).not.toContain('NG');
      expect(lagosResult!.multiplier).toBeGreaterThanOrEqual(1);
      expect(lagosResult!.multiplier).toBeLessThanOrEqual(30);

      const londonResult = selectDistanceEquivalent({
        userId: 'user-london',
        weekStartDate: '2026-11-21',
        distanceMeters: 60600,
        countryCode: 'GB',
        entries: LAUNCH_DISTANCE_EQUIVALENTS,
      });
      expect(londonResult).not.toBeNull();
      expect(londonResult!.countryCodes).not.toContain('GB');
    });

    it('falls back to local entries when no international entry is eligible', () => {
      const onlyLocalEntries: DistanceEquivalentConfig[] = LAUNCH_DISTANCE_EQUIVALENTS.map((e) => ({
        ...e,
        active: e.country_codes.includes('NG'),
      }));

      const week1 = selectDistanceEquivalent({
        userId: 'user-lagos',
        weekStartDate: '2026-11-14',
        distanceMeters: 21400,
        countryCode: 'NG',
        entries: onlyLocalEntries,
      });
      expect(week1).not.toBeNull();
      expect(['lekki_ikoyi_link_bridge', 'third_mainland_bridge']).toContain(week1!.id);

      const week2 = selectDistanceEquivalent({
        userId: 'user-lagos',
        weekStartDate: '2026-11-21',
        distanceMeters: 21400,
        countryCode: 'NG',
        entries: onlyLocalEntries,
        previousEquivalentId: week1!.id,
      });
      expect(week2).not.toBeNull();
      expect(['lekki_ikoyi_link_bridge', 'third_mainland_bridge']).toContain(week2!.id);
      expect(week2!.id).not.toBe(week1!.id);
    });

    it('Toronto (CA), 60.6 km -> picks an eligible global entry with 1 <= multiplier <= 30', () => {
      const result = selectDistanceEquivalent({
        userId: 'user-toronto',
        weekStartDate: '2026-11-21',
        distanceMeters: 60600,
        countryCode: 'CA',
        entries: LAUNCH_DISTANCE_EQUIVALENTS,
      });
      expect(result).not.toBeNull();
      expect(result!.multiplier).toBeGreaterThanOrEqual(1);
      expect(result!.multiplier).toBeLessThanOrEqual(30);
    });

    it('returns null when distance is under 198 m (nothing eligible)', () => {
      const result = selectDistanceEquivalent({
        userId: 'user-short',
        weekStartDate: '2026-11-21',
        distanceMeters: 197,
        countryCode: 'NG',
        entries: LAUNCH_DISTANCE_EQUIVALENTS,
      });
      expect(result).toBeNull();
    });

    it('keeps the same pick when pinnedEquivalentId is active and eligible, and re-selects if deactivated', () => {
      const pinned = selectDistanceEquivalent({
        userId: 'user-sticky',
        weekStartDate: '2026-11-21',
        distanceMeters: 21400,
        countryCode: 'NG',
        entries: LAUNCH_DISTANCE_EQUIVALENTS,
        pinnedEquivalentId: 'third_mainland_bridge',
      });
      expect(pinned?.id).toBe('third_mainland_bridge');

      // Now switch active to false on third_mainland_bridge
      const updatedEntries: DistanceEquivalentConfig[] = LAUNCH_DISTANCE_EQUIVALENTS.map((e) =>
        e.id === 'third_mainland_bridge' ? { ...e, active: false } : e
      );
      const afterDeactivate = selectDistanceEquivalent({
        userId: 'user-sticky',
        weekStartDate: '2026-11-21',
        distanceMeters: 21400,
        countryCode: 'NG',
        entries: updatedEntries,
        pinnedEquivalentId: 'third_mainland_bridge',
      });
      expect(afterDeactivate).not.toBeNull();
      expect(afterDeactivate?.id).not.toBe('third_mainland_bridge');
      expect(afterDeactivate?.countryCodes).not.toContain('NG');
    });

    it('falls back to compact card when image_url is null, and uses photo card when https image_url is set', () => {
      const withNullImg = selectDistanceEquivalent({
        userId: 'user-qa',
        weekStartDate: '2026-11-21',
        distanceMeters: 60600,
        countryCode: 'QA',
        entries: LAUNCH_DISTANCE_EQUIVALENTS,
        pinnedEquivalentId: 'doha_corniche',
      });
      expect(withNullImg?.card).toBe('compact');
      expect(withNullImg?.imageUrl).toBeNull();

      const withHttpsImg = selectDistanceEquivalent({
        userId: 'user-qa',
        weekStartDate: '2026-11-21',
        distanceMeters: 60600,
        countryCode: 'QA',
        entries: LAUNCH_DISTANCE_EQUIVALENTS.map((e) =>
          e.id === 'doha_corniche'
            ? { ...e, image_url: 'https://cdn.sabisweat.com/equivalents/doha-corniche.jpg' }
            : e
        ),
        pinnedEquivalentId: 'doha_corniche',
      });
      expect(withHttpsImg?.card).toBe('photo');
      expect(withHttpsImg?.imageUrl).toBe('https://cdn.sabisweat.com/equivalents/doha-corniche.jpg');
    });
  });

  describe('Helpers', () => {
    it('normalizes country names, ISO codes, and locales', () => {
      expect(normalizeCountryToIsoCode('Nigeria')).toBe('NG');
      expect(normalizeCountryToIsoCode('United Kingdom')).toBe('GB');
      expect(normalizeCountryToIsoCode('UAE')).toBe('AE');
      expect(normalizeCountryToIsoCode('en-NG')).toBe('NG');
      expect(normalizeCountryToIsoCode('en_GB')).toBe('GB');
      expect(normalizeCountryToIsoCode('US')).toBe('US');
      expect(normalizeCountryToIsoCode('')).toBeNull();
    });

    it('derives flags, place labels, and unit distance labels accurately', () => {
      expect(deriveFlagEmoji(['NG'])).toBe('🇳🇬');
      expect(deriveFlagEmoji(['ZM', 'ZW'])).toBe('🇿🇲 🇿🇼');
      expect(deriveFlagEmoji([])).toBe('🌍');

      expect(formatPlaceLabel('Dubai', ['AE'])).toBe('Dubai, United Arab Emirates');
      expect(formatPlaceLabel('Singapore', ['SG'])).toBe('Singapore');
      expect(formatPlaceLabel('Zambia / Zimbabwe', ['ZM', 'ZW'])).toBe('Zambia / Zimbabwe');

      expect(formatUnitDistanceLabel(42195)).toBe('42.195 km each');
      expect(formatUnitDistanceLabel(5000)).toBe('5 km each');
      expect(formatUnitDistanceLabel(198)).toBe('198 m each');
    });
  });
});
