import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ReportLyricsDto {
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

  @Transform(trim)
  @IsString()
  @Length(5, 1000)
  reason!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 20_000)
  proposedLyrics?: string;
}
