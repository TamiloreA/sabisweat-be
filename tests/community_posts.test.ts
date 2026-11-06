/**
 * Unit Tests for Community Posts (Optional Title and Tags List)
 */

import type {
  CreatePostInput,
  CreatePostResult,
  FeedPost,
} from '../src/models/communityModel';

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
