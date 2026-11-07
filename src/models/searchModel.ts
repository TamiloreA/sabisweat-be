/**
 * Search Model
 *
 * Types and interfaces for the unified search filter engine across Challenges and Clubs.
 */

export type SearchResourceType = 'challenges' | 'clubs';

export interface SearchQueryParams {
  q: string;
  types: SearchResourceType[];
  limit: number;
  offset: number;
  country?: string;
  region?: string;
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
}

export interface SearchResultGroup<T> {
  total: number;
  items: T[];
}

export interface SearchResults {
  challenges?: SearchResultGroup<SearchChallengeItem>;
  clubs?: SearchResultGroup<SearchClubItem>;
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
