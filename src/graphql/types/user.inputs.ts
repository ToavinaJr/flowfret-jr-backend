import { Field, InputType, PartialType } from '@nestjs/graphql';
import { ProfileVisibility, UserStatus } from '@prisma/client';
import './enums';

@InputType()
export class CreateUserInput {
  @Field() email!: string;
  @Field() passwordHash!: string;
  @Field() username!: string;
  @Field(() => UserStatus, { nullable: true }) status?: UserStatus;
}
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}
@InputType()
export class CreateProfileInput {
  @Field() userId!: string;
  @Field() displayName!: string;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field(() => String, { nullable: true }) bio?: string | null;
  @Field(() => String, { nullable: true }) location?: string | null;
  @Field(() => String, { nullable: true }) websiteUrl?: string | null;
  @Field(() => String, { nullable: true }) level?: string | null;
  @Field(() => ProfileVisibility, { nullable: true })
  visibility?: ProfileVisibility;
}
@InputType()
export class UpdateProfileInput extends PartialType(CreateProfileInput) {}
