import {
  computeStandardCompetitionRanks,
  isRoundClosed,
  normalizeQuestionOptions,
  getTriviaResults,
  submitTriviaAnswers,
  createAdminTriviaRound,
} from '../src/services/triviaService';
import { supabase } from '../src/config/database';

describe('Weekly Trivia pure helpers', () => {
  it('assigns standard competition ranks (1, 2, 2, 4, 4) with isJointRank flags', () => {
    const ranked = computeStandardCompetitionRanks([
      { userId: 'ayo', score: 5, totalQuestions: 5, points: 100, submittedAt: '2026-11-24T10:00:00Z' },
      { userId: 'moses', score: 4, totalQuestions: 5, points: 80, submittedAt: '2026-11-24T10:05:00Z' },
      { userId: 'you', score: 4, totalQuestions: 5, points: 80, submittedAt: '2026-11-24T10:10:00Z' },
      { userId: 'tami', score: 3, totalQuestions: 5, points: 60, submittedAt: '2026-11-24T10:15:00Z' },
      { userId: 'zara', score: 3, totalQuestions: 5, points: 60, submittedAt: '2026-11-24T10:20:00Z' },
    ]);

    expect(ranked.map((r) => ({ id: r.userId, rank: r.rank, joint: r.isJointRank }))).toEqual([
      { id: 'ayo', rank: 1, joint: false },
      { id: 'moses', rank: 2, joint: true },
      { id: 'you', rank: 2, joint: true },
      { id: 'tami', rank: 4, joint: true },
      { id: 'zara', rank: 4, joint: true },
    ]);
  });

  it('detects open vs closed rounds based on status and closes_at', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    expect(isRoundClosed({ status: 'published', closes_at: '2026-11-26T12:00:00Z' }, now)).toBe(false);
    expect(isRoundClosed({ status: 'published', closes_at: '2026-11-25T11:59:59Z' }, now)).toBe(true);
    expect(isRoundClosed({ status: 'closed', closes_at: '2026-11-26T12:00:00Z' }, now)).toBe(true);
  });

  it('normalizes string or object question options with A-D labels', () => {
    const opts = normalizeQuestionOptions([
      'Taking the stairs',
      { text: 'Sitting at your desk' },
      { id: 'C', label: 'C', text: 'Watching TV' },
    ]);
    expect(opts).toEqual([
      { id: 'A', label: 'A', text: 'Taking the stairs' },
      { id: 'B', label: 'B', text: 'Sitting at your desk' },
      { id: 'C', label: 'C', text: 'Watching TV' },
    ]);
  });
});

describe('Weekly Trivia service invariants', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps results & explanations locked while round is still open', async () => {
    const now = new Date('2026-11-25T12:00:00Z');
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'trivia_rounds') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: 'r-1',
                      week_label: 'THIS WEEK',
                      week_number: 48,
                      title: 'Move your mind.',
                      subtitle: 'A little knowledge. A stronger community.',
                      duration_hours: 24,
                      points_per_question: 20,
                      starts_at: '2026-11-25T08:00:00Z',
                      closes_at: '2026-11-26T08:00:00Z',
                      status: 'published',
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'trivia_questions') {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'q-1',
                      sort_order: 0,
                      category: 'MOVEMENT',
                      prompt: 'Which counts as everyday movement?',
                      options: [{ id: 'A', label: 'A', text: 'Taking the stairs' }],
                      correct_option_id: 'A',
                      explanation: 'Small daily movements count too.',
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === 'trivia_submissions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      answers: { 'q-1': 'A' },
                      status: 'submitted',
                      score: 1,
                      points_earned: 20,
                      notify_on_results: true,
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await getTriviaResults('r-1', 'user-1', now);
    expect(res).not.toBeNull();
    expect(res?.isLocked).toBe(true);
    expect(res?.review).toEqual([]);
    expect(res?.score).toBe(0);
    expect(res?.pointsEarned).toBe(0);
    expect(res?.round.score).toBeUndefined();
  });

  it('scores submission server-side but omits score from submit response while open', async () => {
    const now = new Date('2026-11-25T12:00:00Z');
    let savedRow: any = null;

    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'trivia_rounds') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: 'r-1',
                    status: 'published',
                    closes_at: '2026-11-26T08:00:00Z',
                    points_per_question: 20,
                  },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === 'trivia_questions') {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'q-1',
                    options: [
                      { id: 'A', label: 'A', text: 'Taking the stairs' },
                      { id: 'B', label: 'B', text: 'Watching TV' },
                    ],
                    correct_option_id: 'A',
                  },
                  {
                    id: 'q-2',
                    options: [
                      { id: 'A', label: 'A', text: 'Speed' },
                      { id: 'B', label: 'B', text: 'Community' },
                    ],
                    correct_option_id: 'B',
                  },
                ],
                error: null,
              }),
          }),
        } as any;
      }
      if (table === 'trivia_submissions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          upsert: (payload: any) => {
            savedRow = payload;
            return Promise.resolve({ error: null });
          },
        } as any;
      }
      return {} as any;
    });

    const response = await submitTriviaAnswers('r-1', 'user-1', { 'q-1': 'A', 'q-2': 'A' }, now);
    expect(response.submitted).toBe(true);
    expect(response.answeredCount).toBe(2);
    expect((response as any).score).toBeUndefined();
    expect(savedRow.score).toBe(1);
    expect(savedRow.points_earned).toBe(20);
    expect(savedRow.status).toBe('submitted');
  });

  it('rejects admin round creation if correctOptionId does not match any option', async () => {
    await expect(
      createAdminTriviaRound({
        title: 'Bad Round',
        closesAt: '2026-11-28T12:00:00Z',
        questions: [
          {
            prompt: 'Test?',
            options: ['Yes', 'No'],
            correctOptionId: 'Z',
          },
        ],
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
