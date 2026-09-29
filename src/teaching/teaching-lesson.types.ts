import {
  Field,
  GraphQLISODateTime,
  InputType,
  ObjectType,
} from '@nestjs/graphql';
import {
  LessonAttendanceStatus,
  TeachingLessonStatus,
  TeachingMode,
} from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import './teaching.types';

@ObjectType()
export class LessonAttendanceModel {
  @Field() id!: string;
  @Field() lessonId!: string;
  @Field() enrollmentId!: string;
  @Field(() => LessonAttendanceStatus) status!: LessonAttendanceStatus;
  @Field(() => String, { nullable: true }) note!: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) markedAt!: Date | null;
  @Field(() => String, { nullable: true }) studentUsername?: string;
}

@ObjectType()
export class TeachingLessonModel {
  @Field() id!: string;
  @Field() courseId!: string;
  @Field() createdById!: string;
  @Field() courseTitle!: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field(() => GraphQLISODateTime) endsAt!: Date;
  @Field() timeZone!: string;
  @Field(() => TeachingMode) teachingMode!: TeachingMode;
  @Field(() => String, { nullable: true }) location!: string | null;
  @Field(() => String, { nullable: true }) meetingUrl!: string | null;
  @Field(() => TeachingLessonStatus) status!: TeachingLessonStatus;
  @Field(() => String, { nullable: true }) cancellationNote!: string | null;
  @Field(() => [LessonAttendanceModel]) attendances?: LessonAttendanceModel[];
}

@InputType()
export class TeachingLessonInput {
  @Field(() => GraphQLISODateTime)
  startsAt!: Date;

  @Field()
  @IsString()
  @MaxLength(64)
  timeZone!: string;

  @Field(() => TeachingMode, { nullable: true })
  @IsOptional()
  @IsEnum(TeachingMode)
  teachingMode?: TeachingMode;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  meetingUrl?: string | null;
}

@InputType()
export class LessonAttendanceInput {
  @Field(() => LessonAttendanceStatus)
  @IsEnum(LessonAttendanceStatus)
  status!: LessonAttendanceStatus;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

@ObjectType()
export class TeachingCalendarEntryModel {
  @Field(() => [TeachingLessonModel]) lessons!: TeachingLessonModel[];
}
