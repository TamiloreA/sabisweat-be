import { supabase } from '../config/database';
import { generateNonce, generateRewardQRToken, verifyRewardQRToken } from '../utils/qrToken';
import { uploadBase64Image } from '../utils/imageUpload';
import { notificationTemplates } from './notificationTemplates';
import { dispatchNotification } from './notificationDispatcher';
import { PUSH_CATEGORIES } from '../models/notificationModel';
import {
  GlobalRewardItem,
  PartnerListItem,
  PartnerDetailData,
  PartnerRewardItem,
  RewardQRTokenData,
  PartnerPortalOverviewData,
  RedemptionResultData,
} from '../models/rewardModel';

/**
 * Table name constants
 */
export const TABLE_PARTNERS = 'partners';
export const TABLE_PARTNER_IMAGES = 'partner_images';
export const TABLE_PARTNER_STAFF = 'partner_staff';
export const TABLE_REWARDS = 'rewards';
export const TABLE_REWARD_REDEMPTIONS = 'reward_redemptions';
export const TABLE_POINTS_TRANSACTIONS = 'points_transactions';
export const TABLE_PROFILES = 'profiles';

// ============================================================================
// 1. User Facing Rewards & Partners
// ============================================================================

/**
 * GET /rewards
 * Returns active rewards across partners with partner name and city.
 */
export async function getActiveRewards(): Promise<GlobalRewardItem[]> {
  const { data, error } = await supabase
    .from(TABLE_REWARDS)
    .select(`
      id,
      title,
      points_cost,
      partner_id,
      partners (
        id,
        name,
        city,
        status
      )
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[rewardService] Error fetching rewards:', error.message);
    return [];
  }

  const result: GlobalRewardItem[] = [];

  for (const item of data || []) {
    const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners;
    // Only include if partner is active or doesn't have inactive status
    if (partner && partner.status !== 'inactive' && partner.status !== 'revoked') {
      result.push({
        id: String(item.id),
        title: String(item.title),
        points_cost: Number(item.points_cost || 0),
        partner_id: String(item.partner_id),
        partners: {
          name: String(partner.name || ''),
          city: String(partner.city || ''),
        },
      });
    }
  }

  return result;
}

/**
 * POST /rewards/:id/qr
 * Generates pre-redemption QR code JWT token without deducting points.
 */
export async function generateRewardQR(
  userId: string,
  rewardId: string
): Promise<RewardQRTokenData> {
  // 1. Fetch and verify reward
  const { data: reward, error: rewardErr } = await supabase
    .from(TABLE_REWARDS)
    .select('id, title, points_cost, partner_id, status')
    .eq('id', rewardId)
    .maybeSingle();

  if (rewardErr || !reward || reward.status !== 'active') {
    throw {
      status: 404,
      error: 'reward_not_found_or_inactive',
      message: 'Reward does not exist or is no longer active',
    };
  }

  const pointsCost = Number(reward.points_cost || 0);
  const partnerId = String(reward.partner_id);

  // 2. Verify user has sufficient points
  const { data: profile, error: profileErr } = await supabase
    .from(TABLE_PROFILES)
    .select('points_balance')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr || !profile) {
    throw {
      status: 404,
      error: 'user_not_found',
      message: 'User profile not found',
    };
  }

  const balance = Number(profile.points_balance || 0);
  if (balance < pointsCost) {
    throw {
      status: 400,
      error: 'insufficient_balance',
      message: `Insufficient points. You need ${pointsCost} points, but have ${balance}.`,
    };
  }

  // 3. Generate signed JWT with 15 minutes expiration
  const nonce = generateNonce(16);
  const token = await generateRewardQRToken(
    {
      userId,
      rewardId,
      partnerId,
      pointsCost,
      nonce,
    },
    15 * 60 // 15 minutes
  );

  return {
    token,
    userId,
    rewardId,
    partnerId,
    pointsCost,
    nonce,
  };
}

/**
 * GET /partners?category=...&city=...
 * Returns partners directory filtered by optional category and city.
 */
export async function getPartners(
  category?: string,
  city?: string
): Promise<PartnerListItem[]> {
  let query = supabase
    .from(TABLE_PARTNERS)
    .select(`
      id,
      name,
      description,
      category,
      city,
      country,
      country_code,
      cover_image_url,
      logo_image_url,
      address,
      status
    `)
    .eq('status', 'active');

  if (category && category.trim()) {
    query = query.eq('category', category.trim().toLowerCase());
  }

  if (city && city.trim()) {
    query = query.ilike('city', `%${city.trim()}%`);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) {
    console.warn('[rewardService] Error fetching partners:', error.message);
    return [];
  }

  return (data || []).map((p: any) => ({
    id: String(p.id),
    name: String(p.name || ''),
    description: String(p.description || ''),
    category: String(p.category || ''),
    city: String(p.city || ''),
    country: String(p.country || 'Nigeria'),
    countryCode: String(p.country_code || 'NG'),
    coverImageUrl: p.cover_image_url || null,
    logoImageUrl: p.logo_image_url || null,
    address: p.address || null,
  }));
}

/**
 * GET /partners/:id
 * Returns partner detail with active rewards and gallery.
 */
export async function getPartnerById(partnerId: string): Promise<PartnerDetailData> {
  const { data: partner, error: partnerErr } = await supabase
    .from(TABLE_PARTNERS)
    .select('*')
    .eq('id', partnerId)
    .eq('status', 'active')
    .maybeSingle();

  if (partnerErr || !partner) {
    throw {
      status: 404,
      error: 'partner_not_found',
      message: 'Partner not found or inactive',
    };
  }

  const [{ data: images }, { data: rewards }] = await Promise.all([
    supabase
      .from(TABLE_PARTNER_IMAGES)
      .select('image_url')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: true }),
    supabase
      .from(TABLE_REWARDS)
      .select('id, title, description, points_cost, image_url')
      .eq('partner_id', partnerId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
  ]);

  const gallery = (images || []).map((img: any) => String(img.image_url)).filter(Boolean);
  const activeRewards: PartnerRewardItem[] = (rewards || []).map((r: any) => ({
    id: String(r.id),
    title: String(r.title || ''),
    description: String(r.description || ''),
    pointsCost: Number(r.points_cost || 0),
    imageUrl: r.image_url || null,
  }));

  return {
    id: String(partner.id),
    name: String(partner.name || ''),
    description: String(partner.description || ''),
    city: String(partner.city || ''),
    country: String(partner.country || 'Nigeria'),
    coverImageUrl: partner.cover_image_url || null,
    logoImageUrl: partner.logo_image_url || null,
    address: partner.address || null,
    gallery,
    activeRewards,
  };
}

// ============================================================================
// 2. Partner Portal (Partner Staff App)
// ============================================================================

/**
 * Verifies staff member is authorized for the given partnerId.
 */
export async function verifyStaffMembership(
  staffUserId: string,
  partnerId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE_PARTNER_STAFF)
    .select('id, role')
    .eq('user_id', staffUserId)
    .eq('partner_id', partnerId)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

/**
 * GET /partner-portal/home/overview
 */
export async function getPartnerPortalOverview(
  staffUserId: string,
  targetPartnerId?: string
): Promise<PartnerPortalOverviewData> {
  // 1. Fetch authorized partners for this staff user
  const { data: staffRows, error: staffErr } = await supabase
    .from(TABLE_PARTNER_STAFF)
    .select('partner_id')
    .eq('user_id', staffUserId);

  if (staffErr || !staffRows || staffRows.length === 0) {
    throw {
      status: 403,
      error: 'unauthorized_staff',
      message: 'User is not registered as partner staff',
    };
  }

  const authorizedPartnerIds = staffRows.map((r: any) => String(r.partner_id));
  const activePartnerId = targetPartnerId ? String(targetPartnerId) : authorizedPartnerIds[0];

  if (!authorizedPartnerIds.includes(activePartnerId)) {
    throw {
      status: 403,
      error: 'unauthorized_staff',
      message: 'Staff member is not authorized for this partner',
    };
  }

  // 2. Fetch partner details and redemptions
  const [{ data: partner }, { data: redemptions }] = await Promise.all([
    supabase
      .from(TABLE_PARTNERS)
      .select('id, name, logo_image_url, points_balance')
      .eq('id', activePartnerId)
      .maybeSingle(),
    supabase
      .from(TABLE_REWARD_REDEMPTIONS)
      .select('id, user_id, reward_id, points_spent, status, created_at')
      .eq('partner_id', activePartnerId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const allRedemptions = redemptions || [];
  const completedRedemptions = allRedemptions.filter(
    (r: any) => String(r.status || '').toLowerCase() === 'completed'
  );

  const coinsRedeemed = completedRedemptions.reduce(
    (sum: number, r: any) => sum + Number(r.points_spent || 0),
    0
  );
  const redemptionsCount = completedRedemptions.length;
  const customersCount = new Set(completedRedemptions.map((r: any) => String(r.user_id))).size;
  const partnerPointsBalance = Number(partner?.points_balance || 0);
  const coinsValueRedeemed = partnerPointsBalance > 0 ? partnerPointsBalance : coinsRedeemed;

  // 3. Fetch user and reward details for the 10 most recent rows
  const recentRows = allRedemptions.slice(0, 10);
  const userIds = [...new Set(recentRows.map((r: any) => String(r.user_id)).filter(Boolean))];
  const rewardIds = [...new Set(recentRows.map((r: any) => String(r.reward_id)).filter(Boolean))];

  const [{ data: profiles }, { data: rewards }] = await Promise.all([
    userIds.length > 0
      ? supabase
          .from(TABLE_PROFILES)
          .select('id, first_name, last_name, username, photo_url, photo_base64')
          .in('id', userIds)
      : Promise.resolve({ data: [] }),
    rewardIds.length > 0
      ? supabase.from(TABLE_REWARDS).select('id, title').in('id', rewardIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map(
    (profiles || []).map((p: any) => [
      String(p.id),
      {
        userName:
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
          p.username ||
          'Customer',
        avatarUrl: p.photo_url || p.photo_base64 || null,
      },
    ])
  );

  const rewardMap = new Map((rewards || []).map((r: any) => [String(r.id), String(r.title || '')]));

  const recentRedemptions = recentRows.map((r: any) => {
    const userMeta = profileMap.get(String(r.user_id));
    const rawStatus = String(r.status || 'pending').toLowerCase();
    const statusLabel =
      rawStatus === 'completed' ? 'Redeemed' : rawStatus === 'failed' ? 'Failed' : 'Pending';

    return {
      id: String(r.id),
      userId: String(r.user_id),
      userName: userMeta?.userName || 'Customer',
      avatarUrl: userMeta?.avatarUrl || null,
      pointsSpent: Number(r.points_spent || 0),
      rewardTitle: rewardMap.get(String(r.reward_id)) || null,
      createdAt: r.created_at || null,
      status: rawStatus,
      statusLabel,
    };
  });

  return {
    partner: {
      id: String(partner?.id || activePartnerId),
      name: String(partner?.name || 'Partner'),
      logoImageUrl: partner?.logo_image_url || null,
    },
    summary: {
      coinsValueRedeemed,
      redemptions: redemptionsCount,
      coinsRedeemed,
      customers: customersCount,
      partnerPointsBalance,
    },
    recentRedemptions,
  };
}

/**
 * POST /partner-portal/redeem
 * Validates QR code, atomically deducts points, records redemption, and notifies customer.
 */
export async function redeemReward(
  staffUserId: string,
  token: string
): Promise<RedemptionResultData> {
  // 1. Decode & verify JWT
  let decoded;
  try {
    decoded = await verifyRewardQRToken(token);
  } catch (err: any) {
    throw {
      status: 400,
      error: 'invalid_or_expired_qr',
      message: 'QR code is invalid or has expired',
    };
  }

  const { userId, rewardId, partnerId, pointsCost, nonce } = decoded;

  // 2. Verify staff belongs to this partner
  const isAuthorized = await verifyStaffMembership(staffUserId, partnerId);
  if (!isAuthorized) {
    throw {
      status: 403,
      error: 'unauthorized_staff',
      message: 'You are not authorized to redeem rewards for this partner',
    };
  }

  // 3. Prevent duplicate redemption (nonce single-use check)
  const { data: existingRedemption } = await supabase
    .from(TABLE_REWARD_REDEMPTIONS)
    .select('id, status')
    .eq('unique_identifier', nonce)
    .maybeSingle();

  if (existingRedemption) {
    throw {
      status: 409,
      error: 'qr_already_redeemed',
      message: 'This QR code has already been redeemed',
    };
  }

  // 4. Authoritative check: reward status & customer points balance
  const [{ data: reward }, { data: customerProfile }, { data: partner }] = await Promise.all([
    supabase
      .from(TABLE_REWARDS)
      .select('id, title, status, partner_id, points_cost')
      .eq('id', rewardId)
      .maybeSingle(),
    supabase
      .from(TABLE_PROFILES)
      .select('id, first_name, last_name, username, photo_url, photo_base64, points_balance')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from(TABLE_PARTNERS).select('id, name, points_balance').eq('id', partnerId).maybeSingle(),
  ]);

  if (!reward || reward.status !== 'active' || String(reward.partner_id) !== partnerId) {
    throw {
      status: 400,
      error: 'reward_not_found_or_inactive',
      message: 'Reward is no longer valid or does not belong to this partner',
    };
  }

  if (!customerProfile) {
    throw {
      status: 404,
      error: 'customer_not_found',
      message: 'Customer profile not found',
    };
  }

  const currentBalance = Number(customerProfile.points_balance || 0);
  const authoritativePointsCost = Number(reward.points_cost ?? pointsCost);

  if (currentBalance < authoritativePointsCost) {
    throw {
      status: 400,
      error: 'insufficient_balance',
      message: `Customer has insufficient points balance (${currentBalance} points available, ${authoritativePointsCost} required)`,
    };
  }

  // 5. Atomic Redemption: Insert redemption record
  const { data: redemptionRecord, error: redemptionInsertErr } = await supabase
    .from(TABLE_REWARD_REDEMPTIONS)
    .insert({
      user_id: userId,
      partner_id: partnerId,
      reward_id: rewardId,
      points_spent: authoritativePointsCost,
      unique_identifier: nonce,
      status: 'completed',
      redeemed_by_staff_id: staffUserId,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (redemptionInsertErr) {
    if (redemptionInsertErr.code === '23505') {
      throw {
        status: 409,
        error: 'qr_already_redeemed',
        message: 'This QR code has already been redeemed',
      };
    }
    throw {
      status: 500,
      error: 'redemption_failed',
      message: `Failed to record redemption: ${redemptionInsertErr.message}`,
    };
  }

  const redemptionId = String(redemptionRecord?.id || nonce);

  // Deduct points from customer profile
  const nextCustomerBalance = currentBalance - authoritativePointsCost;
  const { error: balanceDeductErr } = await supabase
    .from(TABLE_PROFILES)
    .update({ points_balance: nextCustomerBalance })
    .eq('id', userId);

  if (balanceDeductErr) {
    // Rollback redemption record
    await supabase.from(TABLE_REWARD_REDEMPTIONS).delete().eq('id', redemptionId);
    throw {
      status: 500,
      error: 'balance_deduction_failed',
      message: 'Failed to deduct customer points',
    };
  }

  // Insert negative ledger transaction into points_transactions
  const partnerName = partner?.name || 'Partner';
  const { error: ledgerErr } = await supabase.from(TABLE_POINTS_TRANSACTIONS).insert({
    user_id: userId,
    amount: -authoritativePointsCost,
    source: 'partner_redemption',
    description: `Redeemed at ${partnerName}`,
    reference_id: `redemption_${nonce}`,
    meta: {
      redemptionId,
      rewardId,
      partnerId,
      pointsCost: authoritativePointsCost,
      staffUserId,
    },
  });

  if (ledgerErr) {
    console.warn('[rewardService] Failed to record ledger entry for redemption:', ledgerErr.message);
  }

  // Credit partner points balance
  const currentPartnerBalance = Number(partner?.points_balance || 0);
  await supabase
    .from(TABLE_PARTNERS)
    .update({ points_balance: currentPartnerBalance + authoritativePointsCost })
    .eq('id', partnerId);

  // 6. Customer Push Notification & Inbox persistence
  const customerFullName = [customerProfile.first_name, customerProfile.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const customerUserName = customerFullName || customerProfile.username || 'Customer';
  const customerAvatar = customerProfile.photo_url || customerProfile.photo_base64 || null;

  try {
    const template = notificationTemplates.rewardRedeemed(
      authoritativePointsCost,
      reward.title,
      partnerName
    );

    await dispatchNotification({
      userId,
      type: 'reward_redemption_completed',
      title: template.title,
      body: template.body,
      imageUrl: template.imageUrl,
      data: template.data,
      idempotencyKey: `redemption_notify:${nonce}`,
    });
  } catch (notifyErr: any) {
    console.warn('[rewardService] Customer push dispatch failed:', notifyErr?.message || notifyErr);
  }

  return {
    redemptionId,
    userName: customerUserName,
    avatarUrl: customerAvatar,
    rewardTitle: reward.title,
    pointsSpent: authoritativePointsCost,
    status: 'completed',
    statusLabel: 'Redeemed',
    message: 'Redemption completed successfully',
  };
}

/**
 * GET /partner-portal/partners
 * Retrieves the partners belonging to the authenticated staff member.
 */
export async function getStaffPartners(staffUserId: string) {
  const { data: staff, error: staffErr } = await supabase
    .from(TABLE_PARTNER_STAFF)
    .select('partner_id, role')
    .eq('user_id', staffUserId);

  if (staffErr || !staff || staff.length === 0) {
    return [];
  }

  const partnerIds = staff.map((s: any) => String(s.partner_id));
  const { data: partners, error: partErr } = await supabase
    .from(TABLE_PARTNERS)
    .select('*')
    .in('id', partnerIds);

  if (partErr) {
    console.warn('[rewardService] Error fetching staff partners:', partErr.message);
    return [];
  }

  return partners || [];
}

/**
 * GET /partner-portal/partners/:partnerId/rewards
 * Retrieves rewards for a specific partner (staff authorization required).
 */
export async function getPartnerRewardsForStaff(staffUserId: string, partnerId: string) {
  const isAuthorized = await verifyStaffMembership(staffUserId, partnerId);
  if (!isAuthorized) {
    throw {
      status: 403,
      error: 'unauthorized_staff',
      message: 'You are not authorized to view rewards for this partner',
    };
  }

  const { data: rewards, error } = await supabase
    .from(TABLE_REWARDS)
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw { status: 500, error: 'fetch_failed', message: error.message };
  }

  return rewards || [];
}

/**
 * POST /partner-portal/partners/:partnerId/rewards
 * Creates a reward for a partner with optional base64 image upload.
 */
export async function createPartnerReward(
  staffUserId: string,
  partnerId: string,
  payload: {
    title: string;
    description?: string;
    pointsCost: number;
    imageBase64?: string;
  }
) {
  const isAuthorized = await verifyStaffMembership(staffUserId, partnerId);
  if (!isAuthorized) {
    throw {
      status: 403,
      error: 'unauthorized_staff',
      message: 'You are not authorized to create rewards for this partner',
    };
  }

  if (!payload.title || typeof payload.title !== 'string' || !payload.title.trim()) {
    throw {
      status: 400,
      error: 'validation_error',
      message: 'Reward title is required',
    };
  }

  if (typeof payload.pointsCost !== 'number' || payload.pointsCost < 0) {
    throw {
      status: 400,
      error: 'validation_error',
      message: 'pointsCost must be a non-negative number',
    };
  }

  let imageUrl: string | null = null;
  if (payload.imageBase64) {
    try {
      imageUrl = await uploadBase64Image(`rewards/${partnerId}`, payload.imageBase64);
    } catch (e: any) {
      console.warn('[rewardService] Image upload failed:', e?.message || e);
    }
  }

  const { data: created, error } = await supabase
    .from(TABLE_REWARDS)
    .insert({
      partner_id: partnerId,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      points_cost: Math.round(payload.pointsCost),
      image_url: imageUrl,
      status: 'active',
      created_by: staffUserId,
    })
    .select('*')
    .maybeSingle();

  if (error || !created) {
    throw {
      status: 500,
      error: 'create_failed',
      message: error?.message || 'Failed to create reward',
    };
  }

  return created;
}
