export type StreakStatus = 'hit' | 'partial' | 'miss';

export interface StreakDayData {
  day: string; // YYYY-MM-DD
  steps: number;
  status: StreakStatus;
}

export interface CurrentStreakResponse {
  asOfDate: string;
  windowStartDate: string;
  windowEndDate: string;
  stepGoal: number;
  streakDays: number;
  streakWeeks: number;
  longestStreakDays: number;
  streakHitCount: number;
  streakMissCount: number;
  hitDates: string[];
  missDates: string[];
  restoredDates: string[];
  lifeHappensPasses: number;
  data: StreakDayData[];
}

export interface StreakCalendarDay {
  day: string;
  steps: number;
  distanceKm: number;
  status: StreakStatus;
}

export interface StreakCalendarResponse {
  month: string;
  stepGoal: number;
  streakHitCount: number;
  streakMissCount: number;
  hitDates: string[];
  missDates: string[];
  restoredDates: string[];
  data: StreakCalendarDay[];
}

export interface PassBalanceResponse {
  passes: number;
}

export interface RedeemPassResponse {
  redeemed: boolean;
  date: string;
  passes: number;
}

export interface PurchasePassResponse {
  purchased: boolean;
  passes: number;
  pointsBalance: number;
}
