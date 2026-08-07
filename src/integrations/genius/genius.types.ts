export interface GeniusArtist {
  name: string;
}

export interface GeniusSongHit {
  id: number;
  title: string;
  full_title: string;
  url: string;
  primary_artist: GeniusArtist;
  song_art_image_thumbnail_url: string | null;
}

export interface GeniusSearchHit {
  type: string;
  result: GeniusSongHit;
}

export interface GeniusSearchResponse {
  response: {
    hits: GeniusSearchHit[];
  };
}

export interface GeniusSongMatch {
  id: number;
  title: string;
  fullTitle: string;
  url: string;
  primaryArtistName: string;
  thumbnailUrl: string | null;
  matchScore: number;
}

export interface GeniusCacheEntry {
  value: GeniusSongMatch | null;
  expiresAtMs: number;
}
