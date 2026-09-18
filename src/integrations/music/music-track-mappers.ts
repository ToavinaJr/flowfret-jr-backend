import { AUDIUS_API_URL, AUDIUS_WEB_URL } from '../audius/audius.constants';
import type { AudiusTrack } from '../audius/audius.types';
import type { SpotifyTrack } from '../spotify/spotify.types';
import type { YouTubeVideo } from '../youtube/youtube.types';
import type { MusicProvider } from './music.service';

export interface ProviderTrack {
  provider: MusicProvider;
  id: string;
  title: string;
  artists: Array<{ id: string; name: string }>;
  imageUrl: string | null;
  externalUrl: string;
  streamUrl: string;
  genre: string | null;
  album: string | null;
  isrc: string | null;
  durationMs: number;
}

export function mapAudius(track: AudiusTrack): ProviderTrack {
  return {
    provider: 'AUDIUS',
    id: track.id,
    title: track.title,
    artists: [{ id: track.user.id, name: track.user.name }],
    imageUrl: pickArtwork(track),
    externalUrl: buildAudiusUrl(track.permalink),
    streamUrl: `${AUDIUS_API_URL}/tracks/${encodeURIComponent(track.id)}/stream`,
    genre: track.genre ?? null,
    album: null,
    isrc: null,
    durationMs: Math.max(0, Math.round(track.duration * 1000)),
  };
}

export function mapSpotify(track: SpotifyTrack): ProviderTrack {
  return {
    provider: 'SPOTIFY',
    id: track.id,
    title: track.name,
    artists: track.artists,
    imageUrl: track.album.images[0]?.url ?? null,
    externalUrl: track.external_urls.spotify,
    streamUrl: track.preview_url ?? track.external_urls.spotify,
    genre: null,
    album: track.album.name || null,
    isrc: track.external_ids?.isrc ?? null,
    durationMs: Math.max(0, track.duration_ms),
  };
}

export function mapYouTube(video: YouTubeVideo): ProviderTrack {
  return {
    provider: 'YOUTUBE',
    id: video.id,
    title: video.title,
    artists: [{ id: video.channelId, name: video.channelTitle }],
    imageUrl: video.thumbnailUrl,
    externalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
    streamUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
    genre: null,
    album: null,
    isrc: null,
    durationMs: Math.max(0, video.durationMs),
  };
}

function pickArtwork(track: AudiusTrack): string | null {
  const artwork = track.artwork;
  return (
    artwork?.['_1000x1000'] ??
    artwork?.['1000x1000'] ??
    artwork?.['_480x480'] ??
    artwork?.['480x480'] ??
    artwork?.['_150x150'] ??
    artwork?.['150x150'] ??
    null
  );
}

function buildAudiusUrl(permalink?: string): string {
  if (!permalink) return AUDIUS_WEB_URL;
  if (/^https?:\/\//i.test(permalink)) return permalink;
  return `${AUDIUS_WEB_URL}/${permalink.replace(/^\/+/, '')}`;
}