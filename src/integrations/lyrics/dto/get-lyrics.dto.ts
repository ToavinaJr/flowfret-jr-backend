import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GetLyricsDto {
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  title!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 500)
  artist!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 500)
  album?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  duration?: number;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  trackId?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 30)
  provider?: string;
}
