import { Field, InputType, PartialType } from '@nestjs/graphql';
import { ProfileVisibility } from '@prisma/client';
import './enums';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateMeInput {
  @Field() @IsString() @MinLength(2) @MaxLength(50) username!: string;
}
@InputType()
export class CreateProfileInput {
  @Field() @IsString() @MinLength(1) @MaxLength(120) displayName!: string;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  avatarUrl?: string | null;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string | null;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string | null;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  websiteUrl?: string | null;
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  level?: string | null;
  @Field(() => ProfileVisibility, { nullable: true })
  @IsOptional()
  @IsEnum(ProfileVisibility)
  visibility?: ProfileVisibility;
}
@InputType()
export class UpdateProfileInput extends PartialType(CreateProfileInput) {}
