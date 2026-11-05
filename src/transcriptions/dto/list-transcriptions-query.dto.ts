import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListTranscriptionsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take = 20;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  skip = 0;
}
