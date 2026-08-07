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
  @Field(() => ID)
  youtubeId: string;

  @Field()
  title: string;

  @Field(() => [MusicArtist])
  artists: MusicArtist[];

  @Field(() => String, { nullable: true })
  imageUrl: string | null;

  @Field()
  youtubeUrl: string;

  @Field(() => String, { nullable: true })
  geniusUrl: string | null;

  @Field(() => Float, { nullable: true })
  geniusMatchScore: number | null;

  @Field(() => Int)
  durationMs: number;
}

@ObjectType()
export class MusicSearchResult {
  @Field(() => [MusicTrack])
  tracks: MusicTrack[];

  @Field(() => Int)
  total: number;
}
