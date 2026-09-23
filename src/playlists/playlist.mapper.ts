import type { CatalogTrack, PlaylistItem } from '@prisma/client';
import type {
  CatalogTrackModel,
  PlaylistArtistModel,
  PlaylistItemModel,
} from './playlist.types';

function toArtists(value: unknown): PlaylistArtistModel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((artist) => {
    if (
      typeof artist !== 'object' ||
      artist === null ||
      typeof (artist as { id?: unknown }).id !== 'string' ||
      typeof (artist as { name?: unknown }).name !== 'string'
    ) {
      return [];
    }
    return [
      {
        id: (artist as { id: string }).id,
        name: (artist as { name: string }).name,
      },
    ];
  });
}

export function toCatalogTrackModel(track: CatalogTrack): CatalogTrackModel {
  return {
    ...track,
    artists: toArtists(track.artists),
  };
}

export function toPlaylistItemModel(
  item: PlaylistItem & { track: CatalogTrack },
): PlaylistItemModel {
  return {
    ...item,
    track: toCatalogTrackModel(item.track),
  };
}
