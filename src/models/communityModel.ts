export interface PostAuthor {
  id: string;
  username?: string;
  displayName?: string;
  photoUrl?: string;
}

export interface PostCounts {
  likes: number;
  comments: number;
  shares: number;
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
