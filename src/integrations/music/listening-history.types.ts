import { Field, InputType, Int } from '@nestjs/graphql';
import { MusicProvider } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import '../../graphql/types/enums';

@InputType()
export class ListeningArtistInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  id!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}

@InputType()
export class RecordTrackListenInput {
  @Field(() => MusicProvider)
  @IsEnum(MusicProvider)
  provider!: MusicProvider;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  providerTrackId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @Field(() => [ListeningArtistInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ListeningArtistInput)
  artists!: ListeningArtistInput[];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string | null;

  @Field()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  externalUrl!: string;

  @Field()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  streamUrl!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  album?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  genre?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  isrc?: string | null;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs!: number;
}
