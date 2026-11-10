/**
 * Avatar & Streak Storage Image Resolver
 * Resolves user avatars and streak images from Supabase Storage for server-generated push notifications.
 *
 * Rules:
 * 1. Bundled Avatars: If profile has avatar_id, resolve using AVATAR_STORAGE_MAP to public Supabase Storage URL.
 * 2. Uploaded Photos: Fall back to photo_url or photo_base64 if avatar_id is missing or unmapped.
 * 3. Safe Omit: If neither exists or is invalid, return undefined (never construct invalid or 404 URLs).
 * 4. Streak Images: Resolve event or milestone to configured image URL, or omit safely.
 */

import { sanitizeImageUrl } from '../services/notificationTemplates';

export const SUPABASE_MEDIA_URL =
  process.env.SUPABASE_MEDIA_URL ||
  process.env.SUPABASE_STORAGE_URL ||
  'https://auth.sabisweat.com';

export const AVATAR_BUCKET =
  process.env.AVATAR_BUCKET ||
  process.env.SUPABASE_AVATAR_BUCKET ||
  'avatar2';

export const STREAKS_BUCKET =
  process.env.STREAKS_BUCKET ||
  process.env.SUPABASE_STREAKS_BUCKET ||
  'streaks';

/**
 * Complete, verified dictionary mapping all 51 mobile avatar IDs
 * to their exact Storage object filenames in the avatar2 bucket.
 */
export const AVATAR_STORAGE_MAP: Record<string, string> = {
  'female-teen-straightsize-sunyellow-longbraidsponytail-blacksabisweattee':
    'Female-Teen-StraightSize-SunYellow-LongBraidsPonytail-BlackSabiSweatTee.png',
  'female-20s-athletic-mintgreen-highnaturalpuff-blackrunningvest':
    'Female-20s-Athletic-Mint green- HighNaturalPuff- BlackRunningVest.png',
  'female-30s-curvy-coral-naturalcurls-activewear':
    'Female-30s-Curvy-Coral-NaturalCurls-ActiveWear.png',
  'female-40sto50s-medium-lilac-wavyhairandroundglasses-greenactivewear':
    'Female-40sTO50s-Medium-Lilac-WavyHairAndRoundGlasses-GreenActiveWear.png',
  'female-20s-athletic-sunyellow-blacksporthijab-charcoal-longsleeve':
    'Female-20s-Athletic-SunYellow-BlackSportHijab-Charcoal-longSleeve.png',
  'female-60s-curvy-skyblue-shortsilverafro-whitezipupjacket':
    'Female-60s-Curvy-SkyBlue-ShortSilverAfro-WhiteZipUpJacket.png',
  'male-60s-medium-pink-greycurlyhairandmoustache-whitepoloactivewear':
    'Male-60s-Medium-Pink-GreyCurlyHairAndMoustache-WhitePoloActiveWear.png',
  'male-20s-muscular-sunyellow-closecroppedcurlyhair-sleevelessvest':
    'Male-20s-Muscular-SunYellow-CloseCroppedCurlyHair-SleevelessVest.png',
  'male-teen-athletic-skyblue-short-curlyfade-whitesporttee':
    'Male-Teen-Athletic-SkyBlue-Short-CurlyFade-WhiteSportTee.png',
  'male-40sto50s-straightsize-coral-shortwavyhairandmoustache-activeweartop':
    'Male-40sTo50s-StraightSize-Coral-ShortWavyHairAndMoustache-ActiveWearTop.png',
  'male-30s-athletic-skyblue-buzzcutandshortbeard-deepgreensleevelesstop':
    'Male-30s-Athletic-SkyBlue-BuzzCutAndShortBeard-DeepGreenSleevelessTop.png',
  'female-20s-curvy-skyblue-curlybobandglasses-deepgreensabisweattee':
    'Female-20s-Curvy-SkyBlue-CurlyBobAndGlasses-DeepGreenSabiSweatTee.png',
  'female-30s-curvy-skyblue-longwavyhairwithheadband-armlessactivewear':
    'Female-30s-Curvy-SkyBlue-LongWavyHairWithHeadBand-ArmlessActiveWear.png',
  'female-30s-medium-pink-coralsporthijab-longsleeveactivewear':
    'Female-30s-Medium-Pink-CoralSportHijab-LongSleeveActiveWear.png',
  'female-40s-50s-medium-mintgreen-shorttexturedcrophair-whitelongsleeveactivewear':
    'Female-40s-50s-Medium-MintGreen-ShortTexturedCropHair-WhiteLongSleeveActiveWear.png',
  'female-40s-50s-plussize-pink-short-locs-walking-top-24':
    'Female--40s-50s-PlusSize-Pink-Short-locs-Walking top-24.png',
  'female-20s-medium-skyblue-long-locs-ponytail-sleeveless-white-11':
    'Female-20s-Medium-Sky Blue-Long locs ponytail-Sleeveless white-11.png',
  'female-20s-slim-coral-naturalcurls-charcoal-crew-neck-21':
    'Female-20s-Slim-Coral-NaturalCurls-Charcoal crew neck--21.png',
  'female-20s-slim-lilac-sleekhighbun-charcoal-racerback-04':
    'Female-20s-Slim-Lilac-SleekHighBun-Charcoal racerback-04.png',
  'female-20s-slim-pink-deepgreensporthijab-charcoal-long-sleeve-activewear-12':
    'Female-20s-Slim-Pink-DeepGreenSportHijab-Charcoal long sleeve activewear-12.png',
  'female-30s-plussize-pink-shortroundedcurls-activewear-top-06':
    'Female-30s-PlusSize-Pink-ShortRoundedCurls-Activewear Top-06.png',
  'female-30s-slim-coral-naturalcurls-whitelongsleeve-15':
    'Female-30s-Slim-Coral-NaturalCurls-WhiteLongSleeve-15.png',
  'female-30s-straight-size-coral-short-twists-crew-neck-09':
    'Female-30s-Straight Size-Coral-Short twists-Crew Neck-09.png',
  'female-30s-straight-size-mintgreen-gray-bob-haircut-charcoal-track-jacket-13':
    'Female-30s-Straight size-Mint green-Gray bob Haircut-Charcoal track jacket-13.png',
  'female-30sto40s-athletic-pink-long-single-braid-charcoal-sleeveless-top-18':
    'Female-30sTo40s-Athletic-Pink-Long single braid-Charcoal sleeveless to-18.png',
  'female-40sto50s-plussize-lilac-longlocsponytail-zipup-jacket-16':
    'Female-40sTo50s-PlusSize-Lilac-LongLocsPonyTail-ZipUp Jacket-16.png',
  'female-50s-60s-curvy-sunyellow-lilac-sport-hijab-modest-active-wear-20':
    'Female-50s-60s-Curvy-SunYellow-Lilac sport hijab-Modest Active wear-20.png',
  'female-teen-athletic-sunyellow-short-cropped-curls-charcoal-sports-t-shirt-14':
    'Female-Teen-Athletic-SunYellow-Short cropped curls-Charcoal sports t shirt-14.png',
  'female-teen-medium-lilac-thickcurlyponytail-loose-pink-shirt-22':
    'Female-Teen-Medium-Lilac-ThickCurlyPonytail-Loose pink shirt-22.png',
  'female-teen-slim-mintgreen-twobraidedpigtails-sabisweat-shirt-07':
    'Female-Teen-Slim-MintGreen-TwoBraidedPigtails-SabiSweat Shirt-07.png',
  'male-20s-athletic-pink-long-hair-deep-green-shirt-36':
    'Male-20s-Athletic-Pink-Long hair-Deep green shirt-36.png',
  'male-20s-medium-pink-short-dark-fade-charcoal-polo-42':
    'Male-20s-Medium-Pink-Short dark fade-Charcoal polo-42.png',
  'male-20s-slim-lilac-wavy-curly-hair-white-shirt-40':
    'Male-20s-Slim-Lilac-Wavy curly Hair-White shirt-40.png',
  'male-20s-slim-sunyellow-closecroppedcurlyhair-charcoal-track-jacket-32':
    'Male-20s-Slim-SunYellow-ClosefCroopedCurlyHair-Charcoal track jacket-32.png',
  'male-30s-athletic-coral-closecroppedcurlyhair-charcoal-crew-neck-28':
    'Male-30s-Athletic-Coral-CloseCroppedCurlyHair-Charcoal crew neck-28.png',
  'male-30s-athletic-mintgreen-short-dark-hair-charcoal-training-shirt-31':
    'Male-30s-Athletic-MintGreen-Short dark Hair-Charcoal Training shirt-31.png',
  'male-30s-athletic-skyblue-short-locs-neat-beard-charcoal-crew-neck-47':
    'Male-30s-Athletic-SkyBlue-Short locs Neat beard-Charcoal crew neck-47.png',
  'male-30s-curvy-mintgreen-short-hair-and-beard-charcoal-zip-up-43':
    'Male-30s-Curvy-MintGreen-Short Hair and beard-Charcoal zip up-43.png',
  'male-30s-medium-sunyellow-dark-curly-hair-charcoal-shirt-38':
    'Male-30s-Medium-SunYellow-Dark curly Hair-Charcoal shirt-38.png',
  'male-30sto40s-muscular-lilac-short-dark-hair-charcoal-sport-shirt-34':
    'Male-30sTo40s-Muscular-Lilac-Short dark Hair-Charcoal sport shirt-34.png',
  'male-40sto50s-curvy-skyblue-bald-head-grey-beard-green-zip-up-29':
    'Male-40sTo50s-Curvy-SkyBlue-Bald head Grey beard-Green Zip up-29.png',
  'male-40sto50s-medium-coral-white-hair-white-crew-neck-33':
    'Male-40sTo50s-Medium-Coral-White hair-White crew neck-33.png',
  'male-40sto50s-plus-size-coral-full-beard-and-short-curls-charcoal-zip-up-45':
    'Male-40sTo50s-Plus size- Coral-Full beard amd Short curls-Charcoal zip up with white shirt-45.png',
  'male-60s-curvy-mintgreen-gray-beard-charcoal-zip-up-37':
    'Male-60s-Curvy-Mint green-Gray beard-Charcoal Zip up-37.png',
  'male-60s-medium-lilac-grey-hair-deep-green-shirt-46':
    'Male-60s-Medium-Lilac-Grey Hair-Deep green shirt-46.png',
  'male-60s-medium-pink-grey-curly-hair-and-moustache-white-polo-style-30':
    'Male-60s-Medium-Pink-Grey curly hair And Moustache-White polo style-30.png',
  'male-teen-athletic-sunyellow-short-hair-green-shirt-44':
    'Male-Teen-Athletic-SunYellow-Short Hair-Green shirt-44.png',
  'male-teen-slim-coral-short-twists-white-shirt-27':
    'Male-Teen-Slim-Coral-Short twists-White Shirt-27.png',
  'nonbinary-20sto30s-medium-pink-skin-hair-rainbow-shirt-48':
    'NonBinary-20sTo30ss-Medium-Pink-Skin  Hair-Rainbow shirt-48.png',
  'nonbinary-30s-medium-pink-wavy-curly-hair-rainbow-shirt-50':
    'NonBinary-30s-Medium-Pink-Wavy Curly Hair-Rainbow shirt-50.png',
  'nonbinary-40sto50s-curvy-skyblue-short-locs-and-glasses-zip-up-jacket-49':
    'NonBinary-40sTo50s-Curvy-SkyBlue-Short locs and Glasses-Zip up jacket-49.png',
};

/**
 * Resolves a predefined avatar ID to its Supabase Storage public URL.
 */
export function resolveAvatarIdToUrl(avatarId: string | null | undefined): string | undefined {
  if (!avatarId || typeof avatarId !== 'string') return undefined;
  const normalizedId = avatarId.trim().toLowerCase();
  const filename = AVATAR_STORAGE_MAP[normalizedId];
  if (!filename) return undefined;

  // Encode URI component to properly escape spaces and special characters in filenames
  const encodedFilename = encodeURIComponent(filename);
  const baseUrl = (SUPABASE_MEDIA_URL || 'https://auth.sabisweat.com').replace(/\/+$/, '');
  const bucket = AVATAR_BUCKET || 'avatar2';
  return `${baseUrl}/storage/v1/object/public/${bucket}/${encodedFilename}`;
}

/**
 * Resolves a user's avatar image URL for push notifications.
 * Priority:
 * 1. Predefined avatar (`avatar_id` / `avatarId`) resolved to Supabase Storage `avatar2` bucket.
 * 2. Uploaded/custom profile photo (`photo_url` / `photoUrl` / `photo_base64`).
 * 3. Undefined if neither is available (safe omission, no broken URLs).
 */
export function resolveUserAvatarUrl(
  profile: {
    avatar_id?: string | null;
    avatarId?: string | null;
    photo_url?: string | null;
    photoUrl?: string | null;
    photo_base64?: string | null;
    photoBase64?: string | null;
  } | null | undefined
): string | undefined {
  if (!profile) return undefined;

  // 1. Try predefined avatar resolution
  const avatarId = profile.avatar_id || profile.avatarId;
  const resolvedAvatar = resolveAvatarIdToUrl(avatarId);
  if (resolvedAvatar) {
    return resolvedAvatar;
  }

  // 2. Fall back to uploaded/custom profile photo
  const photo =
    profile.photo_url ||
    profile.photoUrl ||
    profile.photo_base64 ||
    profile.photoBase64;

  const sanitizedPhoto = sanitizeImageUrl(photo);
  if (sanitizedPhoto) {
    return sanitizedPhoto;
  }

  return undefined;
}

/**
 * Resolves streak push notification images.
 * Priority:
 * 1. Environment variable override if specified.
 * 2. Configured streak storage base URL and known filename if present.
 * 3. Safe undefined (omitted) if no image is available.
 */
export function resolveStreakNotificationImageUrl(
  event: 'daily_goal_completed' | 'streak_at_risk' | 'step_milestone_50' | string,
  streakDays?: number
): string | undefined {
  switch (event) {
    case 'daily_goal_completed': {
      const envUrl = process.env.CDN_STREAK_FLAME_CELEBRATION || process.env.STREAK_IMAGE_DAILY_GOAL;
      if (envUrl) return sanitizeImageUrl(envUrl);

      if (process.env.STREAK_STORAGE_BASE_URL) {
        return sanitizeImageUrl(`${process.env.STREAK_STORAGE_BASE_URL.replace(/\/+$/, '')}/daily_goal_completed.png`);
      }
      return undefined;
    }
    case 'streak_at_risk': {
      const envUrl = process.env.CDN_STREAK_FLAME_URGENT || process.env.STREAK_IMAGE_AT_RISK;
      if (envUrl) return sanitizeImageUrl(envUrl);

      if (process.env.STREAK_STORAGE_BASE_URL) {
        return sanitizeImageUrl(`${process.env.STREAK_STORAGE_BASE_URL.replace(/\/+$/, '')}/streak_at_risk.png`);
      }
      return undefined;
    }
    case 'step_milestone_50': {
      const envUrl = process.env.CDN_STREAK_FLAME_ACTIVE || process.env.STREAK_IMAGE_50;
      if (envUrl) return sanitizeImageUrl(envUrl);

      if (process.env.STREAK_STORAGE_BASE_URL) {
        return sanitizeImageUrl(`${process.env.STREAK_STORAGE_BASE_URL.replace(/\/+$/, '')}/step_milestone_50.png`);
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

