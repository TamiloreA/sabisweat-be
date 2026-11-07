/**
 * User Preferences & Weekly Report Alignment Tests
 *
 * Tests:
 * 1. User preferences schema, defaults, normalization, and validation
 * 2. Week start date resolution (Saturday, Sunday, Monday)
 * 3. User service preference retrieval and updates
 * 4. User controller endpoints: getMe, updateMe, updatePreferences
 * 5. Weekly report controller & service with omitted weekStartDate and preference alignment
 * 6. Home summary preferences inclusion
 */

import {
  DEFAULT_USER_PREFERENCES,
  normalizeDistanceUnit,
  normalizeEnergyUnit,
  normalizeStartOfWeek,
  mergeWithDefaultPreferences,
  validateAndSanitizePreferencesUpdate,
  resolveWeekStartDate,
} from '../src/models/userPreferencesModel';
import * as userController from '../src/controllers/userController';
import * as healthController from '../src/controllers/healthController';
import * as onboardingController from '../src/controllers/onboardingController';
import * as homeController from '../src/controllers/homeController';
import * as userService from '../src/services/userService';
import * as healthService from '../src/services/healthService';
import * as homeService from '../src/services/homeService';

function createMockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

const mockProfileRow: any = {
  id: 'test-user-123',
  email: 'test@sabisweat.com',
  username: 'testrunner',
  first_name: 'Test',
  last_name: 'Runner',
  photo_url: 'https://example.com/avatar.jpg',
  photo_base64: null,
  avatar_id: null,
  city: 'Lagos',
  referral_code: 'SABI1234',
  gender: 'Female',
  date_of_birth: '1995-05-15',
  sabi_level: 'Strider',
  steps_count: 50000,
  points_balance: 1200,
  step_goal: 8000,
  has_password: true,
  onboarding_status: 'completed',
  leaderboard_visible: true,
  sharing_default: true,
  streak_count: 5,
  preferences: {
    distanceUnit: 'Kilometres',
    energyUnit: 'Calories',
    startOfWeek: 'Saturday',
  },
  finished_onboarded_at: '2026-10-01T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const mockDailySteps = [
  { date: '2026-11-07', steps: 8500, distance_km: 6.2, active_calories: 320, user_id: 'test-user-123' },
  { date: '2026-11-08', steps: 9200, distance_km: 7.1, active_calories: 350, user_id: 'test-user-123' },
  { date: '2026-11-09', steps: 11000, distance_km: 8.5, active_calories: 420, user_id: 'test-user-123' },
  { date: '2026-11-10', steps: 7800, distance_km: 5.9, active_calories: 290, user_id: 'test-user-123' },
  { date: '2026-11-11', steps: 10400, distance_km: 8.0, active_calories: 390, user_id: 'test-user-123' },
  { date: '2026-11-12', steps: 9000, distance_km: 6.8, active_calories: 340, user_id: 'test-user-123' },
  { date: '2026-11-13', steps: 12000, distance_km: 9.2, active_calories: 460, user_id: 'test-user-123' },
];

// Mock database operations
jest.mock('../src/config/database', () => {
  let profileStore: any = {
    id: 'test-user-123',
    email: 'test@sabisweat.com',
    username: 'testrunner',
    first_name: 'Test',
    last_name: 'Runner',
    photo_url: 'https://example.com/avatar.jpg',
    photo_base64: null,
    avatar_id: null,
    city: 'London',
    country: 'United Kingdom',
    region: 'London',
    movement_relationship: 'CONSISTENT',
    race: 'Black / African',
    specific_subgroup: 'Nigerian',
    referral_code: 'SABI1234',
    gender: 'Female',
    date_of_birth: '1995-05-15',
    sabi_level: 'Strider',
    steps_count: 50000,
    points_balance: 1200,
    step_goal: 8000,
    has_password: true,
    onboarding_status: 'completed',
    leaderboard_visible: true,
    sharing_default: true,
    streak_count: 5,
    preferences: {
      distanceUnit: 'Kilometres',
      energyUnit: 'Calories',
      startOfWeek: 'Saturday',
    },
    finished_onboarded_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };

  const buildQuery = () => {
    let filterField: string | null = null;
    let filterValue: any = null;
    let neqField: string | null = null;
    let neqValue: any = null;
    let gteValue: any = null;
    let lteValue: any = null;
    let updatePayload: any = null;

    const builder: any = {
      select: () => builder,
      eq: (field: string, val: any) => {
        filterField = field;
        filterValue = val;
        return builder;
      },
      neq: (field: string, val: any) => {
        neqField = field;
        neqValue = val;
        return builder;
      },
      gte: (_field: string, val: any) => {
        gteValue = val;
        return builder;
      },
      lte: (_field: string, val: any) => {
        lteValue = val;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      single: async () => builder.then((res: any) => res),
      maybeSingle: async () => builder.then((res: any) => res),
      update: (payload: any) => {
        updatePayload = payload;
        return builder;
      },
      upsert: (payload: any) => {
        updatePayload = payload;
        return builder;
      },
      then: (resolve: any) => {
        if (updatePayload) {
          profileStore = { ...profileStore, ...updatePayload };
          return resolve({ data: { ...profileStore }, error: null });
        }

        if (gteValue !== null || lteValue !== null) {
          const rows = mockDailySteps.filter((r) => {
            if (gteValue && r.date < gteValue) return false;
            if (lteValue && r.date > lteValue) return false;
            return true;
          });
          return resolve({ data: rows, error: null });
        }

        if (filterField === 'username') {
          if (profileStore.username === filterValue && (!neqField || profileStore[neqField] !== neqValue)) {
            return resolve({ data: { ...profileStore }, error: null });
          }
          return resolve({ data: null, error: null });
        }

        if (filterField === 'id') {
          if (filterValue === profileStore.id) {
            return resolve({ data: { ...profileStore }, error: null });
          }
          return resolve({ data: null, error: { message: 'Not found' } });
        }

        return resolve({ data: { ...profileStore }, error: null });
      },
    };

    return builder;
  };

  return {
    supabase: {
      from: () => buildQuery(),
    },
    getUserSupabase: () => ({
      from: () => buildQuery(),
    }),
    authClient: {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'test-user-123', email: 'test@sabisweat.com' } },
          error: null,
        }),
      },
    },
  };
});

describe('User Preferences Model & Normalization', () => {
  it('should provide default preferences', () => {
    expect(DEFAULT_USER_PREFERENCES).toEqual({
      distanceUnit: 'Kilometres',
      energyUnit: 'Calories',
      startOfWeek: 'Saturday',
    });
  });

  it('should normalize distance units, including US spelling Kilometers', () => {
    expect(normalizeDistanceUnit('Kilometres')).toBe('Kilometres');
    expect(normalizeDistanceUnit('Kilometers')).toBe('Kilometres');
    expect(normalizeDistanceUnit('kilometers')).toBe('Kilometres');
    expect(normalizeDistanceUnit('Miles')).toBe('Miles');
    expect(normalizeDistanceUnit('miles')).toBe('Miles');
    expect(normalizeDistanceUnit('invalid')).toBeNull();
    expect(normalizeDistanceUnit(123)).toBeNull();
  });

  it('should normalize energy units', () => {
    expect(normalizeEnergyUnit('Calories')).toBe('Calories');
    expect(normalizeEnergyUnit('calories')).toBe('Calories');
    expect(normalizeEnergyUnit('kcal')).toBe('Calories');
    expect(normalizeEnergyUnit('Kilojoules')).toBe('Kilojoules');
    expect(normalizeEnergyUnit('kilojoules')).toBe('Kilojoules');
    expect(normalizeEnergyUnit('invalid')).toBeNull();
  });

  it('should normalize start of week', () => {
    expect(normalizeStartOfWeek('Saturday')).toBe('Saturday');
    expect(normalizeStartOfWeek('Sunday')).toBe('Sunday');
    expect(normalizeStartOfWeek('Monday')).toBe('Monday');
    expect(normalizeStartOfWeek('saturday')).toBe('Saturday');
    expect(normalizeStartOfWeek('sunday')).toBe('Sunday');
    expect(normalizeStartOfWeek('monday')).toBe('Monday');
    expect(normalizeStartOfWeek('Wednesday')).toBeNull();
  });

  it('should merge raw preferences with defaults', () => {
    expect(mergeWithDefaultPreferences(null)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(mergeWithDefaultPreferences(undefined)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(mergeWithDefaultPreferences({})).toEqual(DEFAULT_USER_PREFERENCES);
    expect(mergeWithDefaultPreferences({ distanceUnit: 'Miles' })).toEqual({
      distanceUnit: 'Miles',
      energyUnit: 'Calories',
      startOfWeek: 'Saturday',
    });
    expect(mergeWithDefaultPreferences({ startOfWeek: 'Monday' })).toEqual({
      distanceUnit: 'Kilometres',
      energyUnit: 'Calories',
      startOfWeek: 'Monday',
    });
  });

  it('should validate and sanitize preference updates', () => {
    const valid = validateAndSanitizePreferencesUpdate({
      distanceUnit: 'Miles',
      energyUnit: 'Kilojoules',
      startOfWeek: 'Sunday',
    });
    expect(valid).toEqual({
      distanceUnit: 'Miles',
      energyUnit: 'Kilojoules',
      startOfWeek: 'Sunday',
    });

    expect(() => validateAndSanitizePreferencesUpdate({ distanceUnit: 'Lightyears' })).toThrow();
    expect(() => validateAndSanitizePreferencesUpdate({ energyUnit: 'Watts' })).toThrow();
    expect(() => validateAndSanitizePreferencesUpdate({ startOfWeek: 'Tuesday' })).toThrow();
    expect(() => validateAndSanitizePreferencesUpdate({})).toThrow();
  });
});

describe('Start of Week Date Resolution', () => {
  it('resolves Saturday start correctly', () => {
    // 2026-11-07 is Saturday
    expect(resolveWeekStartDate('2026-11-07', 'Saturday')).toBe('2026-11-07');
    // 2026-11-08 is Sunday (1 day after Saturday)
    expect(resolveWeekStartDate('2026-11-08', 'Saturday')).toBe('2026-11-07');
    // 2026-11-13 is Friday (6 days after Saturday)
    expect(resolveWeekStartDate('2026-11-13', 'Saturday')).toBe('2026-11-07');
  });

  it('resolves Sunday start correctly', () => {
    // 2026-11-07 is Saturday (6 days after Sunday 2026-11-01)
    expect(resolveWeekStartDate('2026-11-07', 'Sunday')).toBe('2026-11-01');
    // 2026-11-08 is Sunday
    expect(resolveWeekStartDate('2026-11-08', 'Sunday')).toBe('2026-11-08');
  });

  it('resolves Monday start correctly', () => {
    // 2026-11-07 is Saturday (5 days after Monday 2026-11-02)
    expect(resolveWeekStartDate('2026-11-07', 'Monday')).toBe('2026-11-02');
    // 2026-11-09 is Monday
    expect(resolveWeekStartDate('2026-11-09', 'Monday')).toBe('2026-11-09');
  });
});

describe('User Controller & Service Integration', () => {
  it('getMe handler returns user profile with preferences', async () => {
    const req: any = { user: { id: 'test-user-123' } };
    const res = createMockRes();
    const next = jest.fn();

    await userController.getMe(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.preferences).toBeDefined();
    expect(res.body.data.preferences.distanceUnit).toBe('Kilometres');
    expect(res.body.data.preferences.energyUnit).toBe('Calories');
    expect(res.body.data.preferences.startOfWeek).toBe('Saturday');
  });

  it('updatePreferences handler updates preferences according to contract', async () => {
    const req: any = {
      user: { id: 'test-user-123' },
      body: {
        distanceUnit: 'Miles',
        energyUnit: 'Calories',
        startOfWeek: 'Sunday',
      },
    };
    const res = createMockRes();
    const next = jest.fn();

    await userController.updatePreferences(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.preferences).toEqual({
      distanceUnit: 'Miles',
      energyUnit: 'Calories',
      startOfWeek: 'Sunday',
    });
  });

  it('updatePreferences handler rejects invalid enums with 400', async () => {
    const req: any = {
      user: { id: 'test-user-123' },
      body: {
        distanceUnit: 'Inches',
      },
    };
    const res = createMockRes();
    const next = jest.fn();

    await userController.updatePreferences(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error).toBe('validation_error');
  });

  it('updateMe handler updates profile and startOfWeek', async () => {
    const req: any = {
      user: { id: 'test-user-123' },
      body: {
        city: 'Abuja',
        preferences: {
          startOfWeek: 'Monday',
        },
      },
    };
    const res = createMockRes();
    const next = jest.fn();

    await userController.updateMe(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.preferences.startOfWeek).toBe('Monday');
  });

  it('homeService.getHomeSummary includes preferences', async () => {
    const summary = await homeService.getHomeSummary('test-user-123', 'fake-token');

    expect(summary.preferences).toBeDefined();
    expect(summary.preferences.distanceUnit).toBeDefined();
    expect(summary.preferences.startOfWeek).toBeDefined();
  });
});

describe('Weekly Report Alignment & Omitted weekStartDate', () => {
  it('resolves week start when weekStartDate is omitted based on user startOfWeek preference', async () => {
    const req: any = {
      user: { id: 'test-user-123' },
      query: { timezone: 'Africa/Lagos' },
    };
    const res = createMockRes();
    const next = jest.fn();

    await healthController.getWeeklyReport(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.reportingPeriod).toBeDefined();
    expect(res.body.data.reportingPeriod.weekStartDate).toBeDefined();
    expect(res.body.data.reportingPeriod.weekEndDate).toBeDefined();
    expect(res.body.data.dailyBreakdown.length).toBe(7);

    // Verify canonical values and measuredIn fields in summary
    expect(res.body.data.summary.totalSteps).toBeGreaterThanOrEqual(0);
    expect(res.body.data.summary.totalDistanceKm).toBeDefined();
    expect(res.body.data.summary.totalActiveCalories).toBeDefined();
    expect(res.body.data.summary.distanceMeasuredIn).toBeDefined();
    expect(res.body.data.summary.energyMeasuredIn).toBeDefined();

    // Verify dynamic dayOfWeek calculation
    for (const day of res.body.data.dailyBreakdown) {
      const d = new Date(day.date + 'T00:00:00Z');
      const expectedShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
      expect(day.dayOfWeek).toBe(expectedShort);
    }
  });

  it('rejects malformed weekStartDate with 400', async () => {
    const req: any = {
      user: { id: 'test-user-123' },
      query: { weekStartDate: 'invalid-date-format' },
    };
    const res = createMockRes();
    const next = jest.fn();

    await healthController.getWeeklyReport(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error).toBe('validation_error');
  });

  it('respects user startOfWeek when set to Saturday', async () => {
    // Set startOfWeek to Saturday
    await userService.updateUserPreferences('test-user-123', { startOfWeek: 'Saturday' });

    const req: any = {
      user: { id: 'test-user-123' },
      query: { weekStartDate: '2026-11-07', timezone: 'Africa/Lagos' },
    };
    const res = createMockRes();
    const next = jest.fn();

    await healthController.getWeeklyReport(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.data.reportingPeriod.weekStartDate).toBe('2026-11-07');
    expect(res.body.data.reportingPeriod.weekEndDate).toBe('2026-11-13');
    expect(res.body.data.reportingPeriod.startOfWeek).toBe('Saturday');
  });

  it('respects user startOfWeek when set to Sunday (Sunday through Saturday)', async () => {
    // Update preference to Sunday via controller
    const prefReq: any = {
      user: { id: 'test-user-123' },
      body: { startOfWeek: 'Sunday' },
    };
    const prefRes = createMockRes();
    await userController.updatePreferences(prefReq, prefRes, jest.fn());
    expect(prefRes.body.data.preferences.startOfWeek).toBe('Sunday');

    // Subsequent call to getWeeklyReport must automatically use Sunday
    const req: any = {
      user: { id: 'test-user-123' },
      query: { weekStartDate: '2026-11-07', timezone: 'Africa/Lagos' },
    };
    const res = createMockRes();
    const next = jest.fn();

    await healthController.getWeeklyReport(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.data.reportingPeriod.weekStartDate).toBe('2026-11-01');
    expect(res.body.data.reportingPeriod.weekEndDate).toBe('2026-11-07');
    expect(res.body.data.reportingPeriod.startOfWeek).toBe('Sunday');
  });

  it('respects user startOfWeek when set to Monday (Monday through Sunday)', async () => {
    // Update preference to Monday
    await userService.updateUserPreferences('test-user-123', { startOfWeek: 'Monday' });

    const req: any = {
      user: { id: 'test-user-123' },
      query: { weekStartDate: '2026-11-07', timezone: 'Africa/Lagos' },
    };
    const res = createMockRes();
    const next = jest.fn();

    await healthController.getWeeklyReport(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.data.reportingPeriod.weekStartDate).toBe('2026-11-02');
    expect(res.body.data.reportingPeriod.weekEndDate).toBe('2026-11-08');
    expect(res.body.data.reportingPeriod.startOfWeek).toBe('Monday');
  });
});

describe('Onboarding & User Profile Endpoints Alignment', () => {
  it('POST /onboarding/complete accepts and saves all requested onboarding fields', async () => {
    const onboardingPayload = {
      firstName: 'Carrick',
      lastName: 'Mikel',
      dob: '2000-11-07',
      gender: 'Man',
      movementRelationship: 'CONSISTENT',
      mainGoal: 'Build Consistency',
      walkingFrequency: 'Daily',
      startingGoal: 10000,
      username: 'carrick',
      race: 'Black / African',
      specificSubgroup: 'Nigerian',
      avatarId: 'male-30s-athletic-skyblue-buzzcutandshortbeard-deepgreensleevelesstop',
      photoBase64: null,
      country: 'United Kingdom',
      region: 'London',
      city: 'London',
      referralCode: 'LQN9KAD7',
      preferences: {
        distanceUnit: 'Miles',
        energyUnit: 'Calories',
        startOfWeek: 'Sunday',
      },
      leaderboardVisible: true,
      sharingDefault: true,
    };

    const req: any = {
      user: { id: 'test-user-123', email: 'carrick@gmail.com' },
      token: 'fake-jwt-token',
      body: onboardingPayload,
    };
    const res = createMockRes();
    const next = jest.fn();

    await onboardingController.completeOnboarding(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.id).toBe('test-user-123');
    expect(data.firstName).toBe('Carrick');
    expect(data.lastName).toBe('Mikel');
    expect(data.gender).toBe('Man');
    expect(data.movementRelationship).toBe('CONSISTENT');
    expect(data.race).toBe('Black / African');
    expect(data.specificSubgroup).toBe('Nigerian');
    expect(data.country).toBe('United Kingdom');
    expect(data.region).toBe('London');
    expect(data.city).toBe('London');
    expect(data.preferences.distanceUnit).toBe('Miles');
    expect(data.preferences.energyUnit).toBe('Calories');
    expect(data.preferences.startOfWeek).toBe('Sunday');
    expect(data.leaderboardVisible).toBe(true);
    expect(data.sharingDefault).toBe(true);
  });

  it('POST /onboarding/complete defaults leaderboardVisible and sharingDefault to true when omitted', async () => {
    const onboardingPayload = {
      firstName: 'Carrick',
      lastName: 'Mikel',
      dob: '2000-11-07',
      gender: 'Man',
      movementRelationship: 'CONSISTENT',
      mainGoal: 'Build Consistency',
      walkingFrequency: 'Daily',
      startingGoal: 10000,
      username: 'carrick',
      city: 'London',
    };

    const req: any = {
      user: { id: 'test-user-123', email: 'carrick@gmail.com' },
      token: 'fake-jwt-token',
      body: onboardingPayload,
    };
    const res = createMockRes();
    const next = jest.fn();

    await onboardingController.completeOnboarding(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.data.leaderboardVisible).toBe(true);
    expect(res.body.data.sharingDefault).toBe(true);
  });

  it('GET /users/me returns all profile fields in data', async () => {
    const req: any = {
      user: { id: 'test-user-123' },
    };
    const res = createMockRes();
    const next = jest.fn();

    await userController.getMe(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe('test-user-123');
    expect(res.body.data.country).toBe('United Kingdom');
    expect(res.body.data.region).toBe('London');
    expect(res.body.data.movementRelationship).toBe('CONSISTENT');
    expect(res.body.data.race).toBe('Black / African');
    expect(res.body.data.specificSubgroup).toBe('Nigerian');
    expect(res.body.data.preferences).toBeDefined();
    expect(res.body.data.preferences.distanceUnit).toBe('Miles');
    expect(res.body.data.preferences.startOfWeek).toBe('Sunday');
  });

  it('GET /users/:id returns user profile by id in data', async () => {
    const req: any = {
      params: { id: 'test-user-123' },
    };
    const res = createMockRes();
    const next = jest.fn();

    await userController.getUserById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe('test-user-123');
    expect(res.body.data.country).toBe('United Kingdom');
    expect(res.body.data.region).toBe('London');
    expect(res.body.data.movementRelationship).toBe('CONSISTENT');
    expect(res.body.data.race).toBe('Black / African');
    expect(res.body.data.specificSubgroup).toBe('Nigerian');
    expect(res.body.data.preferences).toBeDefined();
  });

  it('GET /onboarding/me returns all profile fields in data', async () => {
    const req: any = {
      user: { id: 'test-user-123' },
      token: 'fake-jwt-token',
    };
    const res = createMockRes();
    const next = jest.fn();

    await onboardingController.getProfile(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('test-user-123');
    expect(res.body.data.country).toBe('United Kingdom');
    expect(res.body.data.region).toBe('London');
    expect(res.body.data.movementRelationship).toBe('CONSISTENT');
    expect(res.body.data.race).toBe('Black / African');
    expect(res.body.data.specificSubgroup).toBe('Nigerian');
    expect(res.body.data.preferences).toBeDefined();
  });

  it('GET /home/summary returns profile fields and summary in data object', async () => {
    const req: any = {
      user: { id: 'test-user-123' },
      token: 'fake-jwt-token',
    };
    const res = createMockRes();
    const next = jest.fn();

    await homeController.getHomeSummary(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe('test-user-123');
    expect(res.body.data.country).toBe('United Kingdom');
    expect(res.body.data.region).toBe('London');
    expect(res.body.data.movementRelationship).toBe('CONSISTENT');
    expect(res.body.data.race).toBe('Black / African');
    expect(res.body.data.specificSubgroup).toBe('Nigerian');
    expect(res.body.data.preferences).toBeDefined();
    expect(res.body.data.stepsToday).toBeDefined();
    expect(res.body.data.progressPercent).toBeDefined();
  });
});
