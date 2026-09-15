export interface NewsPollOption {
  id: string;
  text: string;
  votesCount: number;
  percent: number;
  votedByMe: boolean;
}

export interface NewsPoll {
  question: string;
  totalVotes: number;
  endsAt: string | null;
  options: NewsPollOption[];
}

export interface NewsItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string | null;
  date: string;
  time: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  poll?: NewsPoll | null;
}

export interface NewsCommentItem {
  id: string;
  text: string;
  createdAt: string;
  author: {
    id: string;
    username?: string;
    displayName?: string;
    photoUrl?: string;
  };
}

export interface NewsDetail extends NewsItem {
  comments: NewsCommentItem[];
}

export interface NewsLikeResult {
  liked: boolean;
  likesCount: number;
}

export interface CreateNewsCommentResult {
  id: string;
  createdAt: string;
}

export interface PollVoteResult {
  poll: NewsPoll;
}

export interface PollVoter {
  id: string;
  username?: string;
  displayName?: string;
  photoUrl?: string;
  votedAt: string;
}

export interface PollResultOption {
  id: string;
  text: string;
  votesCount: number;
  voters: PollVoter[];
}

export interface PollResult {
  question: string;
  totalVotes: number;
  totalMembers: number;
  options: PollResultOption[];
}

export interface CreateNewsInput {
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  kind?: 'article' | 'poll';
  pollOptions?: string[];
  pollEndsAt?: string;
}
