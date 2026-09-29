import {
  Field,
  GraphQLISODateTime,
  InputType,
  Int,
  ObjectType,
  PartialType,
} from '@nestjs/graphql';
import {
  InstructorStatus,
  TeachingCourseFormat,
  TeachingCourseStatus,
  TeachingEnrollmentStatus,
  TeachingMode,
  TeachingPriceUnit,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import '../graphql/types/enums';

@ObjectType()
export class InstructorProfileModel {
  @Field() id!: string;
  @Field() userId!: string;
  @Field(() => InstructorStatus) status!: InstructorStatus;
  @Field(() => String, { nullable: true }) headline!: string | null;
  @Field(() => String, { nullable: true }) biography!: string | null;
  @Field(() => Int, { nullable: true }) experienceYears!: number | null;
  @Field(() => [String]) specialties!: string[];
  @Field(() => [String]) languages!: string[];
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class TeachingCourseModel {
  @Field() id!: string;
  @Field() instructorId!: string;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) description!: string | null;
  @Field(() => String, { nullable: true }) level!: string | null;
  @Field(() => TeachingCourseFormat) format!: TeachingCourseFormat;
  @Field(() => Int) maxStudents!: number;
  @Field(() => TeachingMode) teachingMode!: TeachingMode;
  /** Price is an integer in the smallest currency unit (for example cents). */
  @Field(() => Int) priceAmount!: number;
  @Field() priceCurrency!: string;
  @Field(() => TeachingPriceUnit) priceUnit!: TeachingPriceUnit;
  @Field(() => Int) durationMinutes!: number;
  @Field(() => TeachingCourseStatus) status!: TeachingCourseStatus;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class TeachingEnrollmentModel {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field() studentId!: string;
  @Field(() => TeachingEnrollmentStatus) status!: TeachingEnrollmentStatus;
  @Field(() => GraphQLISODateTime, { nullable: true }) invitedAt!: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) acceptedAt!: Date | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) endedAt!: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@InputType()
export class UpsertInstructorProfileInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  headline?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  biography?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears?: number | null;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  specialties?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languages?: string[];
}

@InputType()
export class CreateTeachingCourseInput {
  @Field()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  level?: string | null;

  @Field(() => TeachingCourseFormat, { nullable: true })
  @IsOptional()
  @IsEnum(TeachingCourseFormat)
  format?: TeachingCourseFormat;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxStudents?: number;

  @Field(() => TeachingMode, { nullable: true })
  @IsOptional()
  @IsEnum(TeachingMode)
  teachingMode?: TeachingMode;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(100000000)
  priceAmount!: number;

  @Field()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  priceCurrency!: string;

  @Field(() => TeachingPriceUnit, { nullable: true })
  @IsOptional()
  @IsEnum(TeachingPriceUnit)
  priceUnit?: TeachingPriceUnit;

  @Field(() => Int)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;

  @Field(() => TeachingCourseStatus, { nullable: true })
  @IsOptional()
  @IsEnum(TeachingCourseStatus)
  status?: TeachingCourseStatus;
}

@InputType()
export class UpdateTeachingCourseInput extends PartialType(
  CreateTeachingCourseInput,
) {}

@InputType()
export class UpdateTeachingEnrollmentInput {
  @Field(() => TeachingEnrollmentStatus)
  @IsEnum(TeachingEnrollmentStatus)
  status!: TeachingEnrollmentStatus;
}
