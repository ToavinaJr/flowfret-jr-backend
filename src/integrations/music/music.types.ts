import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MusicArtist {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;
}

@ObjectType()
export class MusicTrack {
  @Field()
  provider: string;

  @Field(() => ID)
  id: string;

  @Field(() => ID)
  providerTrackId: string;

  @Field(() => ID, {
    deprecationReason: 'Use providerTrackId together with provider.',
  })
  audiusId: string;

  @Field()
  title: string;

  @Field(() => [MusicArtist])
  artists: MusicArtist[];

  @Field(() => String, { nullable: true })
  imageUrl: string | null;

  @Field()
  audiusUrl: string;

  @Field()
  externalUrl: string;

  @Field(() => String, { nullable: true })
  album: string | null;

  @Field(() => String, { nullable: true })
  isrc: string | null;

  @Field()
  streamUrl: string;

  @Field(() => String, { nullable: true })
  genre: string | null;

  @Field(() => String, { nullable: true })
  geniusUrl: string | null;

  @Field(() => Float, { nullable: true })
  geniusMatchScore: number | null;

  @Field(() => Int)
  durationMs: number;
}

@ObjectType()
export class MusicSearchResult {
  @Field()
  provider: string;

  @Field(() => [MusicTrack])
  tracks: MusicTrack[];

  @Field(() => Int)
  total: number;

  @Field(() => String, { nullable: true })
  nextCursor: string | null;
}
