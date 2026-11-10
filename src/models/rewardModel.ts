import { SabiLevel } from './authModel';

export type PartnerCategory =
  | 'cafes'
  | 'restaurants'
  | 'juice_bars'
  | 'meal_prep'
  | 'padel_clubs'
  | 'gyms'
  | 'studios'
  | 'sports_venue'
  | 'hair_beauty'
  | 'nails_clubs'
  | 'skincare'
  | 'spa'
  | 'supplements'
  | 'nutrition'
  | 'health_services';

export interface PointsBalanceData {
  balance: number;
  sabiLevel: SabiLevel;
}

export interface LedgerTransaction {
  id: string;
  amount: number;
  source: string;
  description: string;
  created_at: string;
  reference_id?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface GlobalRewardItem {
  id: string;
  title: string;
  points_cost: number;
  partner_id: string;
  partners: {
    name: string;
    city: string;
  };
}

export interface PartnerRewardItem {
  id: string;
  title: string;
  description: string;
  pointsCost: number;
  imageUrl?: string | null;
}

export interface PartnerListItem {
  id: string;
  name: string;
  description: string;
  category: string;
  city: string;
  country: string;
  countryCode: string;
  coverImageUrl?: string | null;
  logoImageUrl?: string | null;
  address?: string | null;
}

export interface PartnerDetailData {
  id: string;
  name: string;
  description: string;
  city: string;
  country: string;
  coverImageUrl?: string | null;
  logoImageUrl?: string | null;
  address?: string | null;
  gallery: string[];
  activeRewards: PartnerRewardItem[];
}

export interface RewardQRTokenData {
  token: string;
  userId: string;
  rewardId: string;
  partnerId: string;
  pointsCost: number;
  nonce: string;
}

export interface QRTokenPayload {
  userId: string;
  rewardId: string;
  partnerId: string;
  pointsCost: number;
  nonce: string;
  exp?: number;
}

export interface PartnerPortalOverviewData {
  partner: {
    id: string;
    name: string;
    logoImageUrl?: string | null;
  };
  summary: {
    coinsValueRedeemed: number;
    redemptions: number;
    coinsRedeemed: number;
    customers: number;
    partnerPointsBalance: number;
  };
  recentRedemptions: Array<{
    id: string;
    userId: string;
    userName: string;
    avatarUrl: string | null;
    pointsSpent: number;
    rewardTitle: string | null;
    createdAt: string | null;
    status: string;
    statusLabel: string;
  }>;
}

export interface RedemptionResultData {
  redemptionId: string;
  userName: string;
  avatarUrl: string | null;
  rewardTitle: string;
  pointsSpent: number;
  status: 'completed';
  statusLabel: 'Redeemed';
  message: string;
}

