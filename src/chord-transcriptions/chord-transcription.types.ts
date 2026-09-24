import { Field, Float, InputType, ObjectType } from '@nestjs/graphql';
import { MusicProvider } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import '../graphql/types/enums';

@InputType()
export class ChordCueInput {
  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(86_400)
  start!: number;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(86_400)
  end!: number;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/^[A-G](?:#|b)?(?:maj7|m7|sus2|sus4|dim|aug|7|m)?$/)
  chord!: string;
}

@ObjectType()
export class ChordCueModel {
  @Field(() => Float) start!: number;
  @Field(() => Float) end!: number;
  @Field() chord!: string;
}

@InputType()
export class SaveChordTranscriptionInput {
  @Field(() => MusicProvider)
  @IsEnum(MusicProvider)
  provider!: MusicProvider;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  providerTrackId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  artist?: string | null;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(86_400)
  duration!: number;

  @Field(() => [ChordCueInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => ChordCueInput)
  cues!: ChordCueInput[];

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  engineVersion!: string;
}

@ObjectType()
export class ChordTranscriptionModel {
  @Field() id!: string;
  @Field(() => MusicProvider) provider!: MusicProvider;
  @Field() providerTrackId!: string;
  @Field(() => String, { nullable: true }) title!: string | null;
  @Field(() => String, { nullable: true }) artist!: string | null;
  @Field(() => Float) duration!: number;
  @Field(() => [ChordCueModel]) cues!: ChordCueModel[];
  @Field() engineVersion!: string;
}
