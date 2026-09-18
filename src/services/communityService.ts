import { randomUUID } from 'crypto';
import { supabase } from '../config/database';
import { AuthClaims } from '../middleware/auth';
import {
  CreatePostInput,
  CreatePostResult,
  FeedPost,
  FeedResult,
  LikeResult,
  PostComment,
  CreateCommentResult,
  ClubDetail,
  CreateClubInput,
} from '../models/communityModel';

const POSTS_TABLE = 'community_posts';
const LIKES_TABLE = 'community_likes';
const COMMENTS_TABLE = 'community_comments';
const PROFILES_TABLE = 'profiles';
const CLUBS_TABLE = 'clubs';
const CLUB_MEMBERS_TABLE = 'club_members';
const IMAGES_BUCKET = 'community-images';

const DATA_URL_PREFIX = /^data:(image\/[\w+.-]+);base64,/;

interface ProfileRow {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  photo_base64: string | null;
  avatar_id: string | null;
}

/**
 * Fetches profiles by id in a dedicated query and returns them as a map.
 * We deliberately avoid PostgREST embedded joins (author:profiles(...)):
 * they depend on the schema cache, which has proven unreliable and caused
 * authors to randomly come back null. Two plain queries are deterministic.
 */
async function fetchProfilesMap(ids: string[]): Promise<Map<string, ProfileRow>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('id, username, first_name, last_name, photo_url, photo_base64, avatar_id')
    .in('id', uniqueIds);

  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p as ProfileRow]));
}

function mapAuthor(profile: ProfileRow | undefined, fallbackId: string) {
  if (!profile) return { id: fallbackId };
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || undefined;
  return {
    id: profile.id,
    username: profile.username ?? undefined,
    displayName,
    photoUrl: profile.photo_url || profile.photo_base64 || undefined,
    avatarId: profile.avatar_id ?? undefined,
  };
}

/**
 * Best-effort profile upsert from JWT claims so a post's author row
 * always exists (satisfies the FK) even on a fresh database.
 */
async function ensureProfile(claims: AuthClaims): Promise<void> {
  const meta = claims.user_metadata ?? {};

  const { error } = await supabase.from(PROFILES_TABLE).upsert(
    {
      id: claims.sub,
      email: claims.email ?? null,
      username: meta.username ?? (claims.email ? claims.email.split('@')[0] : null),
      photo_url: meta.avatar_url ?? meta.picture ?? null,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  if (error) {
    console.warn('ensureProfile upsert failed:', error.message);
  }
}

function parseBase64Image(input: string): { buffer: Buffer; contentType: string; extension: string } | null {
  if (!input || typeof input !== 'string') return null;

  const match = input.match(DATA_URL_PREFIX);
  const contentType = match?.[1] ?? 'image/jpeg';
  const raw = match ? input.slice(match[0].length) : input;
  const buffer = Buffer.from(raw, 'base64');

  if (buffer.length === 0) return null;

  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  return { buffer, contentType, extension };
}

async function uploadImages(postId: string, imagesBase64: string[]): Promise<string[]> {
  const urls: string[] = [];

  for (const image of imagesBase64) {
    const parsed = parseBase64Image(image);
    if (!parsed) continue;

    const path = `posts/${postId}/${randomUUID()}.${parsed.extension}`;
    const { error } = await supabase.storage
      .from(IMAGES_BUCKET)
      .upload(path, parsed.buffer, { contentType: parsed.contentType });

    if (error) {
      throw new Error(`Image upload failed: ${error.message}`);
    }

    const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

export async function createPost(input: CreatePostInput, author: AuthClaims): Promise<CreatePostResult> {
  await ensureProfile(author);

  const postId = randomUUID();
  const uploadedUrls = input.imagesBase64?.length
    ? await uploadImages(postId, input.imagesBase64)
    : [];

  const imagesUrl = [...(input.imagesUrl ?? []).filter(Boolean), ...uploadedUrls];

  const { data, error } = await supabase
    .from(POSTS_TABLE)
    .insert({
      id: postId,
      title: input.title,
      description: input.description,
      tag: input.tag ?? 'General',
      images_url: imagesUrl,
      author_id: author.sub,
      club_id: input.clubId ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    tag: data.tag,
    imagesUrl: data.images_url ?? [],
    clubId: data.club_id,
    createdAt: data.created_at,
  };
}

export async function getFeed(page: number, size: number, userId?: string): Promise<FeedResult> {
  const from = (page - 1) * size;
  const to = from + size - 1;

  const { data: posts, error } = await supabase
    .from(POSTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;
  if (!posts?.length) return { data: [], page, size };

  const postIds = posts.map((post) => post.id);

  const [profileMap, likesRes, commentsRes] = await Promise.all([
    fetchProfilesMap(posts.map((post) => post.author_id)),
    supabase.from(LIKES_TABLE).select('post_id, user_id').in('post_id', postIds),
    supabase.from(COMMENTS_TABLE).select('post_id').in('post_id', postIds),
  ]);

  const likeCounts = new Map<string, number>();
  const likedPostIds = new Set<string>();
  for (const like of likesRes.data ?? []) {
    likeCounts.set(like.post_id, (likeCounts.get(like.post_id) ?? 0) + 1);
    if (userId && like.user_id === userId) likedPostIds.add(like.post_id);
  }

  const commentCounts = new Map<string, number>();
  for (const comment of commentsRes.data ?? []) {
    commentCounts.set(comment.post_id, (commentCounts.get(comment.post_id) ?? 0) + 1);
  }

  const feed: FeedPost[] = posts.map((post: any) => ({
    id: post.id,
    title: post.title,
    description: post.description,
    tag: post.tag,
    imagesUrl: post.images_url ?? [],
    counts: {
      likes: likeCounts.get(post.id) ?? 0,
      comments: commentCounts.get(post.id) ?? 0,
      shares: 0,
    },
    likedByMe: userId ? likedPostIds.has(post.id) : false,
    author: mapAuthor(profileMap.get(post.author_id), post.author_id),
    clubId: post.club_id,
    createdAt: post.created_at,
  }));

  return { data: feed, page, size };
}

export async function likePost(postId: string, userId: string): Promise<LikeResult> {
  const { error } = await supabase
    .from(LIKES_TABLE)
    .insert({ post_id: postId, user_id: userId });

  // Unique violation = already liked; treat as success (idempotent)
  if (error && error.code !== '23505') throw error;

  return { liked: true, likesCount: await getLikesCount(postId) };
}

export async function unlikePost(postId: string, userId: string): Promise<LikeResult> {
  const { error } = await supabase
    .from(LIKES_TABLE)
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);

  if (error) throw error;

  return { liked: false, likesCount: await getLikesCount(postId) };
}

async function getLikesCount(postId: string): Promise<number> {
  const { count, error } = await supabase
    .from(LIKES_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId);

  if (error) throw error;
  return count ?? 0;
}

export async function addComment(
  postId: string,
  text: string,
  userId: string,
  parentCommentId?: string
): Promise<CreateCommentResult> {
  await ensureProfileExists(userId);

  const { data, error } = await supabase
    .from(COMMENTS_TABLE)
    .insert({
      post_id: postId,
      user_id: userId,
      text,
      parent_id: parentCommentId ?? null,
    })
    .select('id, created_at')
    .single();

  if (error) throw error;
  return { id: data.id, createdAt: data.created_at };
}

async function ensureProfileExists(userId: string): Promise<void> {
  const { error } = await supabase
    .from(PROFILES_TABLE)
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    console.warn('ensureProfileExists failed:', error.message);
  }
}

export async function getComments(postId: string): Promise<PostComment[]> {
  const { data: rows, error } = await supabase
    .from(COMMENTS_TABLE)
    .select('id, text, parent_id, created_at, user_id')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const profileMap = await fetchProfilesMap((rows ?? []).map((row) => row.user_id));

  const nodes = new Map<string, PostComment>();
  for (const row of rows ?? []) {
    nodes.set(row.id, {
      id: row.id,
      text: row.text,
      parentId: row.parent_id ?? null,
      author: mapAuthor(profileMap.get(row.user_id), row.user_id),
      createdAt: row.created_at,
      children: [],
      commentsCount: 0,
    });
  }

  const roots: PostComment[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const countTree = (node: PostComment): number => {
    const total = node.children.reduce((sum, child) => sum + countTree(child), 0);
    node.commentsCount = total;
    return total + 1;
  };
  roots.forEach(countTree);

  // Newest top-level comments first; replies oldest-first within a thread
  return roots.reverse();
}

export async function getPostById(postId: string, userId?: string): Promise<FeedPost | null> {
  const { data: post, error } = await supabase
    .from(POSTS_TABLE)
    .select('*')
    .eq('id', postId)
    .single();

  if (error || !post) return null;

  const [profileMap, likesRes, commentsRes] = await Promise.all([
    fetchProfilesMap([post.author_id]),
    supabase.from(LIKES_TABLE).select('user_id').eq('post_id', postId),
    supabase.from(COMMENTS_TABLE).select('id').eq('post_id', postId),
  ]);

  const likes = likesRes.data ?? [];

  return {
    id: post.id,
    title: post.title,
    description: post.description,
    tag: post.tag,
    imagesUrl: post.images_url ?? [],
    counts: {
      likes: likes.length,
      comments: commentsRes.data?.length ?? 0,
      shares: 0,
    },
    likedByMe: userId ? likes.some((like) => like.user_id === userId) : false,
    author: mapAuthor(profileMap.get(post.author_id), post.author_id),
    clubId: post.club_id,
    createdAt: post.created_at,
  };
}

export async function createClub(input: CreateClubInput, author: AuthClaims): Promise<ClubDetail> {
  await ensureProfileExists(author.sub);

  const clubId = randomUUID();

  // Create club
  const { data: clubData, error: clubError } = await supabase
    .from(CLUBS_TABLE)
    .insert({
      id: clubId,
      name: input.name,
      description: input.description ?? '',
      tag: input.tag ?? 'General',
      location_text: input.locationText ?? '',
      cover_image_url: input.coverImageUrl ?? '',
      profile_image_url: input.profileImageUrl ?? '',
      theme: input.theme ?? 'green',
      status: 'pending',
      created_by: author.sub,
    })
    .select()
    .single();

  if (clubError) throw clubError;

  // Add creator as admin
  const { error: memberError } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .insert({
      club_id: clubId,
      user_id: author.sub,
      role: 'admin',
    });

  if (memberError) throw memberError;

  return {
    id: clubData.id,
    name: clubData.name,
    description: clubData.description,
    tag: clubData.tag,
    locationText: clubData.location_text,
    coverImageUrl: clubData.cover_image_url,
    profileImageUrl: clubData.profile_image_url,
    theme: clubData.theme,
    status: clubData.status,
    membersCount: 1,
    joined: true,
    createdAt: clubData.created_at,
  };
}

export async function getClubs(userId?: string): Promise<ClubDetail[]> {
  let query = supabase.from(CLUBS_TABLE).select('*');
  if (userId) {
    query = query.or(`status.eq.approved,and(status.eq.pending,created_by.eq.${userId})`);
  } else {
    query = query.eq('status', 'approved');
  }
  
  const { data: clubs, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  if (!clubs?.length) return [];

  const clubIds = clubs.map((c: any) => c.id);

  // Fetch all members to compute counts and joined status
  const { data: membersRes, error: membersError } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('club_id, user_id')
    .in('club_id', clubIds);

  if (membersError) throw membersError;

  const memberCounts = new Map<string, number>();
  const myJoinedClubs = new Set<string>();

  for (const member of membersRes ?? []) {
    memberCounts.set(member.club_id, (memberCounts.get(member.club_id) ?? 0) + 1);
    if (userId && member.user_id === userId) {
      myJoinedClubs.add(member.club_id);
    }
  }

  return clubs.map((club: any) => ({
    id: club.id,
    name: club.name,
    description: club.description,
    tag: club.tag,
    locationText: club.location_text,
    coverImageUrl: club.cover_image_url,
    profileImageUrl: club.profile_image_url,
    theme: club.theme,
    status: club.status,
    membersCount: memberCounts.get(club.id) ?? 0,
    joined: userId ? myJoinedClubs.has(club.id) : false,
    createdAt: club.created_at,
  }));
}
