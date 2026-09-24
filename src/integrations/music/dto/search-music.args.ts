import { ArgsType, Field, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SPOTIFY_SEARCH_DEFAULT_LIMIT } from '../../spotify/spotify.constants';

@ArgsType()
export class SearchMusicArgs {
  @Field()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  query!: string;

  @Field(() => Int, {
    nullable: true,
    defaultValue: SPOTIFY_SEARCH_DEFAULT_LIMIT,
  })
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = SPOTIFY_SEARCH_DEFAULT_LIMIT;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cursor?: string;
}
