import http from 'http';
import type { AddressInfo } from 'net';
import app from '../src/app';
import { supabase } from '../src/config/database';
import {
  normalizePublicImageUrl,
  truncateSnippet,
} from '../src/services/publicSharePreviewService';

const VALID_ID = '11111111-1111-4111-8111-111111111111';
const CLUB_ID = '22222222-2222-4222-8222-222222222222';

function mockSupabaseFrom(
  tableHandlers: Record<string, (id: string) => { data: any; error: any }>
) {
  return jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
    let targetId = '';
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === 'id') targetId = val;
        return chain;
      },
      maybeSingle: async () => {
        const handler = tableHandlers[table];
        if (!handler) return { data: null, error: null };
        return handler(targetId);
      },
    };
    return chain;
  });
}

describe('GET /api/v1/public/share-preview/:type/:id', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll((done) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns public challenge metadata without Authorization header and sets Cache-Control: public, max-age=300', async () => {
    mockSupabaseFrom({
      challenges: () => ({
        data: {
          id: VALID_ID,
          title: '30-Day Step Streak',
          subtitle: 'Walk 10,000 steps every day',
          description: 'Full challenge description',
          hero_image_url: 'https://cdn.sabisweat.com/challenges/hero.jpg',
          who_can_join: 'everyone',
          created_by: 'secret-user-id',
        },
        error: null,
      }),
    });

    const res = await fetch(`${baseUrl}/api/v1/public/share-preview/challenges/${VALID_ID}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('ratelimit-limit')).toBe('120');
    expect(body).toEqual({
      title: '30-Day Step Streak',
      description: 'Walk 10,000 steps every day',
      imageUrl: 'https://cdn.sabisweat.com/challenges/hero.jpg',
    });
  });

  it('returns public club metadata and excludes private fields like join_code', async () => {
    mockSupabaseFrom({
      clubs: () => ({
        data: {
          id: CLUB_ID,
          name: 'Lagos Striders',
          description: 'Morning runners across Lagos',
          profile_image_url: 'https://cdn.sabisweat.com/clubs/lagos.png',
          status: 'approved',
          is_private: true,
          join_code: 'SECRET123',
        },
        error: null,
      }),
    });

    const res = await fetch(`${baseUrl}/api/v1/public/share-preview/clubs/${CLUB_ID}`);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(Object.keys(body).sort()).toEqual(['description', 'imageUrl', 'title']);
    expect(body).toEqual({
      title: 'Lagos Striders',
      description: 'Morning runners across Lagos',
      imageUrl: 'https://cdn.sabisweat.com/clubs/lagos.png',
    });
  });

  it('returns public news metadata with imageUrl: null when no HTTP image exists', async () => {
    mockSupabaseFrom({
      news: () => ({
        data: {
          id: VALID_ID,
          title: 'Sabi Sweat',
          subtitle: 'Weekend Walking Meetup Announced',
          description: 'Join us this Saturday at 7am for a 5km community walk.',
          image_url: null,
        },
        error: null,
      }),
    });

    const res = await fetch(`${baseUrl}/api/v1/public/share-preview/news/${VALID_ID}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(body).toEqual({
      title: 'Weekend Walking Meetup Announced',
      description: 'Join us this Saturday at 7am for a 5km community walk.',
      imageUrl: null,
    });
  });

  it('returns public post metadata for feed posts and public-club posts', async () => {
    mockSupabaseFrom({
      posts: () => ({
        data: {
          id: VALID_ID,
          title: null,
          description: 'Hit my 15,000 steps goal before noon today!',
          images_url: ['https://cdn.sabisweat.com/posts/first.jpg', 'https://cdn.sabisweat.com/posts/second.jpg'],
          club_id: CLUB_ID,
        },
        error: null,
      }),
      clubs: () => ({
        data: {
          id: CLUB_ID,
          is_private: false,
          status: 'approved',
        },
        error: null,
      }),
    });

    const res = await fetch(`${baseUrl}/api/v1/public/share-preview/posts/${VALID_ID}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(body).toEqual({
      title: 'Hit my 15,000 steps goal before noon today!',
      description: 'Hit my 15,000 steps goal before noon today!',
      imageUrl: 'https://cdn.sabisweat.com/posts/first.jpg',
    });
  });

  it('returns 404 with Cache-Control: no-store for private club posts without leaking content', async () => {
    mockSupabaseFrom({
      posts: () => ({
        data: {
          id: VALID_ID,
          title: 'Top Secret Club Post',
          description: 'Private member discussion',
          images_url: ['https://cdn.sabisweat.com/posts/private.jpg'],
          club_id: CLUB_ID,
        },
        error: null,
      }),
      clubs: () => ({
        data: {
          id: CLUB_ID,
          is_private: true,
          status: 'approved',
        },
        error: null,
      }),
    });

    const res = await fetch(`${baseUrl}/api/v1/public/share-preview/posts/${VALID_ID}`);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(body)).not.toContain('Top Secret');
    expect(JSON.stringify(body)).not.toContain('Private member');
  });

  it('returns 400 for unsupported :type values and 404 for invalid IDs without 500', async () => {
    const badTypeRes = await fetch(`${baseUrl}/api/v1/public/share-preview/users/${VALID_ID}`);
    expect(badTypeRes.status).toBe(400);
    expect(badTypeRes.headers.get('cache-control')).toBe('no-store');

    const badIdRes = await fetch(`${baseUrl}/api/v1/public/share-preview/challenges/not-a-uuid`);
    expect(badIdRes.status).toBe(404);
    expect(badIdRes.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 404 with no-store for soft-deleted records, pending clubs, and club-only challenges', async () => {
    mockSupabaseFrom({
      news: () => ({
        data: {
          id: VALID_ID,
          title: 'Deleted News',
          deleted_at: '2026-11-25T10:00:00Z',
        },
        error: null,
      }),
      clubs: () => ({
        data: {
          id: CLUB_ID,
          name: 'Unapproved Club',
          status: 'pending',
        },
        error: null,
      }),
      challenges: () => ({
        data: {
          id: VALID_ID,
          title: 'Club Only Challenge',
          who_can_join: 'club_members',
        },
        error: null,
      }),
    });

    const deletedNewsRes = await fetch(`${baseUrl}/api/v1/public/share-preview/news/${VALID_ID}`);
    expect(deletedNewsRes.status).toBe(404);
    expect(deletedNewsRes.headers.get('cache-control')).toBe('no-store');

    const pendingClubRes = await fetch(`${baseUrl}/api/v1/public/share-preview/clubs/${CLUB_ID}`);
    expect(pendingClubRes.status).toBe(404);
    expect(pendingClubRes.headers.get('cache-control')).toBe('no-store');

    const clubChallengeRes = await fetch(`${baseUrl}/api/v1/public/share-preview/challenges/${VALID_ID}`);
    expect(clubChallengeRes.status).toBe(404);
    expect(clubChallengeRes.headers.get('cache-control')).toBe('no-store');
  });

  it('normalizes image URLs to HTTP(S) only and truncates long snippets cleanly', () => {
    expect(normalizePublicImageUrl('data:image/png;base64,AAA')).toBeNull();
    expect(normalizePublicImageUrl('  https://cdn.sabisweat.com/a.jpg  ')).toBe(
      'https://cdn.sabisweat.com/a.jpg'
    );
    expect(truncateSnippet('Hello   world', 50)).toBe('Hello world');
    expect(truncateSnippet('a '.repeat(120), 20).length).toBeLessThanOrEqual(20);
  });
});
