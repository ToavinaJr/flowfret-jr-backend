import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  InstructorStatus,
  TeachingCourseFormat,
  TeachingCourseStatus,
  TeachingEnrollmentStatus,
  TeachingLessonStatus,
  TeachingMode,
  TeachingPriceUnit,
  UserStatus,
  Prisma,
} from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTeachingCourseInput,
  TeachingCourseModel,
  UpdateTeachingCourseInput,
} from './teaching.types';
import { TeachingAccessPolicy } from './teaching-access.policy';
import { normalizeOptionalText } from './teaching.utils';
import { RateLimits } from '../auth/rate-limit.decorator';

type TeachingContext = { req: { user: { sub: string; role?: string } } };
const activeEnrollmentStatuses: TeachingEnrollmentStatus[] = [
  TeachingEnrollmentStatus.REQUESTED,
  TeachingEnrollmentStatus.INVITED,
  TeachingEnrollmentStatus.ACTIVE,
  TeachingEnrollmentStatus.PAUSED,
];

const coursePresentationInclude = {
  _count: {
    select: {
      enrollments: {
        where: {
          isDeleted: false,
          status: { in: activeEnrollmentStatuses },
        },
      },
    },
  },
  instructor: {
    select: {
      headline: true,
      experienceYears: true,
      specialties: true,
      languages: true,
      user: {
        select: {
          username: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
    },
  },
} satisfies Prisma.TeachingCourseInclude;

function presentCourseWithSeats<
  T extends {
    _count: { enrollments: number };
    instructor?: {
      headline: string | null;
      experienceYears: number | null;
      specialties: string[];
      languages: string[];
      user: {
        username: string;
        profile: { displayName: string; avatarUrl: string | null } | null;
      };
    };
  },
>(course: T) {
  const { _count, instructor, ...rest } = course;
  return {
    ...rest,
    reservedSeats: _count.enrollments,
    instructorUsername: instructor?.user.username ?? null,
    instructorDisplayName: instructor?.user.profile?.displayName ?? null,
    instructorAvatarUrl: instructor?.user.profile?.avatarUrl ?? null,
    instructorHeadline: instructor?.headline ?? null,
    instructorExperienceYears: instructor?.experienceYears ?? null,
    instructorSpecialties: instructor?.specialties ?? [],
    instructorLanguages: instructor?.languages ?? [],
  };
}

@Resolver()
@RateLimits({ limit: 120, windowSeconds: 60, failClosed: true })
export class TeachingResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: TeachingAccessPolicy,
  ) {}

  @Query(() => [TeachingCourseModel], { name: 'publishedTeachingCourses' })
  async publishedTeachingCourses(
    @Args('take', { type: () => Int, nullable: true }) take = 30,
    @Args('after', { nullable: true }) after?: string,
  ) {
    const safeTake = Math.min(Math.max(take, 1), 50);
    const courses = await this.prisma.teachingCourse.findMany({
      where: {
        status: TeachingCourseStatus.PUBLISHED,
        isDeleted: false,
        instructor: {
          status: InstructorStatus.APPROVED,
          isDeleted: false,
          user: { isDeleted: false, status: UserStatus.ACTIVE },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: coursePresentationInclude,
      take: safeTake,
      ...(after ? { skip: 1, cursor: { id: after } } : {}),
    });
    return courses.map(presentCourseWithSeats);
  }

  @Query(() => [TeachingCourseModel], { name: 'myTeachingCourses' })
  async myTeachingCourses(@Context() context: TeachingContext) {
    const courses = await this.prisma.teachingCourse.findMany({
      where: { isDeleted: false, instructor: { userId: context.req.user.sub } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: coursePresentationInclude,
    });
    return courses.map(presentCourseWithSeats);
  }

  @Query(() => [TeachingCourseModel], { name: 'myEnrolledTeachingCourses' })
  async myEnrolledTeachingCourses(@Context() context: TeachingContext) {
    const courses = await this.prisma.teachingCourse.findMany({
      where: {
        isDeleted: false,
        enrollments: {
          some: {
            studentId: context.req.user.sub,
            isDeleted: false,
            status: { in: activeEnrollmentStatuses },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: coursePresentationInclude,
    });
    return courses.map(presentCourseWithSeats);
  }

  @Mutation(() => TeachingCourseModel)
  async createTeachingCourse(
    @Args('data') data: CreateTeachingCourseInput,
    @Context() context: TeachingContext,
  ) {
    const instructor = await this.requireInstructor(context.req.user.sub);
    validateCourseShape(data);
    const course = await this.prisma.$transaction(async (tx) => {
      const created = await tx.teachingCourse.create({
        data: {
          instructorId: instructor.id,
          title: data.title.trim(),
          description: normalizeOptionalText(data.description) ?? null,
          level: normalizeOptionalText(data.level) ?? null,
          format: data.format ?? TeachingCourseFormat.INDIVIDUAL,
          maxStudents:
            data.maxStudents ??
            (data.format === TeachingCourseFormat.GROUP ? 2 : 1),
          teachingMode: data.teachingMode ?? TeachingMode.HYBRID,
          priceAmount: data.priceAmount,
          priceCurrency: data.priceCurrency.trim().toUpperCase(),
          priceUnit: data.priceUnit ?? TeachingPriceUnit.PER_COURSE,
          durationMinutes: data.durationMinutes,
          status: TeachingCourseStatus.DRAFT,
        },
        include: coursePresentationInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_COURSE_CREATED,
          entityType: AUDIT_ENTITY.TEACHING_COURSE,
          entityId: created.id,
          metadata: { title: created.title },
        },
      });
      return created;
    });
    return presentCourseWithSeats(course);
  }

  @Mutation(() => TeachingCourseModel)
  async updateTeachingCourse(
    @Args('id') id: string,
    @Args('data') data: UpdateTeachingCourseInput,
    @Context() context: TeachingContext,
  ) {
    const course = await this.requireOwnedCourse(id, context.req.user.sub);
    const normalized: UpdateTeachingCourseInput = { ...data };
    if (data.title !== undefined) normalized.title = data.title.trim();
    if (data.description !== undefined)
      normalized.description = normalizeOptionalText(data.description);
    if (data.level !== undefined)
      normalized.level = normalizeOptionalText(data.level);
    validateCourseShape({
      title: normalized.title ?? course.title,
      description: normalized.description,
      level: normalized.level,
      format: normalized.format ?? course.format,
      maxStudents: normalized.maxStudents ?? course.maxStudents,
      teachingMode: normalized.teachingMode ?? course.teachingMode,
      priceAmount: normalized.priceAmount ?? course.priceAmount,
      priceCurrency: normalized.priceCurrency ?? course.priceCurrency,
      priceUnit: normalized.priceUnit ?? course.priceUnit,
      durationMinutes: normalized.durationMinutes ?? course.durationMinutes,
    });
    if (normalized.status === TeachingCourseStatus.PUBLISHED) {
      const instructor = await this.requireInstructor(context.req.user.sub);
      if (instructor.status !== InstructorStatus.APPROVED)
        throw new ForbiddenException(
          'Le profil enseignant doit être approuvé avant publication.',
        );
    }
    if (normalized.status === TeachingCourseStatus.ARCHIVED)
      throw new BadRequestException(
        'Utilisez archiveTeachingCourse pour archiver un cours.',
      );
    const patch: Prisma.TeachingCourseUpdateInput = {
      ...normalized,
      title: normalized.title,
      priceCurrency: normalized.priceCurrency?.toUpperCase(),
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.teachingCourse.update({
        where: { id },
        data: patch,
        include: coursePresentationInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_COURSE_UPDATED,
          entityType: AUDIT_ENTITY.TEACHING_COURSE,
          entityId: id,
          metadata: { fields: Object.keys(normalized) },
        },
      });
      return result;
    });
    return presentCourseWithSeats(updated);
  }

  @Mutation(() => TeachingCourseModel)
  async archiveTeachingCourse(
    @Args('id') id: string,
    @Context() context: TeachingContext,
  ) {
    await this.requireOwnedCourse(id, context.req.user.sub);
    const result = await this.prisma.$transaction(async (tx) => {
      const scheduledLessons = await tx.teachingLesson.findMany({
        where: { courseId: id, status: TeachingLessonStatus.SCHEDULED },
        include: {
          attendances: { include: { enrollment: true } },
          course: { select: { title: true } },
        },
      });
      const archived = await tx.teachingCourse.update({
        where: { id },
        data: {
          status: TeachingCourseStatus.ARCHIVED,
          isDeleted: true,
          deletedAt: new Date(),
        },
        include: coursePresentationInclude,
      });
      await tx.teachingEnrollment.updateMany({
        where: {
          courseId: id,
          isDeleted: false,
          status: { in: activeEnrollmentStatuses },
        },
        data: {
          status: TeachingEnrollmentStatus.CANCELLED,
          endedAt: new Date(),
        },
      });
      await tx.teachingLesson.updateMany({
        where: { courseId: id, status: TeachingLessonStatus.SCHEDULED },
        data: {
          status: TeachingLessonStatus.CANCELLED,
          cancellationNote: 'Le cours a été archivé.',
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_COURSE_ARCHIVED,
          entityType: AUDIT_ENTITY.TEACHING_COURSE,
          entityId: id,
          metadata: {},
        },
      });
      return { archived, scheduledLessons };
    });
    for (const lesson of result.scheduledLessons) {
      const recipients = [
        ...new Set(
          lesson.attendances
            .filter(
              ({ enrollment }) =>
                enrollment.status === TeachingEnrollmentStatus.ACTIVE &&
                !enrollment.isDeleted,
            )
            .map(({ enrollment }) => enrollment.studentId),
        ),
      ];
      for (const userId of recipients)
        await this.createNotification(userId, 'TEACHING_LESSON_CANCELLED', {
          lessonId: lesson.id,
          courseId: id,
          courseTitle: lesson.course.title,
          startsAt: lesson.startsAt.toISOString(),
          timeZone: lesson.timeZone,
        });
    }
    return { ...presentCourseWithSeats(result.archived), reservedSeats: 0 };
  }

  private async requireInstructor(userId: string) {
    const profile = await this.prisma.instructorProfile.findFirst({
      where: { userId, isDeleted: false },
    });
    if (!profile)
      throw new ForbiddenException('Créez d’abord votre profil enseignant.');
    return profile;
  }

  private async requireOwnedCourse(id: string, userId: string) {
    const course = await this.prisma.teachingCourse.findFirst({
      where: { id, isDeleted: false, instructor: { userId } },
    });
    if (!course) throw new NotFoundException('Cours introuvable.');
    return course;
  }

  private async createNotification(
    userId: string,
    type:
      | 'TEACHING_COURSE_INVITATION'
      | 'TEACHING_ENROLLMENT_REQUEST'
      | 'TEACHING_ENROLLMENT_UPDATED'
      | 'TEACHING_LESSON_CANCELLED',
    payload: Prisma.InputJsonObject,
  ) {
    const notificationType =
      type as Prisma.NotificationUncheckedCreateInput['type'];
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId, type: notificationType } },
      select: { enabled: true },
    });
    if (preference?.enabled === false) return;
    await this.prisma.notification.create({
      data: { userId, type: notificationType, payload },
    });
  }
}

function validateCourseShape(data: {
  title?: string;
  format?: TeachingCourseFormat;
  maxStudents?: number;
  teachingMode?: TeachingMode;
  priceAmount?: number;
  priceCurrency?: string;
  priceUnit?: TeachingPriceUnit;
  durationMinutes?: number;
  description?: string | null;
  level?: string | null;
}) {
  if (
    !data.title?.trim() ||
    data.title.trim().length < 3 ||
    data.title.trim().length > 160
  )
    throw new BadRequestException(
      'Le titre doit contenir entre 3 et 160 caractères.',
    );
  if (!Number.isInteger(data.priceAmount) || (data.priceAmount ?? 0) <= 0)
    throw new BadRequestException(
      'Le prix doit être un montant positif en unité mineure (centimes).',
    );
  if (!/^[A-Z]{3}$/.test(data.priceCurrency ?? ''))
    throw new BadRequestException(
      'La devise doit être un code ISO 4217 à trois lettres.',
    );
  if (
    !Number.isInteger(data.durationMinutes) ||
    (data.durationMinutes ?? 0) < 15 ||
    (data.durationMinutes ?? 0) > 480
  )
    throw new BadRequestException(
      'La durée doit être comprise entre 15 et 480 minutes.',
    );
  const capacity =
    data.maxStudents ?? (data.format === TeachingCourseFormat.GROUP ? 2 : 1);
  if (
    (data.format === TeachingCourseFormat.INDIVIDUAL && capacity !== 1) ||
    (data.format === TeachingCourseFormat.GROUP && capacity < 2) ||
    capacity > 100
  )
    throw new BadRequestException(
      'La capacité doit être de 1 pour un cours individuel et de 2 à 100 pour un cours collectif.',
    );
}
