import { Field, InputType, PartialType } from '@nestjs/graphql';
import { ProfileVisibility, UserStatus } from '@prisma/client';
import './enums';
import { IsEmail, IsEnum, IsOptional, IsString, IsUrl, IsUUID, MaxLength, MinLength } from 'class-validator';

@InputType()
export class CreateUserInput {
  @Field() @IsEmail() @MaxLength(255) email!: string;
  @Field() @IsString() @MinLength(8) @MaxLength(255) passwordHash!: string;
  @Field() @IsString() @MinLength(2) @MaxLength(50) username!: string;
  @Field(() => UserStatus, { nullable: true }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}
@InputType()
export class CreateProfileInput {
  @Field() @IsUUID() userId!: string;
  @Field() @IsString() @MinLength(1) @MaxLength(120) displayName!: string;
  @Field(() => String, { nullable: true }) @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) avatarUrl?: string | null;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(1000) bio?: string | null;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(120) location?: string | null;
  @Field(() => String, { nullable: true }) @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) websiteUrl?: string | null;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(50) level?: string | null;
  @Field(() => ProfileVisibility, { nullable: true })
  @IsOptional()
  @IsEnum(ProfileVisibility)
  visibility?: ProfileVisibility;
}
@InputType()
export class UpdateProfileInput extends PartialType(CreateProfileInput) {}
