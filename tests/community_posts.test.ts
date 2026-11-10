/**
 * Unit Tests for Community Posts (Optional Title and Tags List)
 */

import type {
  CreatePostInput,
  CreatePostResult,
  FeedPost,
} from '../src/models/communityModel';
import * as communityService from '../src/services/communityService';
import { supabase } from '../src/config/database';

describe('Community Posts Schema & Payload Contracts', () => {
  it('validates CreatePostInput without title (optional title)', () => {
    const inputWithoutTitle: CreatePostInput = {
      description: 'Jogged 10km around the city park today!',
      tag: ['Running', 'Cardio'],
    };

    expect(inputWithoutTitle.title).toBeUndefined();
    expect(inputWithoutTitle.description).toBe('Jogged 10km around the city park today!');
    expect(inputWithoutTitle.tag).toEqual(['Running', 'Cardio']);
  });

  it('validates CreatePostInput with tag as a list of strings', () => {
    const inputWithTagList: CreatePostInput = {
      title: 'Weekend Workout',
      description: 'Morning sweat session completed.',
      tag: ['Fitness', 'HIIT', 'MorningSweat'],
    };

    expect(Array.isArray(inputWithTagList.tag)).toBe(true);
    expect(inputWithTagList.tag).toHaveLength(3);
  });

  it('validates CreatePostInput with tags alias as a list of strings', () => {
    const inputWithTagsAlias: CreatePostInput = {
      description: 'Crushing goals one step at a time.',
      tags: ['Movement', 'Community'],
    };

    expect(Array.isArray(inputWithTagsAlias.tags)).toBe(true);
    expect(inputWithTagsAlias.tags).toEqual(['Movement', 'Community']);
  });

  it('validates FeedPost and CreatePostResult return both primary tag and tags array', () => {
    const postResult: CreatePostResult = {
      id: 'd9b1a134-2e91-49b8-a764-7bfb94d13e21',
      description: 'Post description here',
      tag: 'Running',
      tags: ['Running', 'Cardio'],
      imagesUrl: [],
      clubId: null,
      createdAt: new Date().toISOString(),
    };

    expect(postResult.title).toBeUndefined();
    expect(postResult.tag).toBe('Running');
    expect(postResult.tags).toEqual(['Running', 'Cardio']);

    const feedPost: FeedPost = {
      id: 'd9b1a134-2e91-49b8-a764-7bfb94d13e21',
      description: 'Post description here',
      tag: 'Running',
      tags: ['Running', 'Cardio'],
      imagesUrl: [],
      counts: {
        likes: 5,
        comments: 2,
        shares: 0,
      },
      likedByMe: true,
      author: {
        id: 'user-uuid-1',
        displayName: 'Amina',
      },
      clubId: null,
      createdAt: new Date().toISOString(),
    };

    expect(feedPost.title).toBeUndefined();
    expect(feedPost.tag).toBe('Running');
    expect(feedPost.tags).toEqual(['Running', 'Cardio']);
  });

  it('validates FeedPost and CreatePostResult when post has no tags and no title', () => {
    const postWithoutTagsOrTitle: CreatePostResult = {
      id: 'd9b1a134-2e91-49b8-a764-7bfb94d13e22',
      description: 'Quick post without title or tag',
      imagesUrl: [],
      clubId: null,
      createdAt: new Date().toISOString(),
    };

    expect(postWithoutTagsOrTitle.title).toBeUndefined();
    expect(postWithoutTagsOrTitle.tag).toBeUndefined();
    expect(postWithoutTagsOrTitle.tags).toBeUndefined();
  });
});

describe('Community Service using posts table', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries the posts table when fetching feed and resolves author from author_id or user_id', async () => {
    const mockPosts = [
      {
        id: 'post-1',
        title: 'Morning Run',
        description: 'Great jog',
        tag: 'Running',
        tags: ['Running'],
        images_url: ['https://example.com/img.jpg'],
        author_id: 'user-1',
        user_id: 'user-1',
        club_id: null,
        likes_count: 3,
        created_at: new Date().toISOString(),
      },
    ];

    const queriedTables: string[] = [];
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      queriedTables.push(table);
      if (table === 'posts') {
        return {
          select: () => ({
            is: () => ({
              order: () => ({
                range: () => Promise.resolve({ data: mockPosts, error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: 'user-1', username: 'amina', first_name: 'Amina', last_name: 'B' }],
              error: null,
            }),
          }),
        } as any;
      }
      if (table === 'community_likes') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [{ post_id: 'post-1', user_id: 'user-2' }], error: null }),
          }),
        } as any;
      }
      if (table === 'community_comments') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        } as any;
      }
      return {} as any;
    });

    const result = await communityService.getFeed(1, 10, 'user-2');
    expect(queriedTables).toContain('posts');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('post-1');
    expect(result.data[0].author.id).toBe('user-1');
    expect(result.data[0].author.username).toBe('amina');
    expect(result.data[0].counts.likes).toBe(1);
    expect(result.data[0].likedByMe).toBe(true);
  });

  it('queries the posts table with user_id and author_id fallback in getPostById', async () => {
    const mockPost = {
      id: 'post-legacy-1',
      title: 'Legacy Post',
      description: 'Created with legacy schema',
      tag: 'General',
      images_url: [],
      author_id: null,
      user_id: 'legacy-author-uuid',
      club_id: null,
      likes_count: 0,
      created_at: new Date().toISOString(),
    };

    const queriedTables: string[] = [];
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      queriedTables.push(table);
      if (table === 'posts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mockPost, error: null }),
              single: () => Promise.resolve({ data: mockPost, error: null }),
            }),
          }),
        } as any;
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: 'legacy-author-uuid', username: 'legacy_user', first_name: 'Legacy', last_name: 'User' }],
              error: null,
            }),
          }),
        } as any;
      }
      if (table === 'community_likes') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        } as any;
      }
      if (table === 'community_comments') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        } as any;
      }
      return {} as any;
    });

    const post = await communityService.getPostById('post-legacy-1');
    expect(queriedTables).toContain('posts');
    expect(post).not.toBeNull();
    expect(post?.author.id).toBe('legacy-author-uuid');
    expect(post?.author.username).toBe('legacy_user');
  });

  it('inserts into the posts table with both author_id and user_id populated', async () => {
    let insertedPayload: any = null;
    let insertedTable = '';

    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      insertedTable = table;
      if (table === 'posts') {
        return {
          insert: (payload: any) => {
            insertedPayload = payload;
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: {
                    ...payload,
                    id: 'new-post-id',
                    created_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            };
          },
        } as any;
      }
      if (table === 'profiles') {
        return {
          upsert: () => Promise.resolve({ data: null, error: null }),
        } as any;
      }
      return {} as any;
    });

    const created = await communityService.createPost(
      {
        description: 'Testing post insert into posts table',
        tag: 'Running',
      },
      { sub: 'author-user-uuid' } as any
    );

    expect(insertedTable).toBe('posts');
    expect(insertedPayload).not.toBeNull();
    expect(insertedPayload.author_id).toBe('author-user-uuid');
    expect(insertedPayload.user_id).toBe('author-user-uuid');
    expect(insertedPayload.description).toBe('Testing post insert into posts table');
    expect(created.id).toBe('new-post-id');
  });
});
