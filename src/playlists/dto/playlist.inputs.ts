import { Field, InputType, Int, PartialType } from '@nestjs/graphql';
import { MusicProvider, PlaylistVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import '../../graphql/types/enums';

@InputType()
export class CreatePlaylistInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  coverUrl?: string | null;

  @Field(() => PlaylistVisibility, { nullable: true })
  @IsOptional()
  @IsEnum(PlaylistVisibility)
  visibility?: PlaylistVisibility;
}

@InputType()
export class UpdatePlaylistInput extends PartialType(CreatePlaylistInput) {}

@InputType()
export class PlaylistArtistInput {
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
export class TrackSnapshotInput {
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

  @Field(() => [PlaylistArtistInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PlaylistArtistInput)
  artists!: PlaylistArtistInput[];

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
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string | null;

  @Field()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  externalUrl!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs!: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  isrc?: string | null;
}

@InputType()
export class AddTrackToPlaylistInput {
  @Field()
  @IsUUID()
  playlistId!: string;

  @Field(() => TrackSnapshotInput)
  @ValidateNested()
  @Type(() => TrackSnapshotInput)
  track!: TrackSnapshotInput;
}

@InputType()
export class ReorderPlaylistItemsInput {
  @Field()
  @IsUUID()
  playlistId!: string;

  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  orderedItemIds!: string[];

  @Field(() => Int)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
