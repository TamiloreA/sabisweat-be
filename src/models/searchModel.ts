/**
 * Search Model
 *
 * Types and interfaces for the unified search filter engine across Challenges and Clubs.
 */

export type SearchResourceType = 'challenges' | 'clubs' | 'help' | 'posts';

export interface SearchQueryParams {
  q: string;
  types: SearchResourceType[];
  limit: number;
  offset: number;
  country?: string;
  region?: string;
  excludeClubId?: string;
  userId?: string;
}

export interface SearchChallengeHostInfo {
  name?: string;
  logoUrl?: string | null;
  clubId?: string;
  theme?: string;
}

export interface SearchChallengeItem {
  id: string;
  type: 'challenge';
  title: string;
  subtitle: string;
  imageUrl: string;
  fallbackImageUrl: string;
  startDate: string;
  endDate: string;
  participantCount: number;
  status: string;
  isOfficial?: boolean;
  host?: SearchChallengeHostInfo;
  coHost?: SearchChallengeHostInfo;
  coHosts?: SearchChallengeHostInfo[];
}

export interface SearchClubItem {
  id: string;
  type: 'club';
  name: string;
  badgeUrl: string;
  location: string;
  countryCode: string;
  memberCount: number;
  clubTheme: string;
  status: string;
  isOfficial?: boolean;
}

export interface SearchHelpItem {
  id: string;
  type: 'help';
  title: string;
  snippet: string;
  category: string;
  url?: string;
}

export interface SearchPostItem {
  id: string;
  type: 'post';
  title?: string;
  description: string;
  tag?: string;
  tags?: string[];
  imagesUrl: string[];
  counts: {
    likes: number;
    comments: number;
    shares: number;
  };
  likedByMe: boolean;
  author: {
    id: string;
    username?: string;
    displayName?: string;
    photoUrl?: string;
    avatarId?: string;
  };
  clubId?: string | null;
  createdAt: string;
  pollOptions?: Array<{
    id: string;
    text: string;
    votesCount: number;
    percent: number;
    votedByMe: boolean;
  }>;
}

export interface SearchResultGroup<T> {
  total: number;
  items: T[];
}

export interface SearchResults {
  challenges?: SearchResultGroup<SearchChallengeItem>;
  clubs?: SearchResultGroup<SearchClubItem>;
  help?: SearchResultGroup<SearchHelpItem>;
  posts?: SearchResultGroup<SearchPostItem>;
}

export interface SearchMeta {
  took_ms: number;
  limit: number;
  offset: number;
}

export interface SearchResponse {
  query: string;
  types: SearchResourceType[];
  results: SearchResults;
  meta: SearchMeta;
}

export interface SearchErrorResponse {
  error: 'QUERY_REQUIRED' | 'QUERY_TOO_LONG' | 'INVALID_TYPE' | 'RATE_LIMITED' | 'SERVER_ERROR';
  message: string;
}
