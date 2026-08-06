export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
}

export interface SpotifySearchTracksResponse {
  tracks: {
    href: string;
    total: number;
    items: SpotifyTrack[];
  };
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[];
  total: number;
}

export interface CachedSpotifyToken {
  accessToken: string;
  expiresAtMs: number;
}
