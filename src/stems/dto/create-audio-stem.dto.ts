import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { MusicProvider } from '@prisma/client';

export class CreateAudioStemDto {
  @Transform(({ value }: { value: unknown }) => value ?? MusicProvider.AUDIUS)
  @IsIn([MusicProvider.AUDIUS, MusicProvider.YOUTUBE])
  provider?: MusicProvider = MusicProvider.AUDIUS;

  @IsString()
  @Length(1, 255)
  trackId!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  audioUrl!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  artist?: string;
}
