import { getClubLeaderboard } from '../src/services/communityService';
import { supabase } from '../src/config/database';
import { uploadBase64Image } from '../src/utils/imageUpload';

jest.mock('../src/config/database', () => ({
  supabase: {
    from: jest.fn(),
    storage: {
      from: jest.fn(() => ({
        getPublicUrl: jest.fn((p: string) => ({
          data: { publicUrl: `https://auth.sabisweat.com/storage/v1/object/public/community-images/${p}` },
        })),
      })),
    },
  },
}));

jest.mock('../src/utils/imageUpload', () => ({
  uploadBase64Image: jest.fn(),
}));

describe('GET /community/clubs/:id/leaderboard storage photoUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('migrates base64 photos to storage, persists photo_url, and returns storage URLs', async () => {
    const mockFrom = supabase.from as jest.Mock;
    const mockUploadBase64 = uploadBase64Image as jest.Mock;
    const updateEqMock = jest.fn().mockResolvedValue({ error: null });
    const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });

    const uploadedStorageUrl =
      'https://auth.sabisweat.com/storage/v1/object/public/community-images/avatars/u-base64/img.jpg';
    mockUploadBase64.mockResolvedValue(uploadedStorageUrl);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'clubs') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'club-1', is_private: false, show_leaderboard: true, created_by: 'u-http' },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'club_members') {
        return {
          select: jest.fn((cols: string) => {
            if (cols === 'role') {
              return {
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: { role: 'member' },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            return {
              eq: jest.fn().mockResolvedValue({
                data: [
                  { user_id: 'u-http', joined_at: '2026-10-01T00:00:00Z' },
                  { user_id: 'u-avatar', joined_at: '2026-10-01T00:00:00Z' },
                  { user_id: 'u-base64', joined_at: '2026-10-01T00:00:00Z' },
                ],
                error: null,
              }),
            };
          }),
        };
      }

      if (table === 'daily_steps') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                lte: jest.fn().mockResolvedValue({
                  data: [
                    { user_id: 'u-http', steps: 5000, date: '2026-11-10' },
                    { user_id: 'u-avatar', steps: 3000, date: '2026-11-10' },
                    { user_id: 'u-base64', steps: 1000, date: '2026-11-10' },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'u-http',
                  username: 'httpuser',
                  first_name: 'Http',
                  last_name: 'User',
                  photo_url: 'https://auth.sabisweat.com/storage/v1/object/public/community-images/avatars/u-http/existing.jpg',
                  photo_base64: null,
                  avatar_id: null,
                },
                {
                  id: 'u-avatar',
                  username: 'avataruser',
                  first_name: 'Avatar',
                  last_name: 'User',
                  photo_url: null,
                  photo_base64: null,
                  avatar_id: 'female-30s-curvy-coral-naturalcurls-activewear',
                },
                {
                  id: 'u-base64',
                  username: 'bruno1028',
                  first_name: 'Bruno',
                  last_name: 'Ayo',
                  photo_url: null,
                  photo_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
                  avatar_id: null,
                },
              ],
              error: null,
            }),
          }),
          update: updateMock,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getClubLeaderboard('club-1', '2026-11', 0, 20, 'u-base64');

    expect(mockUploadBase64).toHaveBeenCalledTimes(1);
    expect(mockUploadBase64).toHaveBeenCalledWith(
      'avatars/u-base64',
      'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    );
    expect(updateMock).toHaveBeenCalledWith({ photo_url: uploadedStorageUrl });
    expect(updateEqMock).toHaveBeenCalledWith('id', 'u-base64');

    expect(result.data[0].user.photoUrl).toBe(
      'https://auth.sabisweat.com/storage/v1/object/public/community-images/avatars/u-http/existing.jpg'
    );
    expect(result.data[1].user.photoUrl).toBe(
      'https://auth.sabisweat.com/storage/v1/object/public/avatar2/Female-30s-Curvy-Coral-NaturalCurls-ActiveWear.png'
    );
    expect(result.data[2].user.photoUrl).toBe(uploadedStorageUrl);
    expect(result.currentUser?.user.photoUrl).toBe(uploadedStorageUrl);
  });
});
