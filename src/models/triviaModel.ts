export type TriviaRoundStatus = 'draft' | 'published' | 'closed' | 'archived';
export type TriviaSubmissionStatus = 'draft' | 'submitted';
export type TriviaUserState = 'not_started' | 'in_progress' | 'submitted' | 'results_ready' | 'missed';

export interface TriviaOption {
  id: string;
  label: string;
  text: string;
}

export interface TriviaQuestionPublic {
  id: string;
  sortOrder: number;
  category: string;
  prompt: string;
  options: TriviaOption[];
}

export interface TriviaQuestionRevealed extends TriviaQuestionPublic {
  correctOptionId: string;
  correctOptionText: string;
  explanation: string;
  userOptionId: string | null;
  userOptionText: string | null;
  isCorrect: boolean;
}

export interface TriviaRoundSummary {
  id: string;
  weekLabel: string;
  weekNumber: number | null;
  title: string;
  subtitle: string;
  questionCount: number;
  durationHours: number;
  pointsPerQuestion: number;
  totalPoints: number;
  startsAt: string;
  closesAt: string;
  isClosed: boolean;
  participantCount: number;
  userState: TriviaUserState;
  answeredCount: number;
  notifyOnResults: boolean;
  /** Only populated once the round is closed and the user submitted */
  score?: number;
  pointsEarned?: number;
  rank?: number;
  isJointRank?: boolean;
}

export interface TriviaOverviewResponse {
  currentRound: TriviaRoundSummary | null;
  previousRound: TriviaRoundSummary | null;
}

export interface TriviaRoundDetailResponse {
  round: TriviaRoundSummary;
  questions: TriviaQuestionPublic[];
  draftAnswers: Record<string, string>;
}

export interface TriviaResultsResponse {
  round: TriviaRoundSummary;
  isLocked: boolean;
  score: number;
  totalQuestions: number;
  pointsEarned: number;
  rank: number | null;
  isJointRank: boolean;
  participantCount: number;
  review: TriviaQuestionRevealed[];
}

export interface TriviaStandingEntry {
  rank: number;
  isJointRank: boolean;
  userId: string;
  displayName: string;
  username?: string | null;
  photoUrl?: string | null;
  avatarId?: string | null;
  score: number;
  totalQuestions: number;
  points: number;
  roundsPlayed?: number;
  isCurrentUser: boolean;
}

export interface TriviaLeaderboardResponse {
  scope: 'week' | 'all_time';
  roundId: string | null;
  weekLabel: string;
  weekNumber: number | null;
  isLocked: boolean;
  closesAt: string | null;
  participantCount: number;
  pointsPerQuestion: number;
  currentUserEntry: TriviaStandingEntry | null;
  standings: TriviaStandingEntry[];
}

export interface AdminCreateTriviaQuestionInput {
  category?: string;
  prompt: string;
  options: Array<{ id?: string; label?: string; text: string } | string>;
  correctOptionId: string;
  explanation?: string;
}

export interface AdminCreateTriviaRoundInput {
  weekLabel?: string;
  weekNumber?: number | null;
  title: string;
  subtitle?: string;
  durationHours?: number;
  pointsPerQuestion?: number;
  startsAt?: string;
  closesAt: string;
  status?: TriviaRoundStatus;
  questions: AdminCreateTriviaQuestionInput[];
}

export interface AdminUpdateTriviaRoundInput {
  weekLabel?: string;
  weekNumber?: number | null;
  title?: string;
  subtitle?: string;
  durationHours?: number;
  pointsPerQuestion?: number;
  startsAt?: string;
  closesAt?: string;
  status?: TriviaRoundStatus;
  questions?: AdminCreateTriviaQuestionInput[];
}
