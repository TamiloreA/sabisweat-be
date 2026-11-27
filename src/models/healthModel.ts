export interface HealthSyncRecord {
  date: string;
  steps: number;
  distanceKm?: number;
  activeCalories?: number;
  source?: string;
  timeZone?: string;
  syncedAt?: string;
}

export interface HealthSyncBatchRequest {
  records?: HealthSyncRecord[];
  platform?: string;
}

export interface HealthHistoryItem {
  date: string;
  steps: number;
  distanceKm: number;
  activeCalories: number;
  lastSyncedAt?: string;
  source?: string;
}

export interface HealthHistoryAllResponse {
  onboardingStartDate?: string;
  startDate: string | null;
  asOfDate: string;
  data: HealthHistoryItem[];
}

export interface WeeklyReportReportingPeriod {
  weekStartDate: string;
  weekEndDate: string;
  isCurrentWeek: boolean;
  daysElapsed: number;
  startOfWeek?: string;
}

export interface WeeklyReportSummary {
  totalSteps: number;
  totalDistanceKm: number;
  totalActiveCalories: number;
  dailyGoalSteps: number;
  daysGoalAchieved: number;
  distanceMeasuredIn?: string;
  energyMeasuredIn?: string;
  startOfWeek?: string;
}

export interface WeeklyReportComparison {
  stepsChangePercent: number;
  distanceChangePercent: number;
  caloriesChangePercent: number;
  hasPriorWeekBaseline: boolean;
}

export interface WeeklyReportCommunityRank {
  topPercentage: number | null;
  totalEligibleUsers: number;
}

export interface WeeklyReportDailyBreakdown {
  date: string;
  dayOfWeek: string;
  steps: number;
  distanceKm: number;
  activeCalories: number;
  isGoalMet: boolean;
}

export interface WeeklyReportBestDay {
  date: string;
  dayOfWeek: string;
  steps: number;
}

export interface WeeklyReportHighlights {
  bestDay: WeeklyReportBestDay;
  dailyAverageSteps: number;
}

export interface WeeklyReportBadge {
  id: string;
  name: string;
  description?: string;
  earnedAt: string;
  category?: string;
  badgeIconUrl?: string;
}

export interface WeeklyReportDistanceEquivalent {
  id: string;
  name: string;
  phrase: string;
  city: string;
  countryCodes: string[];
  placeLabel: string;
  flagEmoji: string;
  region: string;
  distanceM: number;
  unitDistanceLabel: string;
  card: 'photo' | 'compact';
  imageUrl: string | null;
  multiplier: number;
  displayMultiplier: string;
  displayNumericMultiplier: number;
  sentence: string;
}

export interface WeeklyReportData {
  reportingPeriod: WeeklyReportReportingPeriod;
  summary: WeeklyReportSummary;
  comparison: WeeklyReportComparison;
  communityRank: WeeklyReportCommunityRank;
  dailyBreakdown: WeeklyReportDailyBreakdown[];
  highlights: WeeklyReportHighlights;
  badgesEarned: WeeklyReportBadge[];
  distanceEquivalent: WeeklyReportDistanceEquivalent | null;
}

export interface WeeklyReportResponse {
  status: 'success' | 'error';
  success: boolean;
  data: WeeklyReportData;
}
