import { Injectable } from '@nestjs/common';
import { LyricsOverrideService } from '../lyrics-override.service';
import type { LyricsProvider } from '../interfaces/lyrics-provider.interface';
import type { Lyrics, TrackMetadata } from '../interfaces/lyrics.interface';

/**
 * Always checked first: an admin-corrected lyrics override always wins over
 * any automated provider, since it reflects a human fixing a reported
 * mistake.
 */
@Injectable()
export class LyricsOverrideProvider implements LyricsProvider {
  constructor(private readonly overrides: LyricsOverrideService) {}

  async findLyrics(track: TrackMetadata): Promise<Lyrics | null> {
    if (!track.provider || !track.id) return null;
    const override = await this.overrides.find(track.provider, track.id);
    if (!override) return null;
    return {
      provider: 'override',
      synced: override.synced,
      instrumental: false,
      plainLyrics: override.plainLyrics,
      lines: override.lines as unknown as Lyrics['lines'],
    };
  }
}
