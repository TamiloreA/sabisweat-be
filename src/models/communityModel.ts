export interface PostAuthor {
  id: string;
  username?: string;
  displayName?: string;
  photoUrl?: string;
  avatarId?: string;
}

export interface PostCounts {
  likes: number;
  comments: number;
  shares: number;
}

export interface PollOption {
  id: string;
  text: string;
  votesCount: number;
  percent: number;
  votedByMe: boolean;
}

export interface PollVoter {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  avatarId?: string;
}

export interface PollResultOption {
  id: string;
  text: string;
  votesCount: number;
  voters: PollVoter[];
}

export interface CommunityPollResult {
  question: string;
  totalVotes: number;
  totalMembers: number;
  options: PollResultOption[];
}

export interface FeedPost {
  id: string;
  title: string;
  description: string;
  tag: string;
  imagesUrl: string[];
  counts: PostCounts;
  likedByMe: boolean;
  author: PostAuthor;
  clubId: string | null;
  pollOptions?: PollOption[];
  createdAt: string;
}

export interface FeedResult {
  data: FeedPost[];
  page: number;
  size: number;
}

export interface CreatePostInput {
  title: string;
  description: string;
  tag?: string;
  imagesUrl?: string[];
  imagesBase64?: string[];
  clubId?: string;
  pollOptions?: string[];
}

export interface CreatePostResult {
  id: string;
  title: string;
  description: string;
  tag: string;
  imagesUrl: string[];
  clubId: string | null;
  createdAt: string;
}

export interface LikeResult {
  liked: boolean;
  likesCount: number;
}

export interface CommentAuthor {
  id: string;
  username?: string;
  displayName?: string;
  photoUrl?: string;
  avatarId?: string;
}

export interface PostComment {
  id: string;
  text: string;
  parentId: string | null;
  author: CommentAuthor;
  createdAt: string;
  children: PostComment[];
  commentsCount: number;
}

export interface CreateCommentResult {
  id: string;
  createdAt: string;
}

export interface ClubCountry {
  country: string;
  countryCode: string;
  regions: string[];
}

export type ClubLocationScope = 'single' | 'multiple' | 'global';

export interface ClubDetail {
  id: string;
  clubId?: string;
  name: string;
  description: string;
  tag: string;
  locationScope: ClubLocationScope;
  locationText: string;
  country: string | null;
  countryCode: string | null;
  regions: string[];
  countries: ClubCountry[] | null;
  coverImageUrl: string;
  profileImageUrl: string;
  theme: string;
  status: string;
  membersCount: number;
  joinStatus: 'joined' | 'pending' | 'none';
  isAdmin: boolean;
  createdAt: string;
}

export interface CreateClubInput {
  name: string;
  clubId?: string;
  description: string;
  tag?: string;
  locationScope?: ClubLocationScope;
  locationText?: string;
  country?: string;
  countryCode?: string;
  regions?: string[];
  countries?: ClubCountry[];
  coverImageUrl?: string;
  profileImageUrl?: string;
  profileImageBase64?: string;
  isPrivate?: boolean;
  theme?: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  locationText?: string;
  startAt: string;
  coverImageUrl?: string;
}

export interface ClubEvent {
  id: string;
  clubId: string;
  title: string;
  description: string;
  locationText: string;
  startAt: string;
  coverImageUrl: string;
  createdBy: string;
  rsvpsCount: number;
  rsvpedByMe: boolean;
  createdAt: string;
}
