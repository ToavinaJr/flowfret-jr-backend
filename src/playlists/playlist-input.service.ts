import { BadRequestException, Injectable } from '@nestjs/common';
import { MusicProvider, Prisma } from '@prisma/client';
import { TrackSnapshotInput } from './dto/playlist.inputs';

const EXTERNAL_TRACK_HOSTS: Record<MusicProvider, ReadonlySet<string>> = {
  [MusicProvider.AUDIUS]: new Set(['audius.co', 'www.audius.co']),
  [MusicProvider.SPOTIFY]: new Set(['open.spotify.com']),
  [MusicProvider.YOUTUBE]: new Set([
    'youtube.com',
    'www.youtube.com',
    'music.youtube.com',
    'youtu.be',
  ]),
};

@Injectable()
export class PlaylistInputService {
  catalogTrackCreateData(
    track: TrackSnapshotInput,
  ): Prisma.CatalogTrackCreateInput {
    return {
      provider: track.provider,
      providerTrackId: track.providerTrackId.trim(),
      title: this.requiredText(track.title, 'Le titre'),
      artists: track.artists.map((artist) => ({
        id: this.requiredText(artist.id, "L'identifiant de l'artiste"),
        name: this.requiredText(artist.name, "Le nom de l'artiste"),
      })),
      album: this.optionalText(track.album),
      imageUrl: track.imageUrl ?? null,
      externalUrl: track.externalUrl,
      durationMs: track.durationMs,
      isrc: this.optionalText(track.isrc),
    };
  }

  assertExternalTrackUrl(track: TrackSnapshotInput): void {
    let parsed: URL;
    try {
      parsed = new URL(track.externalUrl);
    } catch {
      throw new BadRequestException('URL externe du morceau invalide.');
    }
    if (
      parsed.protocol !== 'https:' ||
      !EXTERNAL_TRACK_HOSTS[track.provider].has(parsed.hostname.toLowerCase())
    ) {
      throw new BadRequestException(
        "L'URL externe ne correspond pas au fournisseur du morceau.",
      );
    }
  }

  requiredText(value: string, label: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${label} est obligatoire.`);
    return normalized;
  }

  optionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }
}
