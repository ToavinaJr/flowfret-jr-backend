import { BadRequestException, Injectable } from '@nestjs/common';
import { MusicProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChordCueModel,
  ChordTranscriptionModel,
  SaveChordTranscriptionInput,
} from './chord-transcription.types';

@Injectable()
export class ChordTranscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    provider: MusicProvider,
    providerTrackId: string,
  ): Promise<ChordTranscriptionModel | null> {
    const row = await this.prisma.chordTranscription.findUnique({
      where: {
        provider_providerTrackId: {
          provider,
          providerTrackId: providerTrackId.trim(),
        },
      },
    });
    return row ? this.toModel(row) : null;
  }

  async saveIfAbsent(
    input: SaveChordTranscriptionInput,
  ): Promise<ChordTranscriptionModel> {
    const cues = this.validateCues(input.cues, input.duration);
    const row = await this.prisma.chordTranscription.upsert({
      where: {
        provider_providerTrackId: {
          provider: input.provider,
          providerTrackId: input.providerTrackId.trim(),
        },
      },
      update: {},
      create: {
        provider: input.provider,
        providerTrackId: input.providerTrackId.trim(),
        title: input.title?.trim() || null,
        artist: input.artist?.trim() || null,
        duration: input.duration,
        cues: cues as unknown as Prisma.InputJsonValue,
        engineVersion: input.engineVersion.trim(),
      },
    });
    return this.toModel(row);
  }

  private validateCues(
    cues: ChordCueInputLike[],
    duration: number,
  ): ChordCueModel[] {
    let previousEnd = 0;
    return cues.map((cue) => {
      if (
        cue.end <= cue.start ||
        cue.start < previousEnd ||
        (duration > 0 && cue.end > duration + 1)
      ) {
        throw new BadRequestException('Invalid chord timeline.');
      }
      previousEnd = cue.end;
      return { start: cue.start, end: cue.end, chord: cue.chord };
    });
  }

  private toModel(row: {
    id: string;
    provider: MusicProvider;
    providerTrackId: string;
    title: string | null;
    artist: string | null;
    duration: number;
    cues: Prisma.JsonValue;
    engineVersion: string;
  }): ChordTranscriptionModel {
    return {
      ...row,
      cues: this.readCues(row.cues),
    };
  }

  private readCues(value: Prisma.JsonValue): ChordCueModel[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((cue) => {
      if (
        typeof cue !== 'object' ||
        cue === null ||
        Array.isArray(cue) ||
        typeof cue.start !== 'number' ||
        typeof cue.end !== 'number' ||
        typeof cue.chord !== 'string'
      )
        return [];
      return [{ start: cue.start, end: cue.end, chord: cue.chord }];
    });
  }
}

type ChordCueInputLike = Pick<ChordCueModel, 'start' | 'end' | 'chord'>;
