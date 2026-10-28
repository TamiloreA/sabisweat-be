import { supabase } from '../config/database';
import { VersionCheckResponse, UpdateAppVersionInput } from '../models/versionModel';

const DEFAULT_LATEST_VERSION = process.env.APP_LATEST_VERSION || '1.0.11';
const DEFAULT_MINIMUM_VERSION = process.env.APP_MINIMUM_VERSION || '1.0.0';
const DEFAULT_FORCE_UPDATE = process.env.APP_FORCE_UPDATE === 'true';

export const getAppVersion = async (platform?: string): Promise<VersionCheckResponse> => {
  const targetPlatform = platform ? platform.toLowerCase().trim() : 'all';

  try {
    // If a specific platform is requested (e.g., 'ios', 'android'), check for platform-specific row first
    if (targetPlatform !== 'all') {
      const { data: platformData, error: platformError } = await supabase
        .from('app_versions')
        .select('*')
        .eq('platform', targetPlatform)
        .maybeSingle();

      if (!platformError && platformData) {
        return {
          latestVersion: platformData.latest_version || DEFAULT_LATEST_VERSION,
          minimumVersion: platformData.minimum_version || DEFAULT_MINIMUM_VERSION,
          forceUpdate: Boolean(platformData.force_update),
          releaseNotes: platformData.release_notes || null,
          storeUrl: platformData.store_url || null,
        };
      }
    }

    // Check for general 'all' platform row
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('platform', 'all')
      .maybeSingle();

    if (!error && data) {
      return {
        latestVersion: data.latest_version || DEFAULT_LATEST_VERSION,
        minimumVersion: data.minimum_version || DEFAULT_MINIMUM_VERSION,
        forceUpdate: Boolean(data.force_update),
        releaseNotes: data.release_notes || null,
        storeUrl: data.store_url || null,
      };
    }
  } catch (err) {
    console.warn('[versionService] Failed to query app_versions table, using default fallback:', err);
  }

  // Graceful fallback if database table is not yet migrated or empty
  return {
    latestVersion: DEFAULT_LATEST_VERSION,
    minimumVersion: DEFAULT_MINIMUM_VERSION,
    forceUpdate: DEFAULT_FORCE_UPDATE,
  };
};

export const updateAppVersion = async (
  input: UpdateAppVersionInput
): Promise<VersionCheckResponse> => {
  const platform = (input.platform || 'all').toLowerCase().trim();

  const updatePayload: Record<string, any> = {
    platform,
    updated_at: new Date().toISOString(),
  };

  if (input.latestVersion !== undefined) updatePayload.latest_version = input.latestVersion;
  if (input.minimumVersion !== undefined) updatePayload.minimum_version = input.minimumVersion;
  if (input.forceUpdate !== undefined) updatePayload.force_update = input.forceUpdate;
  if (input.releaseNotes !== undefined) updatePayload.release_notes = input.releaseNotes;
  if (input.storeUrl !== undefined) updatePayload.store_url = input.storeUrl;

  const { data, error } = await supabase
    .from('app_versions')
    .upsert(updatePayload, { onConflict: 'platform' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return {
    latestVersion: data.latest_version,
    minimumVersion: data.minimum_version,
    forceUpdate: Boolean(data.force_update),
    releaseNotes: data.release_notes || null,
    storeUrl: data.store_url || null,
  };
};
