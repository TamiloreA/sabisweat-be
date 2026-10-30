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
}

export interface WeeklyReportSummary {
  totalSteps: number;
  totalDistanceKm: number;
  totalActiveCalories: number;
  dailyGoalSteps: number;
  daysGoalAchieved: number;
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

export interface WeeklyReportData {
  reportingPeriod: WeeklyReportReportingPeriod;
  summary: WeeklyReportSummary;
  comparison: WeeklyReportComparison;
  communityRank: WeeklyReportCommunityRank;
  dailyBreakdown: WeeklyReportDailyBreakdown[];
  highlights: WeeklyReportHighlights;
}

export interface WeeklyReportResponse {
  status: 'success' | 'error';
  success: boolean;
  data: WeeklyReportData;
}
