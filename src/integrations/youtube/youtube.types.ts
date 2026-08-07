export interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YouTubeSearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelId: string;
    channelTitle: string;
    thumbnails: Record<string, YouTubeThumbnail | undefined>;
  };
}

export interface YouTubeSearchResponse {
  pageInfo?: { totalResults?: number };
  items?: YouTubeSearchItem[];
}

export interface YouTubeVideoItem {
  id: string;
  contentDetails?: { duration?: string };
}

export interface YouTubeVideosResponse {
  items?: YouTubeVideoItem[];
}

export interface YouTubeVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationMs: number;
}

export interface YouTubeSearchResult {
  videos: YouTubeVideo[];
  total: number;
}

