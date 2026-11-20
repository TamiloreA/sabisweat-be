import { deleteComment } from '../src/services/communityService';
import { supabase } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('DELETE /community/posts/:id/comments/:commentId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes own comment in a single atomic round-trip', async () => {
    const mockFrom = supabase.from as jest.Mock;
    const selectMock = jest.fn().mockResolvedValue({
      data: [{ id: 'comment-1' }],
      error: null,
    });
    const eqUserMock = jest.fn().mockReturnValue({ select: selectMock });
    const eqPostMock = jest.fn().mockReturnValue({ eq: eqUserMock });
    const eqIdMock = jest.fn().mockReturnValue({ eq: eqPostMock });

    mockFrom.mockReturnValue({
      delete: jest.fn().mockReturnValue({ eq: eqIdMock }),
    });

    const res = await deleteComment('post-1', 'comment-1', 'user-1');

    expect(res).toEqual({ id: 'comment-1', deleted: true });
    // Single DB round-trip: no SELECT queries for comment, post, or club
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('community_comments');
  });

  it('allows post author to delete another user comment', async () => {
    const mockFrom = supabase.from as jest.Mock;
    let commentDeleteCalls = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === 'community_comments') {
        commentDeleteCalls += 1;
        if (commentDeleteCalls === 1) {
          // Fast path miss (not comment author)
          return {
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (commentDeleteCalls === 2) {
          // Slow path existence lookup
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: 'comment-2', user_id: 'other-user' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        // Admin/author delete execution
        return {
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }

      if (table === 'posts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'post-1', author_id: 'post-owner', club_id: null },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await deleteComment('post-1', 'comment-2', 'post-owner');
    expect(res).toEqual({ id: 'comment-2', deleted: true });
  });

  it('rejects unauthorized deletion with 403', async () => {
    const mockFrom = supabase.from as jest.Mock;
    let commentCalls = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === 'community_comments') {
        commentCalls += 1;
        if (commentCalls === 1) {
          return {
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: 'comment-2', user_id: 'comment-owner' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'posts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'post-1', author_id: 'post-owner', club_id: null },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(deleteComment('post-1', 'comment-2', 'stranger')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('returns 404 when comment does not exist on the post', async () => {
    const mockFrom = supabase.from as jest.Mock;
    let commentCalls = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === 'community_comments') {
        commentCalls += 1;
        if (commentCalls === 1) {
          return {
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === 'posts') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'post-1', author_id: 'post-owner', club_id: null },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(deleteComment('post-1', 'missing-comment', 'user-1')).rejects.toMatchObject({
      status: 404,
    });
  });
});
