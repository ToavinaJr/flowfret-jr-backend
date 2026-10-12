import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LyricsOverrideLineDto {
  @IsOptional()
  startTimeMs!: number | null;

  @IsString()
  @Length(0, 2000)
  text!: string;
}

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LyricsOverrideLineDto)
  lines!: LyricsOverrideLineDto[];
}
