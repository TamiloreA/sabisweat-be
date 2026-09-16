import { supabase } from '../config/database';
import {
  NewsItem,
  NewsDetail,
  NewsLikeResult,
  CreateNewsCommentResult,
  NewsCommentItem,
  NewsPoll,
  PollVoteResult,
  CreateNewsInput,
  PollResult,
} from '../models/newsModel';

const NEWS_TABLE = 'news';
const LIKES_TABLE = 'news_likes';
const COMMENTS_TABLE = 'news_comments';
const OPTIONS_TABLE = 'news_poll_options';
const VOTES_TABLE = 'news_poll_votes';
const PROFILES_TABLE = 'profiles';

function formatNewsDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { date, time };
}

function mapAuthor(profile: any, fallbackId: string) {
  const profileData = Array.isArray(profile) ? profile[0] : profile;
  const displayName = [profileData?.first_name, profileData?.last_name].filter(Boolean).join(' ') || undefined;
  return profileData
    ? {
        id: profileData.id,
        username: profileData.username ?? undefined,
        displayName,
        photoUrl: profileData.photo_url || profileData.photo_base64 || undefined,
        avatarId: profileData.avatar_id ?? undefined,
      }
    : { id: fallbackId };
}

async function getPollForNews(newsId: string, userId?: string): Promise<NewsPoll | null> {
  const { data: options, error } = await supabase
    .from(OPTIONS_TABLE)
    .select('id, text')
    .eq('news_id', newsId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  if (!options?.length) return null;

  const optionIds = options.map((o) => o.id);
  const { data: votes, error: votesError } = await supabase
    .from(VOTES_TABLE)
    .select('option_id, user_id')
    .in('option_id', optionIds);

  if (votesError) throw votesError;

  const counts = new Map<string, number>();
  let myVote: string | null = null;
  for (const vote of votes ?? []) {
    counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + 1);
    if (userId && vote.user_id === userId) myVote = vote.option_id;
  }

  const totalVotes = votes?.length ?? 0;

  return {
    question: '',
    totalVotes,
    endsAt: null,
    options: options.map((o) => {
      const votesCount = counts.get(o.id) ?? 0;
      return {
        id: o.id,
        text: o.text,
        votesCount,
        percent: totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0,
        votedByMe: myVote === o.id,
      };
    }),
  };
}

async function getCounts(newsIds: string[], userId?: string) {
  if (!newsIds.length) return { likes: new Map<string, number>(), comments: new Map<string, number>(), likedByMe: new Set<string>() };

  const [likesRes, commentsRes] = await Promise.all([
    supabase.from(LIKES_TABLE).select('news_id, user_id').in('news_id', newsIds),
    supabase.from(COMMENTS_TABLE).select('news_id').in('news_id', newsIds),
  ]);

  const likes = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const like of likesRes.data ?? []) {
    likes.set(like.news_id, (likes.get(like.news_id) ?? 0) + 1);
    if (userId && like.user_id === userId) likedByMe.add(like.news_id);
  }

  const comments = new Map<string, number>();
  for (const comment of commentsRes.data ?? []) {
    comments.set(comment.news_id, (comments.get(comment.news_id) ?? 0) + 1);
  }

  return { likes, comments, likedByMe };
}

function toNewsItem(row: any, counts: { likes: Map<string, number>; comments: Map<string, number>; likedByMe: Set<string> }, poll: NewsPoll | null): NewsItem {
  const { date, time } = formatNewsDate(row.created_at);
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? '',
    description: row.description ?? '',
    imageUrl: row.image_url ?? null,
    date,
    time,
    createdAt: row.created_at,
    likesCount: counts.likes.get(row.id) ?? 0,
    commentsCount: counts.comments.get(row.id) ?? 0,
    likedByMe: counts.likedByMe.has(row.id),
    tag: row.tag ?? 'general',
    poll: poll ? { ...poll, question: row.title } : null,
  };
}

export async function getNews(userId?: string): Promise<NewsItem[]> {
  const { data: rows, error } = await supabase
    .from(NEWS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!rows?.length) return [];

  const ids = rows.map((r) => r.id);
  const counts = await getCounts(ids, userId);

  const items: NewsItem[] = [];
  for (const row of rows) {
    const poll = row.kind === 'poll' ? await getPollForNews(row.id, userId) : null;
    items.push(toNewsItem(row, counts, poll));
  }
  return items;
}

export async function getNewsById(id: string, userId?: string): Promise<NewsDetail | null> {
  const { data: row, error } = await supabase
    .from(NEWS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error || !row) return null;

  const counts = await getCounts([id], userId);
  const poll = row.kind === 'poll' ? await getPollForNews(id, userId) : null;
  const item = toNewsItem(row, counts, poll);

  const { data: commentRows, error: commentsError } = await supabase
    .from(COMMENTS_TABLE)
    .select('id, text, created_at, user_id, author:profiles!news_comments_user_id_fkey(id, username, first_name, last_name, photo_url, photo_base64, avatar_id)')
    .eq('news_id', id)
    .order('created_at', { ascending: false });

  if (commentsError) throw commentsError;

  const comments: NewsCommentItem[] = (commentRows ?? []).map((c: any) => ({
    id: c.id,
    text: c.text,
    createdAt: c.created_at,
    author: mapAuthor(c.author, c.user_id),
  }));

  return { ...item, comments };
}

async function getLikesCount(newsId: string): Promise<number> {
  const { count, error } = await supabase
    .from(LIKES_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('news_id', newsId);
  if (error) throw error;
  return count ?? 0;
}

export async function likeNews(newsId: string, userId: string): Promise<NewsLikeResult> {
  const { error } = await supabase.from(LIKES_TABLE).insert({ news_id: newsId, user_id: userId });
  if (error && error.code !== '23505') throw error;
  return { liked: true, likesCount: await getLikesCount(newsId) };
}

export async function unlikeNews(newsId: string, userId: string): Promise<NewsLikeResult> {
  const { error } = await supabase
    .from(LIKES_TABLE)
    .delete()
    .eq('news_id', newsId)
    .eq('user_id', userId);
  if (error) throw error;
  return { liked: false, likesCount: await getLikesCount(newsId) };
}

export async function addNewsComment(newsId: string, text: string, userId: string): Promise<CreateNewsCommentResult> {
  await supabase.from(PROFILES_TABLE).upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

  const { data, error } = await supabase
    .from(COMMENTS_TABLE)
    .insert({ news_id: newsId, user_id: userId, text })
    .select('id, created_at')
    .single();

  if (error) throw error;
  return { id: data.id, createdAt: data.created_at };
}

export async function voteOnPoll(optionId: string, userId: string): Promise<PollVoteResult> {
  // Find the poll this option belongs to
  const { data: option, error: optionError } = await supabase
    .from(OPTIONS_TABLE)
    .select('id, news_id')
    .eq('id', optionId)
    .single();

  if (optionError || !option) throw new Error('Poll option not found');

  // One vote per user per poll: remove any existing vote in this poll first
  const { data: siblingOptions } = await supabase
    .from(OPTIONS_TABLE)
    .select('id')
    .eq('news_id', option.news_id);

  const siblingIds = (siblingOptions ?? []).map((o) => o.id);

  if (siblingIds.length) {
    await supabase
      .from(VOTES_TABLE)
      .delete()
      .eq('user_id', userId)
      .in('option_id', siblingIds);
  }

  const { error: insertError } = await supabase
    .from(VOTES_TABLE)
    .insert({ option_id: optionId, user_id: userId });

  if (insertError) throw insertError;

  const poll = await getPollForNews(option.news_id, userId);
  return { poll: poll! };
}

export async function createNews(input: CreateNewsInput): Promise<NewsItem> {
  const kind = input.kind === 'poll' ? 'poll' : 'article';

  const { data: row, error } = await supabase
    .from(NEWS_TABLE)
    .insert({
      title: input.title,
      subtitle: input.subtitle ?? '',
      description: input.description ?? '',
      image_url: input.imageUrl ?? null,
      tag: input.tag ?? 'general',
      kind,
    })
    .select()
    .single();

  if (error) throw error;

  if (kind === 'poll') {
    const options = (input.pollOptions ?? []).map((text) => text.trim()).filter(Boolean);
    if (options.length < 2) {
      // Roll back the news row so we never leave a broken poll
      await supabase.from(NEWS_TABLE).delete().eq('id', row.id);
      throw new Error('A poll needs at least 2 options');
    }

    const { error: optionsError } = await supabase.from(OPTIONS_TABLE).insert(
      options.map((text, index) => ({ news_id: row.id, text, sort_order: index }))
    );
    if (optionsError) {
      await supabase.from(NEWS_TABLE).delete().eq('id', row.id);
      throw optionsError;
    }
  }

  const counts = { likes: new Map<string, number>(), comments: new Map<string, number>(), likedByMe: new Set<string>() };
  const poll = kind === 'poll' ? await getPollForNews(row.id) : null;
  const item = toNewsItem(row, counts, poll);
  if (poll && input.pollEndsAt) {
    poll.endsAt = input.pollEndsAt;
    item.poll = poll;
  }
  return item;
}

export async function getPollResult(newsId: string): Promise<PollResult | null> {
  const { data: news, error: newsError } = await supabase
    .from(NEWS_TABLE)
    .select('id, title')
    .eq('id', newsId)
    .single();

  if (newsError || !news) return null;

  const { data: options, error: optionsError } = await supabase
    .from(OPTIONS_TABLE)
    .select('id, text')
    .eq('news_id', newsId)
    .order('sort_order', { ascending: true });

  if (optionsError) throw optionsError;
  if (!options?.length) return null;

  const optionIds = options.map((o) => o.id);
  const { data: votes, error: votesError } = await supabase
    .from(VOTES_TABLE)
    .select('option_id, created_at, author:profiles(id, username, first_name, last_name, photo_url, photo_base64, avatar_id)')
    .in('option_id', optionIds)
    .order('created_at', { ascending: true });

  if (votesError) throw votesError;

  const byOption = new Map<string, any[]>();
  for (const vote of votes ?? []) {
    const list = byOption.get(vote.option_id) ?? [];
    list.push(vote);
    byOption.set(vote.option_id, list);
  }

  const { count: totalMembers } = await supabase
    .from(PROFILES_TABLE)
    .select('*', { count: 'exact', head: true });

  return {
    question: news.title,
    totalVotes: votes?.length ?? 0,
    totalMembers: totalMembers ?? 0,
    options: options.map((o) => ({
      id: o.id,
      text: o.text,
      votesCount: byOption.get(o.id)?.length ?? 0,
      voters: (byOption.get(o.id) ?? []).map((v: any) => ({
        id: v.author?.id ?? '',
        username: v.author?.username ?? undefined,
        displayName: [v.author?.first_name, v.author?.last_name].filter(Boolean).join(' ') || undefined,
        photoUrl: v.author?.photo_url || v.author?.photo_base64 || undefined,
        votedAt: v.created_at,
      })),
    })),
  };
}
