export interface AppVersionRecord {
  id: string;
  platform: string;
  latest_version: string;
  minimum_version: string;
  force_update: boolean;
  release_notes?: string | null;
  store_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VersionCheckResponse {
  latestVersion: string;
  minimumVersion: string;
  forceUpdate: boolean;
  releaseNotes?: string | null;
  storeUrl?: string | null;
}

export interface UpdateAppVersionInput {
  platform?: string;
  latestVersion?: string;
  minimumVersion?: string;
  forceUpdate?: boolean;
  releaseNotes?: string;
  storeUrl?: string;
}
