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
  CreateEventInput,
  ClubEvent,
  CommunityPollResult,
  PollResultOption,
  ClubAnnouncement,
  CreateAnnouncementInput,
  ReportClubInput,
  MyPostsResult,
  PaginatedClubsResponse,
  CancelJoinRequestResult,
} from '../models/communityModel';
import {
  handleClubAnnouncementEvent,
  handleClubPostEvent,
  handleJoinClubRequestEvent,
  handleJoinClubApprovedEvent,
  handleClubEventCreatedEvent,
  handlePostLikeEvent,
  handlePostCommentEvent,
} from './notificationEventService';

const POSTS_TABLE = 'posts';
const LIKES_TABLE = 'community_likes';
const COMMENTS_TABLE = 'community_comments';
const PROFILES_TABLE = 'profiles';
const CLUBS_TABLE = 'clubs';
const CLUB_MEMBERS_TABLE = 'club_members';
const POLL_OPTIONS_TABLE = 'community_poll_options';
const POLL_VOTES_TABLE = 'community_poll_votes';
const CLUB_EVENTS_TABLE = 'club_events';
const CLUB_EVENT_RSVPS_TABLE = 'club_event_rsvps';
const CLUB_ANNOUNCEMENTS_TABLE = 'club_announcements';
const CLUB_ANNOUNCEMENT_READS_TABLE = 'club_announcement_reads';
const CLUB_REPORTS_TABLE = 'club_reports';
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

function resolvePostTags(post: any): { tag?: string; tags?: string[] } {
  let tags: string[] = [];
  if (Array.isArray(post.tags) && post.tags.length > 0) {
    tags = post.tags.map((t: any) => String(t).trim()).filter(Boolean);
  } else if (typeof post.tag === 'string' && post.tag.trim()) {
    tags = post.tag.split(',').map((t: string) => t.trim()).filter(Boolean);
  }
  return {
    tag: tags[0] || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

export async function createPost(input: CreatePostInput, author: AuthClaims): Promise<CreatePostResult> {
  await ensureProfile(author);

  if (input.clubId) {
    const { data: membership } = await supabase
      .from(CLUB_MEMBERS_TABLE)
      .select('role')
      .eq('club_id', input.clubId)
      .eq('user_id', author.sub)
      .single();
    if (!membership) {
      throw new Error('You must be a member of this club to post.');
    }
  }

  const postId = randomUUID();
  const uploadedUrls = input.imagesBase64?.length
    ? await uploadImages(postId, input.imagesBase64)
    : [];

  const imagesUrl = [...(input.imagesUrl ?? []).filter(Boolean), ...uploadedUrls];

  let tagsList: string[] = [];
  if (Array.isArray(input.tags)) {
    tagsList = input.tags.map((t: any) => String(t).trim()).filter(Boolean);
  } else if (Array.isArray(input.tag)) {
    tagsList = input.tag.map((t: any) => String(t).trim()).filter(Boolean);
  } else if (typeof input.tag === 'string' && input.tag.trim()) {
    tagsList = [input.tag.trim()];
  } else if (typeof input.tags === 'string' && (input.tags as any).trim()) {
    tagsList = [(input.tags as any).trim()];
  }
  const primaryTag = tagsList[0] || '';

  const basePayload: Record<string, any> = {
    id: postId,
    title: input.title?.trim() || '',
    description: input.description,
    tag: primaryTag,
    images_url: imagesUrl,
    author_id: author.sub,
    user_id: author.sub,
    club_id: (input.clubId && input.clubId.trim() !== '') ? input.clubId : null,
  };

  let insertRes = await supabase
    .from(POSTS_TABLE)
    .insert({ ...basePayload, tags: tagsList })
    .select()
    .single();

  if (insertRes.error && insertRes.error.message?.includes('tags')) {
    insertRes = await supabase
      .from(POSTS_TABLE)
      .insert(basePayload)
      .select()
      .single();
  }

  if (insertRes.error && (insertRes.error.message?.includes('author_id') || insertRes.error.message?.includes('user_id'))) {
    const fallbackPayload = { ...basePayload };
    if (insertRes.error.message?.includes('author_id')) delete fallbackPayload.author_id;
    if (insertRes.error.message?.includes('user_id')) delete fallbackPayload.user_id;
    insertRes = await supabase
      .from(POSTS_TABLE)
      .insert(tagsList.length > 0 ? { ...fallbackPayload, tags: tagsList } : fallbackPayload)
      .select()
      .single();
  }

  if (insertRes.error && insertRes.error.code === 'PGRST205') {
    const commPayload = {
      id: postId,
      title: input.title?.trim() || '',
      description: input.description,
      tag: primaryTag,
      tags: tagsList,
      images_url: imagesUrl,
      author_id: author.sub,
      club_id: (input.clubId && input.clubId.trim() !== '') ? input.clubId : null,
    };
    insertRes = await supabase
      .from('community_posts')
      .insert(commPayload)
      .select()
      .single();
  }

  if (insertRes.error) throw insertRes.error;
  const data = insertRes.data;

  if (input.pollOptions && input.pollOptions.length > 0) {
    const optionsToInsert = input.pollOptions.map((text) => ({
      post_id: postId,
      text,
    }));
    const { error: pollError } = await supabase.from(POLL_OPTIONS_TABLE).insert(optionsToInsert);
    if (pollError) throw pollError;
  }

  const resolved = resolvePostTags(data);

  if (data.club_id) {
    handleClubPostEvent(data.id).catch((err) =>
      console.warn('[communityService] Error handling club post event:', err)
    );
  }

  return {
    id: data.id,
    title: data.title?.trim() || undefined,
    description: data.description,
    tag: resolved.tag,
    tags: resolved.tags,
    imagesUrl: data.images_url ?? [],
    clubId: data.club_id,
    createdAt: data.created_at,
  };
}

export async function getFeed(page: number, size: number, userId?: string): Promise<FeedResult> {
  const from = (page - 1) * size;
  const to = from + size - 1;

  let { data: posts, error } = await supabase
    .from(POSTS_TABLE)
    .select('*')
    .is('club_id', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error && error.code === 'PGRST205') {
    const fb = await supabase
      .from('community_posts')
      .select('*')
      .is('club_id', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    posts = fb.data;
    error = fb.error;
  }

  if (error) throw error;
  if (!posts?.length) return { data: [], page, size };

  const postIds = posts.map((post) => post.id);

  const [profileMap, likesRes, commentsRes] = await Promise.all([
    fetchProfilesMap(posts.map((post) => post.author_id || post.user_id)),
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

  const feed: FeedPost[] = posts.map((post: any) => {
    const postAuthorId = post.author_id || post.user_id;
    const authorProfile = profileMap.get(postAuthorId);
    const resolved = resolvePostTags(post);
    return {
      id: post.id,
      title: post.title || undefined,
      description: post.description,
      tag: resolved.tag,
      tags: resolved.tags,
      imagesUrl: post.images_url ?? [],
      counts: {
        likes: likeCounts.get(post.id) ?? 0,
        comments: commentCounts.get(post.id) ?? 0,
        shares: post.shares_count ?? 0,
      },
      likedByMe: userId ? likedPostIds.has(post.id) : false,
      author: mapAuthor(authorProfile, postAuthorId),
      clubId: post.club_id,
      createdAt: post.created_at,
    };
  });

  return { data: feed, page, size };
}

export async function getClubPosts(clubId: string, page: number, size: number, userId?: string): Promise<FeedResult> {
  if (userId) {
    const { data: membership } = await supabase
      .from(CLUB_MEMBERS_TABLE)
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', userId)
      .single();
    if (!membership) {
      throw new Error('Access Denied: You must be a member of this club to view its posts.');
    }
  }

  const from = (page - 1) * size;
  const to = from + size - 1;

  let { data: posts, error } = await supabase
    .from(POSTS_TABLE)
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error && error.code === 'PGRST205') {
    const fb = await supabase
      .from('community_posts')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .range(from, to);
    posts = fb.data;
    error = fb.error;
  }

  if (error) throw error;
  if (!posts?.length) return { data: [], page, size };

  const postIds = posts.map((post) => post.id);

  const [profileMap, likesRes, commentsRes, pollOptionsRes, pollVotesRes] = await Promise.all([
    fetchProfilesMap(posts.map((post) => post.author_id || post.user_id)),
    supabase.from(LIKES_TABLE).select('post_id, user_id').in('post_id', postIds),
    supabase.from(COMMENTS_TABLE).select('post_id').in('post_id', postIds),
    supabase.from(POLL_OPTIONS_TABLE).select('*').in('post_id', postIds),
    userId ? supabase.from(POLL_VOTES_TABLE).select('option_id').eq('user_id', userId) : Promise.resolve({ data: [] }),
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

  const myVotedOptionIds = new Set((pollVotesRes.data ?? []).map((v) => v.option_id));

  // Get vote counts for all options in these posts
  const optionIds = (pollOptionsRes.data ?? []).map((o) => o.id);
  let allVotesData: any[] = [];
  if (optionIds.length > 0) {
    const { data } = await supabase.from(POLL_VOTES_TABLE).select('option_id').in('option_id', optionIds);
    allVotesData = data ?? [];
  }
  const voteCounts = new Map<string, number>();
  for (const v of allVotesData) {
    voteCounts.set(v.option_id, (voteCounts.get(v.option_id) ?? 0) + 1);
  }

  const feed: FeedPost[] = posts.map((post: any) => {
    const postAuthorId = post.author_id || post.user_id;
    const authorProfile = profileMap.get(postAuthorId);
    const postOptions = (pollOptionsRes.data ?? []).filter((o) => o.post_id === post.id);
    const totalVotes = postOptions.reduce((acc, o) => acc + (voteCounts.get(o.id) ?? 0), 0);
    const options = postOptions.map((o) => {
      const votesCount = voteCounts.get(o.id) ?? 0;
      return {
        id: o.id,
        text: o.text,
        votesCount,
        percent: totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0,
        votedByMe: myVotedOptionIds.has(o.id),
      };
    });

    const resolved = resolvePostTags(post);
    return {
      id: post.id,
      title: post.title || undefined,
      description: post.description,
      tag: resolved.tag,
      tags: resolved.tags,
      imagesUrl: post.images_url ?? [],
      counts: {
        likes: likeCounts.get(post.id) ?? 0,
        comments: commentCounts.get(post.id) ?? 0,
        shares: post.shares_count ?? 0,
      },
      likedByMe: userId ? likedPostIds.has(post.id) : false,
      author: mapAuthor(authorProfile, postAuthorId),
      clubId: post.club_id,
      pollOptions: options.length > 0 ? options : undefined,
      createdAt: post.created_at,
    };
  });

  return { data: feed, page, size };
}

export async function likePost(postId: string, userId: string): Promise<LikeResult> {
  const { error } = await supabase
    .from(LIKES_TABLE)
    .insert({ post_id: postId, user_id: userId });

  // Unique violation = already liked; treat as success (idempotent)
  if (error && error.code !== '23505') throw error;

  if (!error) {
    handlePostLikeEvent(postId, userId).catch((err) =>
      console.warn('[communityService] Error handling post like event:', err)
    );
  }

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

export async function voteOnPoll(optionId: string, userId: string): Promise<void> {
  // Find the poll this option belongs to
  const { data: option, error: optionError } = await supabase
    .from(POLL_OPTIONS_TABLE)
    .select('id, post_id')
    .eq('id', optionId)
    .single();

  if (optionError || !option) throw new Error('Poll option not found');

  // One vote per user per poll: remove any existing vote in this poll first
  const { data: siblingOptions } = await supabase
    .from(POLL_OPTIONS_TABLE)
    .select('id')
    .eq('post_id', option.post_id);

  const siblingIds = (siblingOptions ?? []).map((o) => o.id);

  if (siblingIds.length) {
    await supabase
      .from(POLL_VOTES_TABLE)
      .delete()
      .eq('user_id', userId)
      .in('option_id', siblingIds);
  }

  const { error: insertError } = await supabase
    .from(POLL_VOTES_TABLE)
    .insert({ option_id: optionId, user_id: userId });

  if (insertError && insertError.code !== '23505') throw insertError;
}

export async function getCommunityPollResult(postId: string): Promise<CommunityPollResult | null> {
  let { data: post, error: postError } = await supabase
    .from(POSTS_TABLE)
    .select('id, title, club_id')
    .eq('id', postId)
    .maybeSingle();

  if (postError && postError.code === 'PGRST205') {
    const fb = await supabase
      .from('community_posts')
      .select('id, title, club_id')
      .eq('id', postId)
      .maybeSingle();
    post = fb.data;
    postError = fb.error;
  }

  if (postError || !post) return null;

  const { data: options, error: optionsError } = await supabase
    .from(POLL_OPTIONS_TABLE)
    .select('id, text')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (optionsError) throw optionsError;
  if (!options?.length) return null;

  const optionIds = options.map((o) => o.id);
  const { data: votes, error: votesError } = await supabase
    .from(POLL_VOTES_TABLE)
    .select('option_id, created_at, author:profiles(id, username, first_name, last_name, photo_url, photo_base64, avatar_id)')
    .in('option_id', optionIds)
    .order('created_at', { ascending: false });

  if (votesError) throw votesError;

  let totalMembers = 0;
  if (post.club_id) {
    const { count } = await supabase
      .from(CLUB_MEMBERS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('club_id', post.club_id);
    totalMembers = count ?? 0;
  }

  const resultOptions: PollResultOption[] = options.map((opt) => {
    const optionVotes = (votes || []).filter((v) => v.option_id === opt.id);
    return {
      id: opt.id,
      text: opt.text,
      votesCount: optionVotes.length,
      voters: optionVotes.map((v) => {
        const p = Array.isArray(v.author) ? v.author[0] : v.author;
        return {
          id: p?.id ?? 'unknown',
          username: p?.username ?? undefined,
          firstName: p?.first_name ?? undefined,
          lastName: p?.last_name ?? undefined,
          photoUrl: p?.photo_url ?? (p?.photo_base64 ? `data:image/jpeg;base64,${p.photo_base64}` : undefined),
          avatarId: p?.avatar_id ?? undefined,
          votedAt: v.created_at,
        };
      }),
    };
  });

  return {
    question: post.title || 'Poll',
    totalVotes: votes?.length || 0,
    totalMembers,
    options: resultOptions,
  };
}

async function updateClubMembersCount(clubId: string) {
  const { count, error: countError } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('club_id', clubId);

  if (!countError && count !== null) {
    await supabase.from(CLUBS_TABLE).update({ members_count: count }).eq('id', clubId);
  }
}

export async function updateClubNotificationPreference(
  clubId: string,
  userId: string,
  preference: string
): Promise<{ success: boolean; clubId: string; notificationPreference: string }> {
  const allowed = ['all_posts', 'announcements', 'admin_posts', 'off'];
  if (!allowed.includes(preference)) {
    const err: any = new Error(`Invalid notification preference. Must be one of: ${allowed.join(', ')}`);
    err.status = 400;
    throw err;
  }

  // Verify that the user is an active member of this club
  const { data: member, error: mErr } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('user_id, role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();

  if (mErr) throw mErr;
  if (!member) {
    const err: any = new Error('User is not a member of this club');
    err.status = 404;
    throw err;
  }

  const { error: updateErr } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .update({ notification_preference: preference })
    .eq('club_id', clubId)
    .eq('user_id', userId);

  if (updateErr) throw updateErr;

  return {
    success: true,
    clubId,
    notificationPreference: preference,
  };
}

export async function updateClubDescription(clubId: string, description: string, userId: string) {
  // First verify user is admin
  const { data: member } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .single();

  if (!member || member.role !== 'admin') {
    throw new Error('Only club admins can update the description');
  }

  const { data, error } = await supabase
    .from(CLUBS_TABLE)
    .update({ description })
    .eq('id', clubId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getClubMembers(clubId: string, page: number, size: number) {
  const from = (page - 1) * size;
  const to = from + size - 1;

  const { data: members, error, count } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select(`
      role,
      joined_at,
      profiles (
        id,
        first_name,
        last_name,
        username,
        photo_url,
        avatar_id,
        city,
        country
      )
    `, { count: 'exact' })
    .eq('club_id', clubId)
    .order('role', { ascending: true })
    .order('joined_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    data: (members ?? []).map((m: any) => ({
      role: m.role,
      joinedAt: m.joined_at,
      user: m.profiles ? {
        id: m.profiles.id,
        firstName: m.profiles.first_name,
        lastName: m.profiles.last_name,
        username: m.profiles.username,
        photoUrl: m.profiles.photo_url,
        avatarId: m.profiles.avatar_id,
        displayName: [m.profiles.first_name, m.profiles.last_name].filter(Boolean).join(' ') || undefined,
        location: [m.profiles.city, m.profiles.country].filter(Boolean).join(', ') || undefined,
      } : null,
    })),
    page,
    size,
    total: count ?? 0,
  };
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

  if (data?.id) {
    handlePostCommentEvent(data.id).catch((err) =>
      console.warn('[communityService] Error handling post comment event:', err)
    );
  }

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
  let { data: post, error } = await supabase
    .from(POSTS_TABLE)
    .select('*')
    .eq('id', postId)
    .maybeSingle();

  if (error && error.code === 'PGRST205') {
    const fb = await supabase
      .from('community_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();
    post = fb.data;
    error = fb.error;
  }

  if (error || !post) return null;

  const postAuthorId = post.author_id || post.user_id;

  const [profileMap, likesRes, commentsRes] = await Promise.all([
    fetchProfilesMap([postAuthorId]),
    supabase.from(LIKES_TABLE).select('user_id').eq('post_id', postId),
    supabase.from(COMMENTS_TABLE).select('id').eq('post_id', postId),
  ]);

  const likes = likesRes.data ?? [];

  const resolved = resolvePostTags(post);
  return {
    id: post.id,
    title: post.title || undefined,
    description: post.description,
    tag: resolved.tag,
    tags: resolved.tags,
    imagesUrl: post.images_url ?? [],
    counts: {
      likes: likes.length,
      comments: commentsRes.data?.length ?? 0,
      shares: post.shares_count ?? 0,
    },
    likedByMe: userId ? likes.some((like) => like.user_id === userId) : false,
    author: mapAuthor(profileMap.get(postAuthorId), postAuthorId),
    clubId: post.club_id,
    createdAt: post.created_at,
  };
}

export async function createClub(input: CreateClubInput, author: AuthClaims): Promise<ClubDetail> {
  await ensureProfileExists(author.sub);

  const clubId = randomUUID();

  let profileImageUrl = input.profileImageUrl ?? '';
  if (input.profileImageBase64) {
    const parsed = parseBase64Image(input.profileImageBase64);
    if (parsed) {
      const path = `clubs/${clubId}/profile_${randomUUID()}.${parsed.extension}`;
      const { error: uploadError } = await supabase.storage
        .from(IMAGES_BUCKET)
        .upload(path, parsed.buffer, { contentType: parsed.contentType });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
        profileImageUrl = urlData.publicUrl;
      } else {
        console.warn('Club profile image upload failed:', uploadError.message);
      }
    }
  }

  const tagValue = (input.clubId ? input.clubId.trim().replace(/^@/, '') : input.tag) ?? 'General';

  const locationScope = input.locationScope ?? (
    input.countries && input.countries.length > 0
      ? 'multiple'
      : (input.country ? 'single' : 'global')
  );

  const rowToInsert: Record<string, any> = {
    id: clubId,
    name: input.name,
    description: input.description ?? '',
    tag: tagValue,
    location_scope: locationScope,
    location_text: input.locationText ?? '',
    country: input.country ?? null,
    country_code: input.countryCode ?? null,
    regions: input.regions ?? [],
    countries: input.countries ?? null,
    cover_image_url: input.coverImageUrl ?? '',
    profile_image_url: profileImageUrl,
    theme: input.theme ?? 'green',
    status: 'pending',
    created_by: author.sub,
  };

  // Create club
  let { data: clubData, error: clubError } = await supabase
    .from(CLUBS_TABLE)
    .insert(rowToInsert)
    .select()
    .single();

  if (clubError && clubError.message?.includes('location_scope')) {
    delete rowToInsert.location_scope;
    delete rowToInsert.country;
    delete rowToInsert.country_code;
    delete rowToInsert.regions;
    delete rowToInsert.countries;
    const retry = await supabase
      .from(CLUBS_TABLE)
      .insert(rowToInsert)
      .select()
      .single();
    clubData = retry.data;
    clubError = retry.error;
  }

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
    clubId: clubData.tag || clubData.id,
    name: clubData.name,
    description: clubData.description,
    tag: clubData.tag,
    locationScope: clubData.location_scope || locationScope,
    locationText: clubData.location_text || input.locationText || '',
    country: clubData.country ?? input.country ?? null,
    countryCode: clubData.country_code ?? input.countryCode ?? null,
    regions: Array.isArray(clubData.regions) ? clubData.regions : (input.regions ?? []),
    countries: clubData.countries ?? input.countries ?? null,
    coverImageUrl: clubData.cover_image_url,
    profileImageUrl: clubData.profile_image_url,
    theme: clubData.theme,
    status: clubData.status,
    membersCount: 1,
    joinStatus: 'joined',
    isAdmin: true,
    createdAt: clubData.created_at,
  };
}

export async function getClubs(
  userId?: string,
  page: number = 1,
  size: number = 10
): Promise<PaginatedClubsResponse> {
  const currentPage = Math.max(1, page);
  const pageSize = Math.max(1, size);

  let query = supabase.from(CLUBS_TABLE).select('*');
  if (userId) {
    query = query.or(`status.eq.approved,and(status.eq.pending,created_by.eq.${userId})`);
  } else {
    query = query.eq('status', 'approved');
  }
  
  const { data: clubs, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;
  if (!clubs?.length) {
    return { page: currentPage, size: pageSize, total: 0, hasMore: false, data: [] };
  }

  const total = clubs.length;
  const start = (currentPage - 1) * pageSize;
  const pageClubs = clubs.slice(start, start + pageSize);
  const hasMore = currentPage * pageSize < total;

  if (pageClubs.length === 0) {
    return { page: currentPage, size: pageSize, total, hasMore: false, data: [] };
  }

  const pageClubIds = pageClubs.map((c: any) => c.id);

  // 1. Resolve exact member count for each club on the current page in parallel
  const [memberCountEntries, myMembershipsRes, myRequestsRes] = await Promise.all([
    Promise.all(
      pageClubs.map(async (club: any) => {
        try {
          const { count, error } = await supabase
            .from(CLUB_MEMBERS_TABLE)
            .select('*', { count: 'exact', head: true })
            .eq('club_id', club.id);
          if (!error && typeof count === 'number') {
            return [club.id, count] as const;
          }
        } catch {
          // fallback to club.members_count
        }
        const fallback = typeof club.members_count === 'number' ? club.members_count : 0;
        return [club.id, fallback] as const;
      })
    ),
    userId && pageClubIds.length > 0
      ? supabase
          .from(CLUB_MEMBERS_TABLE)
          .select('club_id, role')
          .eq('user_id', userId)
          .in('club_id', pageClubIds)
      : Promise.resolve({ data: [] }),
    userId && pageClubIds.length > 0
      ? supabase
          .from('club_join_requests')
          .select('club_id')
          .eq('user_id', userId)
          .eq('status', 'pending')
          .in('club_id', pageClubIds)
      : Promise.resolve({ data: [] }),
  ]);

  const memberCounts = new Map<string, number>(memberCountEntries);
  const myJoinedClubs = new Set<string>();
  const myAdminClubs = new Set<string>();

  for (const member of myMembershipsRes.data ?? []) {
    myJoinedClubs.add(member.club_id);
    if (member.role === 'admin') {
      myAdminClubs.add(member.club_id);
    }
  }

  const myPendingRequests = new Set<string>(
    (myRequestsRes.data ?? []).map((req: any) => req.club_id)
  );

  const data = pageClubs.map((club: any) => ({
    id: club.id,
    clubId: club.tag || club.id,
    name: club.name,
    description: club.description,
    tag: club.tag,
    locationScope: club.location_scope || 'global',
    locationText: club.location_text || '',
    country: club.country ?? null,
    countryCode: club.country_code ?? null,
    regions: Array.isArray(club.regions) ? club.regions : [],
    countries: club.countries ?? null,
    coverImageUrl: club.cover_image_url,
    profileImageUrl: club.profile_image_url,
    theme: club.theme,
    status: club.status,
    membersCount: memberCounts.get(club.id) ?? (typeof club.members_count === 'number' ? club.members_count : 0),
    joinStatus: (userId ? (myJoinedClubs.has(club.id) ? 'joined' : (myPendingRequests.has(club.id) ? 'pending' : 'none')) : 'none') as 'joined' | 'pending' | 'none',
    isAdmin: userId ? myAdminClubs.has(club.id) : false,
    createdAt: club.created_at,
  }));

  return {
    page: currentPage,
    size: pageSize,
    total,
    hasMore,
    data,
  };
}

export async function getClubById(clubId: string, userId?: string): Promise<ClubDetail | null> {
  const { data: club, error } = await supabase
    .from(CLUBS_TABLE)
    .select('*')
    .eq('id', clubId)
    .single();

  if (error || !club) return null;

  const [countRes, membershipRes, pendingRes] = await Promise.all([
    supabase
      .from(CLUB_MEMBERS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('club_id', clubId),
    userId
      ? supabase
          .from(CLUB_MEMBERS_TABLE)
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    userId
      ? supabase
          .from('club_join_requests')
          .select('status')
          .eq('club_id', clubId)
          .eq('user_id', userId)
          .eq('status', 'pending')
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const exactCount = typeof countRes.count === 'number'
    ? countRes.count
    : (typeof club.members_count === 'number' ? club.members_count : 0);

  const membership = membershipRes.data;
  const isMember = !!membership;
  const isAdmin = membership?.role === 'admin';
  const isPending = !isMember && !!pendingRes.data;

  return {
    id: club.id,
    clubId: club.tag || club.id,
    name: club.name,
    description: club.description,
    tag: club.tag,
    locationScope: club.location_scope || 'global',
    locationText: club.location_text || '',
    country: club.country ?? null,
    countryCode: club.country_code ?? null,
    regions: Array.isArray(club.regions) ? club.regions : [],
    countries: club.countries ?? null,
    coverImageUrl: club.cover_image_url,
    profileImageUrl: club.profile_image_url,
    theme: club.theme,
    status: club.status,
    membersCount: exactCount,
    joinStatus: userId ? (isMember ? 'joined' : (isPending ? 'pending' : 'none')) : 'none',
    isAdmin: userId ? isAdmin : false,
    createdAt: club.created_at,
  };
}

export async function createClubEvent(clubId: string, input: CreateEventInput, author: AuthClaims): Promise<ClubEvent> {
  await ensureProfileExists(author.sub);

  const { data: membership } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', author.sub)
    .single();

  if (!membership || membership.role !== 'admin') {
    throw new Error('Only club admins can create events.');
  }

  const { data, error } = await supabase
    .from(CLUB_EVENTS_TABLE)
    .insert({
      club_id: clubId,
      title: input.title,
      description: input.description ?? '',
      location_text: input.locationText ?? '',
      start_at: input.startAt,
      cover_image_url: input.coverImageUrl ?? null,
      created_by: author.sub,
    })
    .select()
    .single();

  if (error) throw error;

  if (data?.id) {
    handleClubEventCreatedEvent(data.id).catch((err) =>
      console.warn('[communityService] Error handling club event event:', err)
    );
  }

  return {
    id: data.id,
    clubId: data.club_id,
    title: data.title,
    description: data.description,
    locationText: data.location_text,
    startAt: data.start_at,
    coverImageUrl: data.cover_image_url ?? '',
    createdBy: data.created_by,
    rsvpsCount: 0,
    rsvpedByMe: false,
    createdAt: data.created_at,
  };
}

export async function getClubEvents(clubId: string, userId?: string): Promise<ClubEvent[]> {
  const { data: events, error } = await supabase
    .from(CLUB_EVENTS_TABLE)
    .select('*')
    .eq('club_id', clubId)
    .order('start_at', { ascending: true });

  if (error) throw error;
  if (!events?.length) return [];

  const eventIds = events.map(e => e.id);
  const { data: rsvpsRes } = await supabase
    .from(CLUB_EVENT_RSVPS_TABLE)
    .select('event_id, user_id')
    .in('event_id', eventIds);

  const rsvpCounts = new Map<string, number>();
  const myRsvps = new Set<string>();

  for (const rsvp of rsvpsRes ?? []) {
    rsvpCounts.set(rsvp.event_id, (rsvpCounts.get(rsvp.event_id) ?? 0) + 1);
    if (userId && rsvp.user_id === userId) {
      myRsvps.add(rsvp.event_id);
    }
  }

  return events.map((e: any) => ({
    id: e.id,
    clubId: e.club_id,
    title: e.title,
    description: e.description,
    locationText: e.location_text,
    startAt: e.start_at,
    coverImageUrl: e.cover_image_url ?? '',
    createdBy: e.created_by,
    rsvpsCount: rsvpCounts.get(e.id) ?? 0,
    rsvpedByMe: userId ? myRsvps.has(e.id) : false,
    createdAt: e.created_at,
  }));
}

export async function rsvpClubEvent(eventId: string, userId: string, rsvp: boolean): Promise<void> {
  if (rsvp) {
    const { error } = await supabase
      .from(CLUB_EVENT_RSVPS_TABLE)
      .insert({ event_id: eventId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from(CLUB_EVENT_RSVPS_TABLE)
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

export async function requestJoinClub(clubId: string, userId: string): Promise<void> {
  const { data: existingMember } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('user_id')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .single();

  if (existingMember) throw new Error('User is already a member');

  const { data: existingRequest } = await supabase
    .from('club_join_requests')
    .select('status')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .single();

  if (existingRequest) {
    if (existingRequest.status === 'pending') throw new Error('Join request is already pending');
    if (existingRequest.status === 'approved') throw new Error('Join request is already approved');
    // If rejected, allow re-requesting by updating status
    const { error } = await supabase
      .from('club_join_requests')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('club_id', clubId)
      .eq('user_id', userId);
    if (error) throw error;

    handleJoinClubRequestEvent(clubId, userId).catch((err) =>
      console.warn('[communityService] Error handling join club request event:', err)
    );
    return;
  }

  const { error } = await supabase
    .from('club_join_requests')
    .insert({
      club_id: clubId,
      user_id: userId,
      status: 'pending',
    });

  if (error) throw error;

  handleJoinClubRequestEvent(clubId, userId).catch((err) =>
    console.warn('[communityService] Error handling join club request event:', err)
  );
}

export async function cancelJoinRequest(
  clubId: string,
  userId: string
): Promise<CancelJoinRequestResult> {
  // 1. Verify if user is already an active member of this club
  const { data: existingMember } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('user_id')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMember) {
    const error: any = new Error('User is already an active member of this club');
    error.statusCode = 400;
    throw error;
  }

  // 2. Check if join request exists
  const { data: existingRequest, error: fetchError } = await supabase
    .from('club_join_requests')
    .select('status')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!existingRequest) {
    const error: any = new Error('No active or pending join request exists for this user in this club');
    error.statusCode = 404;
    throw error;
  }

  if (existingRequest.status !== 'pending') {
    const error: any = new Error(`Join request has already been ${existingRequest.status}`);
    error.statusCode = 400;
    throw error;
  }

  // 3. Delete the pending request record
  const { error: deleteError } = await supabase
    .from('club_join_requests')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (deleteError) throw deleteError;

  return {
    clubId,
    joinStatus: 'none',
  };
}

export async function getClubJoinRequests(clubId: string, adminUserId: string) {
  // Check if admin
  await verifyClubAdmin(clubId, adminUserId);

  const { data: requests, error } = await supabase
    .from('club_join_requests')
    .select(`
      user_id,
      status,
      created_at,
      profiles (
        id,
        first_name,
        last_name,
        username,
        photo_url,
        avatar_id,
        region,
        country
      )
    `)
    .eq('club_id', clubId)
    .eq('status', 'pending');

  if (error) throw error;

  return (requests ?? []).map((req: any) => ({
    userId: req.user_id,
    status: req.status,
    createdAt: req.created_at,
    user: req.profiles ? {
      id: req.profiles.id,
      firstName: req.profiles.first_name,
      lastName: req.profiles.last_name,
      username: req.profiles.username,
      photoUrl: req.profiles.photo_url,
      avatarId: req.profiles.avatar_id,
      displayName: [req.profiles.first_name, req.profiles.last_name].filter(Boolean).join(' ') || undefined,
      region: req.profiles.region ?? null,
      country: req.profiles.country ?? null,
      location: [req.profiles.region, req.profiles.country].filter(Boolean).join(', ') || null,
    } : null,
  }));
}

export async function resolveJoinRequest(clubId: string, adminUserId: string, targetUserId: string, status: 'approved' | 'rejected') {
  // Check if admin
  await verifyClubAdmin(clubId, adminUserId);

  const { error: updateError } = await supabase
    .from('club_join_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('club_id', clubId)
    .eq('user_id', targetUserId)
    .eq('status', 'pending');

  if (updateError) throw updateError;

  if (status === 'approved') {
    const { error: insertError } = await supabase
      .from(CLUB_MEMBERS_TABLE)
      .upsert({
        club_id: clubId,
        user_id: targetUserId,
        role: 'member',
      }, { onConflict: 'club_id,user_id', ignoreDuplicates: true });
    if (insertError) throw insertError;

    handleJoinClubApprovedEvent(clubId, targetUserId).catch((err) =>
      console.warn('[communityService] Error handling join club approved event:', err)
    );
  }
}

export async function resolveBulkJoinRequests(
  clubId: string,
  adminUserId: string,
  status: 'approved' | 'rejected',
  userIds?: string[]
): Promise<{ success: boolean; message: string; count: number }> {
  await verifyClubAdmin(clubId, adminUserId);

  let query = supabase
    .from('club_join_requests')
    .select('user_id')
    .eq('club_id', clubId)
    .eq('status', 'pending');

  if (Array.isArray(userIds) && userIds.length > 0) {
    query = query.in('user_id', userIds);
  }

  const { data: pendingRequests, error: fetchError } = await query;
  if (fetchError) throw fetchError;

  if (!pendingRequests || pendingRequests.length === 0) {
    return { success: true, message: 'No pending requests to resolve', count: 0 };
  }

  const targetUserIds = pendingRequests.map((r: any) => r.user_id);

  const { error: updateError } = await supabase
    .from('club_join_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('club_id', clubId)
    .in('user_id', targetUserIds)
    .eq('status', 'pending');

  if (updateError) throw updateError;

  if (status === 'approved') {
    const memberRows = targetUserIds.map((uid) => ({
      club_id: clubId,
      user_id: uid,
      role: 'member' as const,
    }));

    const { error: insertError } = await supabase
      .from(CLUB_MEMBERS_TABLE)
      .upsert(memberRows, { onConflict: 'club_id,user_id', ignoreDuplicates: true });

    if (insertError) throw insertError;

    for (const uid of targetUserIds) {
      handleJoinClubApprovedEvent(clubId, uid).catch((err) =>
        console.warn('[communityService] Error handling bulk join approved event:', err)
      );
    }
  }

  const actionText = status === 'approved' ? 'approved' : 'rejected';
  return {
    success: true,
    message: `Successfully ${actionText} ${targetUserIds.length} join request(s)`,
    count: targetUserIds.length,
  };
}

async function verifyClubAdmin(clubId: string, userId: string): Promise<void> {
  const { data: member } = await supabase
    .from(CLUB_MEMBERS_TABLE)
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();

  if (member && member.role === 'admin') {
    return;
  }

  const { data: club } = await supabase
    .from(CLUBS_TABLE)
    .select('created_by')
    .eq('id', clubId)
    .maybeSingle();

  if (club && club.created_by === userId) {
    return;
  }

  const err: any = new Error('Forbidden: Only club admins or creators can perform this action');
  err.status = 403;
  throw err;
}

export async function updateClubCoverImage(
  clubId: string,
  coverImageBase64: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  await verifyClubAdmin(clubId, userId);

  const parsed = parseBase64Image(coverImageBase64);
  if (!parsed) {
    const err: any = new Error('Invalid image format. Base64 data URI required.');
    err.status = 400;
    throw err;
  }

  const path = `clubs/${clubId}/cover_${randomUUID()}.${parsed.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, parsed.buffer, { contentType: parsed.contentType });

  if (uploadError) {
    throw new Error(`Cover image upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
  const coverImageUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from(CLUBS_TABLE)
    .update({ cover_image_url: coverImageUrl })
    .eq('id', clubId);

  if (updateError) throw updateError;

  return { success: true, message: 'Club cover image updated' };
}

export async function createClubAnnouncement(
  clubId: string,
  input: CreateAnnouncementInput,
  userId: string
): Promise<{ success: boolean; message: string }> {
  await verifyClubAdmin(clubId, userId);

  const content = input.content?.trim();
  if (!content) {
    const err: any = new Error('Announcement content is required');
    err.status = 400;
    throw err;
  }

  const announcementId = randomUUID();
  const uploadedImages: string[] = [];

  if (input.images && Array.isArray(input.images) && input.images.length > 0) {
    for (const img of input.images) {
      const parsed = parseBase64Image(img);
      if (!parsed) continue;

      const path = `announcements/${announcementId}/${randomUUID()}.${parsed.extension}`;
      const { error: uploadErr } = await supabase.storage
        .from(IMAGES_BUCKET)
        .upload(path, parsed.buffer, { contentType: parsed.contentType });

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
        uploadedImages.push(urlData.publicUrl);
      }
    }
  }

  const primaryImageUrl = uploadedImages.length > 0 ? uploadedImages[0] : null;

  const { error: insertError } = await supabase
    .from(CLUB_ANNOUNCEMENTS_TABLE)
    .insert({
      id: announcementId,
      club_id: clubId,
      title: input.title?.trim() || null,
      content,
      image_url: primaryImageUrl,
      images: uploadedImages,
      created_by: userId,
    });

  if (insertError) throw insertError;

  handleClubAnnouncementEvent(announcementId).catch((err) =>
    console.warn('[communityService] Error handling club announcement event:', err)
  );

  // Mark as read for the creating admin
  try {
    await supabase.from(CLUB_ANNOUNCEMENT_READS_TABLE).insert({
      announcement_id: announcementId,
      user_id: userId,
    });
  } catch {
    // Ignore read mark failure if table does not exist or already read
  }

  return { success: true, message: 'Announcement published successfully' };
}

export async function getClubAnnouncements(
  clubId: string,
  userId: string,
  page: number = 1,
  size: number = 20
): Promise<ClubAnnouncement[]> {
  const from = (page - 1) * size;
  const to = from + size - 1;

  const { data: announcements, error } = await supabase
    .from(CLUB_ANNOUNCEMENTS_TABLE)
    .select('id, club_id, title, content, image_url, images, created_at')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }

  if (!announcements || announcements.length === 0) {
    return [];
  }

  const announcementIds = announcements.map((a: any) => a.id);

  const { data: readRecords } = await supabase
    .from(CLUB_ANNOUNCEMENT_READS_TABLE)
    .select('announcement_id')
    .eq('user_id', userId)
    .in('announcement_id', announcementIds);

  const readSet = new Set((readRecords ?? []).map((r: any) => r.announcement_id));

  return announcements.map((a: any) => ({
    id: a.id,
    clubId: a.club_id,
    title: a.title ?? null,
    content: a.content,
    imageUrl: a.image_url ?? (Array.isArray(a.images) && a.images.length > 0 ? a.images[0] : null),
    isRead: readSet.has(a.id),
    createdAt: a.created_at,
  }));
}

export async function reportClub(
  clubId: string,
  input: ReportClubInput,
  reporterId: string
): Promise<{ success: boolean; message: string }> {
  const { data: club, error: clubError } = await supabase
    .from(CLUBS_TABLE)
    .select('id')
    .eq('id', clubId)
    .maybeSingle();

  if (clubError) throw clubError;
  if (!club) {
    const err: any = new Error('Club not found');
    err.status = 404;
    throw err;
  }

  const reason = input.reason?.trim();
  if (!reason) {
    const err: any = new Error('reason is required');
    err.status = 400;
    throw err;
  }

  const reportedSections = Array.isArray(input.reportedSections)
    ? input.reportedSections.map((s: any) => String(s).trim()).filter(Boolean)
    : [];

  const details = typeof input.details === 'string' && input.details.trim()
    ? input.details.trim()
    : null;

  const { error: insertError } = await supabase
    .from(CLUB_REPORTS_TABLE)
    .insert({
      club_id: clubId,
      reporter_id: reporterId,
      reason,
      reported_sections: reportedSections,
      details,
    });

  if (insertError) throw insertError;

  return { success: true, message: 'Report submitted successfully' };
}

export async function getMyPosts(
  userId: string,
  page: number = 1,
  size: number = 10
): Promise<MyPostsResult> {
  const from = (page - 1) * size;
  const to = from + size - 1;

  let { data: posts, count, error } = await supabase
    .from(POSTS_TABLE)
    .select('*', { count: 'exact' })
    .or(`author_id.eq.${userId},user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error && error.code === 'PGRST205') {
    const fb = await supabase
      .from('community_posts')
      .select('*', { count: 'exact' })
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);
    posts = fb.data;
    count = fb.count;
    error = fb.error;
  } else if (error && (error.message?.includes('author_id') || error.message?.includes('user_id'))) {
    let retry = await supabase
      .from(POSTS_TABLE)
      .select('*', { count: 'exact' })
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (retry.error) {
      retry = await supabase
        .from(POSTS_TABLE)
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
    }
    posts = retry.data;
    count = retry.count;
    error = retry.error;
  }

  if (error) throw error;
  if (!posts?.length) {
    return { data: [], page, size, total: count ?? 0 };
  }

  const postIds = posts.map((post) => post.id);

  const [profileMap, likesRes, commentsRes, pollOptionsRes, pollVotesRes] = await Promise.all([
    fetchProfilesMap([userId]),
    supabase.from(LIKES_TABLE).select('post_id, user_id').in('post_id', postIds),
    supabase.from(COMMENTS_TABLE).select('post_id').in('post_id', postIds),
    supabase.from(POLL_OPTIONS_TABLE).select('*').in('post_id', postIds),
    supabase.from(POLL_VOTES_TABLE).select('option_id').eq('user_id', userId),
  ]);

  const likeCounts = new Map<string, number>();
  const likedPostIds = new Set<string>();
  for (const like of likesRes.data ?? []) {
    likeCounts.set(like.post_id, (likeCounts.get(like.post_id) ?? 0) + 1);
    if (like.user_id === userId) likedPostIds.add(like.post_id);
  }

  const commentCounts = new Map<string, number>();
  for (const comment of commentsRes.data ?? []) {
    commentCounts.set(comment.post_id, (commentCounts.get(comment.post_id) ?? 0) + 1);
  }

  const myVotedOptionIds = new Set((pollVotesRes.data ?? []).map((v) => v.option_id));

  const optionIds = (pollOptionsRes.data ?? []).map((o) => o.id);
  let allVotesData: any[] = [];
  if (optionIds.length > 0) {
    const { data } = await supabase.from(POLL_VOTES_TABLE).select('option_id').in('option_id', optionIds);
    allVotesData = data ?? [];
  }
  const voteCounts = new Map<string, number>();
  for (const v of allVotesData) {
    voteCounts.set(v.option_id, (voteCounts.get(v.option_id) ?? 0) + 1);
  }

  const authorProfile = profileMap.get(userId);
  const displayName = authorProfile
    ? [authorProfile.first_name, authorProfile.last_name].filter(Boolean).join(' ') || null
    : null;
  const author = {
    id: userId,
    username: authorProfile?.username ?? null,
    displayName,
    photoUrl: authorProfile?.photo_url || authorProfile?.photo_base64 || null,
    avatarId: authorProfile?.avatar_id ?? null,
  };

  const data: FeedPost[] = posts.map((post: any) => {
    const postOptions = (pollOptionsRes.data ?? []).filter((o) => o.post_id === post.id);
    let pollOptions = null;
    if (postOptions.length > 0) {
      const totalVotes = postOptions.reduce((acc, o) => acc + (voteCounts.get(o.id) ?? 0), 0);
      pollOptions = postOptions.map((o) => {
        const votesCount = voteCounts.get(o.id) ?? 0;
        return {
          id: o.id,
          text: o.text,
          votesCount,
          percent: totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0,
          votedByMe: myVotedOptionIds.has(o.id),
        };
      });
    }

    const resolved = resolvePostTags(post);
    return {
      id: post.id,
      title: post.title || undefined,
      description: post.description,
      tag: resolved.tag,
      tags: resolved.tags,
      imagesUrl: post.images_url ?? [],
      counts: {
        likes: likeCounts.get(post.id) ?? 0,
        comments: commentCounts.get(post.id) ?? 0,
        shares: 0,
      },
      likedByMe: likedPostIds.has(post.id),
      author,
      clubId: post.club_id ?? null,
      createdAt: post.created_at,
      pollOptions,
    };
  });

  return {
    data,
    page,
    size,
    total: count ?? 0,
  };
}



