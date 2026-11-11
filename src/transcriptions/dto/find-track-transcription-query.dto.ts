import { MusicProvider } from '@prisma/client';
import { IsEnum, IsString, Length } from 'class-validator';

export class FindTrackTranscriptionQueryDto {
  @IsEnum(MusicProvider)
  provider!: MusicProvider;

  @IsString()
  @Length(1, 255)
  trackId!: string;
}
