import { Injectable } from '@nestjs/common';
import { Prisma, Transcription, TranscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TranscriptionSegment } from './entities/transcription.types';

@Injectable()
export class TranscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Transcription | null> {
    return this.prisma.transcription.findUnique({ where: { id } });
  }
  findCompatible(
    trackId: string,
    requestedLanguage: string,
    model: string,
    engineVersion: string,
  ): Promise<Transcription | null> {
    return this.prisma.transcription.findUnique({
      where: {
        trackId_requestedLanguage_model_engineVersion: {
          trackId,
          requestedLanguage,
          model,
          engineVersion,
        },
      },
    });
  }
  create(data: {
    trackId: string;
    title?: string;
    artist?: string;
    requestedLanguage: string;
    model: string;
    engineVersion: string;
  }): Promise<Transcription> {
    return this.prisma.transcription.create({ data });
  }
  update(
    id: string,
    data: Prisma.TranscriptionUpdateInput,
  ): Promise<Transcription> {
    return this.prisma.transcription.update({ where: { id }, data });
  }
  saveSegments(
    id: string,
    segments: readonly TranscriptionSegment[],
    bufferedUntil: number,
    progress: number,
  ): Promise<Transcription> {
    return this.update(id, {
      segments: segments as unknown as Prisma.InputJsonValue,
      bufferedUntil,
      progress,
    });
  }
  markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<Transcription> {
    return this.update(id, {
      status: TranscriptionStatus.FAILED,
      errorCode,
      errorMessage: errorMessage.slice(0, 1000),
    });
  }
}
