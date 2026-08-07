export interface AudiusArtwork {
  '_150x150'?: string;
  '_480x480'?: string;
  '_1000x1000'?: string;
  '150x150'?: string;
  '480x480'?: string;
  '1000x1000'?: string;
}

export interface AudiusUser {
  id: string;
  name: string;
  handle?: string;
}

export interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  genre?: string;
  permalink?: string;
  artwork?: AudiusArtwork | null;
  user: AudiusUser;
  isStreamable?: boolean | string;
  is_streamable?: boolean;
  stream?: {
    url?: string;
    mirrors?: string[];
  } | null;
}

export interface AudiusSearchResponse {
  data?: AudiusTrack[];
}

export interface AudiusSearchResult {
  tracks: AudiusTrack[];
  total: number;
}
