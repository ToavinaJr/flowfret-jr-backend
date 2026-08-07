import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from 'class-validator';
import {
  ALLOWED_WHISPER_MODELS,
  DEFAULT_WHISPER_MODEL,
} from '../transcriptions.constants';

export class CreateTranscriptionDto {
  @IsString()
  @Length(1, 255)
  trackId: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  audioUrl: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  artist?: string;

  @IsOptional()
  @Matches(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
  language?: string;

  @Transform(({ value }: { value: unknown }) => value ?? DEFAULT_WHISPER_MODEL)
  @IsIn(ALLOWED_WHISPER_MODELS)
  model: string = DEFAULT_WHISPER_MODEL;
}
