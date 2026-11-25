import { supabase } from '../config/database';

export const SUPPORTED_SHARE_PREVIEW_TYPES = [
  'challenges',
  'posts',
  'news',
  'clubs',
] as const;

export type SharePreviewType = (typeof SUPPORTED_SHARE_PREVIEW_TYPES)[number];

export interface PublicSharePreview {
  title: string;
  description: string;
  imageUrl: string | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidSharePreviewType(type: string): type is SharePreviewType {
  return (SUPPORTED_SHARE_PREVIEW_TYPES as readonly string[]).includes(type);
}

export function isValidUuid(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export function normalizePublicImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^`+|`+$/g, '').trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'string') {
    return null;
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return null;
}

export function truncateSnippet(raw: unknown, maxLength = 200): string {
  if (typeof raw !== 'string') return '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

function isSoftDeleted(row: Record<string, any> | null | undefined): boolean {
  return Boolean(row && row.deleted_at !== null && row.deleted_at !== undefined);
}

async function getChallengePreview(id: string): Promise<PublicSharePreview | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116' || error.code === '22P02') return null;
    throw error;
  }

  if (!data || isSoftDeleted(data)) return null;

  // Club-members-only challenges are not publicly accessible to non-members
  if (data.who_can_join === 'club_members') return null;

  const title =
    (typeof data.title === 'string' && data.title.trim()) || 'Sabi Sweat Challenge';
  const description = truncateSnippet(
    (typeof data.subtitle === 'string' && data.subtitle.trim()) ||
      data.description ||
      ''
  );
  const imageUrl =
    normalizePublicImageUrl(data.hero_image_url) ??
    normalizePublicImageUrl(data.challenge_image) ??
    null;

  return { title, description, imageUrl };
}

async function getClubPreview(id: string): Promise<PublicSharePreview | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116' || error.code === '22P02') return null;
    throw error;
  }

  if (!data || isSoftDeleted(data)) return null;

  // Pending or rejected clubs are never visible to non-members
  if (data.status && data.status !== 'approved') return null;

  const title =
    (typeof data.name === 'string' && data.name.trim()) || 'Sabi Sweat Club';
  const description = truncateSnippet(data.description || '');
  const imageUrl =
    normalizePublicImageUrl(data.profile_image_url) ??
    normalizePublicImageUrl(data.cover_image_url) ??
    null;

  return { title, description, imageUrl };
}

async function getNewsPreview(id: string): Promise<PublicSharePreview | null> {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116' || error.code === '22P02') return null;
    throw error;
  }

  if (!data || isSoftDeleted(data)) return null;

  const headline =
    (typeof data.subtitle === 'string' && data.subtitle.trim()) ||
    (typeof data.title === 'string' && data.title.trim()) ||
    'Sabi Sweat News';
  const description = truncateSnippet(
    data.description || data.subtitle || data.title || ''
  );
  const imageUrl = normalizePublicImageUrl(data.image_url);

  return {
    title: headline,
    description,
    imageUrl,
  };
}

async function getPostPreview(id: string): Promise<PublicSharePreview | null> {
  let { data: post, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error && error.code === 'PGRST205') {
    const fallback = await supabase
      .from('community_posts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    post = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (error.code === 'PGRST116' || error.code === '22P02') return null;
    throw error;
  }

  if (!post || isSoftDeleted(post)) return null;

  // Posts belonging to private or unapproved clubs must return 404
  if (post.club_id) {
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, is_private, status')
      .eq('id', post.club_id)
      .maybeSingle();

    if (clubError) {
      if (clubError.code === 'PGRST116' || clubError.code === '22P02') return null;
      throw clubError;
    }

    if (
      !club ||
      isSoftDeleted(club) ||
      club.is_private !== false ||
      (club.status && club.status !== 'approved')
    ) {
      return null;
    }
  }

  const title =
    (typeof post.title === 'string' && post.title.trim()) ||
    truncateSnippet(post.description, 80) ||
    'Sabi Sweat Post';
  const description = truncateSnippet(post.description || post.title || '');
  const images: unknown[] = Array.isArray(post.images_url) ? post.images_url : [];
  const imageUrl =
    images.map(normalizePublicImageUrl).find((u): u is string => u !== null) ?? null;

  return { title, description, imageUrl };
}

export async function getPublicSharePreview(
  type: SharePreviewType,
  id: string
): Promise<PublicSharePreview | null> {
  if (!isValidUuid(id)) return null;
  const normalizedId = id.trim();

  switch (type) {
    case 'challenges':
      return getChallengePreview(normalizedId);
    case 'clubs':
      return getClubPreview(normalizedId);
    case 'news':
      return getNewsPreview(normalizedId);
    case 'posts':
      return getPostPreview(normalizedId);
  }
}
