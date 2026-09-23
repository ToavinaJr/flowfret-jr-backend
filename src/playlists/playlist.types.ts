import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';
import { MusicProvider, PlaylistVisibility } from '@prisma/client';
import '../graphql/types/enums';

@ObjectType()
export class PlaylistArtistModel {
  @Field()
  id!: string;

  @Field()
  name!: string;
}

@ObjectType()
export class CatalogTrackModel {
  @Field()
  id!: string;

  @Field(() => MusicProvider)
  provider!: MusicProvider;

  @Field()
  providerTrackId!: string;

  @Field()
  title!: string;

  @Field(() => [PlaylistArtistModel])
  artists!: PlaylistArtistModel[];

  @Field(() => String, { nullable: true })
  album!: string | null;

  @Field(() => String, { nullable: true })
  genre!: string | null;

  @Field(() => String, { nullable: true })
  imageUrl!: string | null;

  @Field()
  externalUrl!: string;

  @Field(() => Int)
  durationMs!: number;

  @Field(() => String, { nullable: true })
  isrc!: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType()
export class PlaylistModel {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  coverUrl!: string | null;

  @Field(() => PlaylistVisibility)
  visibility!: PlaylistVisibility;

  @Field(() => Int)
  version!: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType()
export class PlaylistItemModel {
  @Field()
  id!: string;

  @Field()
  playlistId!: string;

  @Field()
  trackId!: string;

  @Field()
  addedById!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;

  @Field(() => CatalogTrackModel)
  track!: CatalogTrackModel;
}
