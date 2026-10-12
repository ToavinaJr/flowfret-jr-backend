import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ImportTononkiraLyricsDto {
  @Transform(trim)
  @IsString()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @Length(1, 2000)
  url!: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  duration?: number;
}
