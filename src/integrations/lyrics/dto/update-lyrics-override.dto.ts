import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateLyricsOverrideDto {
  @Transform(trim)
  @IsString()
  @Length(1, 30)
  provider!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 255)
  trackId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 500)
  title!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 500)
  artist!: string;

  @IsString()
  @Length(1, 20_000)
  plainLyrics!: string;
}
