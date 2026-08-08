import {
  Field,
  GraphQLISODateTime,
  InputType,
  ObjectType,
} from '@nestjs/graphql';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { UserModel } from './models';

@InputType()
export class RegisterInput {
  @Field() @IsEmail() @MaxLength(255) email!: string;
  @Field() @IsString() @MinLength(3) @MaxLength(50) username!: string;
  @Field() @IsString() @MinLength(8) @MaxLength(72) password!: string;
}
@InputType()
export class LoginInput {
  @Field() @IsEmail() @MaxLength(255) email!: string;
  @Field() @IsString() @MinLength(1) @MaxLength(72) password!: string;
}
@InputType()
export class VerifyEmailInput {
  @Field() @IsString() @MinLength(64) @MaxLength(64) token!: string;
  @Field() @IsString() @MinLength(4) @MaxLength(4) code!: string;
}
@InputType()
export class GoogleAuthInput {
  @Field() @IsString() @MinLength(1) accessToken!: string;
}
@InputType()
export class RequestPasswordResetInput {
  @Field() @IsEmail() @MaxLength(255) email!: string;
}
@InputType()
export class ResetPasswordInput {
  @Field() @IsString() @MinLength(64) @MaxLength(64) token!: string;
  @Field() @IsString() @MinLength(8) @MaxLength(72) password!: string;
}
@ObjectType()
export class AuthPayload {
  @Field() accessToken!: string;
  @Field(() => UserModel) user!: UserModel;
}
@ObjectType()
export class RegisterPendingPayload {
  @Field() email!: string;
  @Field() verificationToken!: string;
  @Field(() => GraphQLISODateTime) expiresAt!: Date;
  @Field() message!: string;
}
