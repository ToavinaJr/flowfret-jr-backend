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
  TeachingMode,
  TeachingPriceUnit,
  UserRole,
  UserStatus,
  Prisma,
} from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTeachingCourseInput,
  InstructorProfileModel,
  TeachingCourseModel,
  TeachingEnrollmentModel,
  UpdateTeachingCourseInput,
  UpdateTeachingEnrollmentInput,
  UpsertInstructorProfileInput,
} from './teaching.types';

type TeachingContext = { req: { user: { sub: string; role?: string } } };
const activeEnrollmentStatuses: TeachingEnrollmentStatus[] = [
  TeachingEnrollmentStatus.REQUESTED,
  TeachingEnrollmentStatus.INVITED,
  TeachingEnrollmentStatus.ACTIVE,
];

@Resolver()
export class TeachingResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => InstructorProfileModel, {
    name: 'myInstructorProfile',
    nullable: true,
  })
  myInstructorProfile(@Context() context: TeachingContext) {
    return this.prisma.instructorProfile.findFirst({
      where: { userId: context.req.user.sub, isDeleted: false },
    });
  }

  @Roles(UserRole.ADMIN)
  @Query(() => [InstructorProfileModel], { name: 'adminInstructorProfiles' })
  adminInstructorProfiles(
    @Args('status', { type: () => InstructorStatus, nullable: true })
    status?: InstructorStatus,
  ) {
    return this.prisma.instructorProfile.findMany({
      where: { isDeleted: false, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => InstructorProfileModel)
  async reviewInstructorProfile(
    @Args('id') id: string,
    @Args('status', { type: () => InstructorStatus }) status: InstructorStatus,
    @Context() context: TeachingContext,
  ) {
    const reviewableStatuses: InstructorStatus[] = [
      InstructorStatus.APPROVED,
      InstructorStatus.REJECTED,
      InstructorStatus.SUSPENDED,
    ];
    if (!reviewableStatuses.includes(status))
      throw new BadRequestException('Statut de validation invalide.');
    const profile = await this.prisma.instructorProfile.findFirst({
      where: { id, isDeleted: false },
    });
    if (!profile) throw new NotFoundException('Profil enseignant introuvable.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.instructorProfile.update({
        where: { id },
        data: { status },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHER_PROFILE_UPSERTED,
          entityType: AUDIT_ENTITY.INSTRUCTOR_PROFILE,
          entityId: id,
          metadata: { status, reviewed: true },
        },
      });
      return updated;
    });
  }

  @Mutation(() => InstructorProfileModel)
  async upsertInstructorProfile(
    @Args('data') data: UpsertInstructorProfileInput,
    @Context() context: TeachingContext,
  ) {
    await this.assertActiveUser(context.req.user.sub);
    const clean = {
      headline: normalizeOptionalText(data.headline),
      biography: normalizeOptionalText(data.biography),
      experienceYears: data.experienceYears,
      specialties: normalizeList(data.specialties),
      languages: normalizeList(data.languages),
    };
    const profile = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.instructorProfile.findUnique({
        where: { userId: context.req.user.sub },
      });
      const result = existing
        ? await tx.instructorProfile.update({
            where: { id: existing.id },
            data: { ...clean, isDeleted: false, deletedAt: null },
          })
        : await tx.instructorProfile.create({
            data: { userId: context.req.user.sub, ...clean },
          });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHER_PROFILE_UPSERTED,
          entityType: AUDIT_ENTITY.INSTRUCTOR_PROFILE,
          entityId: result.id,
          metadata: { status: result.status },
        },
      });
      return result;
    });
    return profile;
  }

  @Query(() => [TeachingCourseModel], { name: 'publishedTeachingCourses' })
  publishedTeachingCourses(
    @Args('take', { type: () => Int, nullable: true }) take = 30,
    @Args('after', { nullable: true }) after?: string,
  ) {
    const safeTake = Math.min(Math.max(take, 1), 50);
    return this.prisma.teachingCourse.findMany({
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
      take: safeTake,
      ...(after ? { skip: 1, cursor: { id: after } } : {}),
    });
  }

  @Query(() => [TeachingCourseModel], { name: 'myTeachingCourses' })
  myTeachingCourses(@Context() context: TeachingContext) {
    return this.prisma.teachingCourse.findMany({
      where: { isDeleted: false, instructor: { userId: context.req.user.sub } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  @Query(() => [TeachingCourseModel], { name: 'myEnrolledTeachingCourses' })
  myEnrolledTeachingCourses(@Context() context: TeachingContext) {
    return this.prisma.teachingCourse.findMany({
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
    });
  }

  @Query(() => [TeachingEnrollmentModel], { name: 'myTeachingEnrollments' })
  async myTeachingEnrollments(@Context() context: TeachingContext) {
    const rows = await this.prisma.teachingEnrollment.findMany({
      where: {
        studentId: context.req.user.sub,
        isDeleted: false,
        status: { in: activeEnrollmentStatuses },
      },
      include: {
        course: {
          include: {
            instructor: { include: { user: { select: { username: true } } } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      ...row,
      courseTitle: row.course.title,
      instructorUsername: row.course.instructor.user.username,
    }));
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
    return course;
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
    return updated;
  }

  @Mutation(() => TeachingCourseModel)
  async archiveTeachingCourse(
    @Args('id') id: string,
    @Context() context: TeachingContext,
  ) {
    await this.requireOwnedCourse(id, context.req.user.sub);
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.teachingCourse.update({
        where: { id },
        data: {
          status: TeachingCourseStatus.ARCHIVED,
          isDeleted: true,
          deletedAt: new Date(),
        },
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
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_COURSE_ARCHIVED,
          entityType: AUDIT_ENTITY.TEACHING_COURSE,
          entityId: id,
          metadata: {},
        },
      });
      return archived;
    });
  }

  @Query(() => [TeachingEnrollmentModel], { name: 'teachingCourseEnrollments' })
  async teachingCourseEnrollments(
    @Args('courseId') courseId: string,
    @Context() context: TeachingContext,
  ) {
    await this.requireOwnedCourse(courseId, context.req.user.sub);
    const rows = await this.prisma.teachingEnrollment.findMany({
      where: { courseId, isDeleted: false },
      include: {
        student: { select: { username: true } },
        course: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => ({
      ...row,
      studentUsername: row.student.username,
      courseTitle: row.course.title,
    }));
  }

  @Mutation(() => TeachingEnrollmentModel)
  async requestTeachingCourseEnrollment(
    @Args('courseId') courseId: string,
    @Context() context: TeachingContext,
  ) {
    const studentId = context.req.user.sub;
    const student = await this.assertActiveUser(studentId);
    const course = await this.prisma.teachingCourse.findFirst({
      where: {
        id: courseId,
        isDeleted: false,
        status: TeachingCourseStatus.PUBLISHED,
        instructor: { status: InstructorStatus.APPROVED, isDeleted: false },
      },
      include: { instructor: true },
    });
    if (!course)
      throw new NotFoundException('Cours introuvable ou indisponible.');
    if (course.instructor.userId === studentId)
      throw new BadRequestException(
        'Vous ne pouvez pas demander votre propre cours.',
      );
    await this.assertCapacity(course.id, course.maxStudents, course.format);
    const existing = await this.prisma.teachingEnrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (
      existing &&
      existing.status !== TeachingEnrollmentStatus.CANCELLED &&
      existing.status !== TeachingEnrollmentStatus.COMPLETED
    )
      throw new BadRequestException(
        'Une inscription est déjà en cours pour ce cours.',
      );
    const enrollment = await this.prisma.$transaction(async (tx) => {
      const result = existing
        ? await tx.teachingEnrollment.update({
            where: { id: existing.id },
            data: {
              status: TeachingEnrollmentStatus.REQUESTED,
              isDeleted: false,
              deletedAt: null,
              endedAt: null,
              acceptedAt: null,
            },
          })
        : await tx.teachingEnrollment.create({
            data: {
              courseId,
              studentId,
              status: TeachingEnrollmentStatus.REQUESTED,
            },
          });
      await tx.auditLog.create({
        data: {
          actorId: studentId,
          action: AUDIT_ACTION.TEACHING_ENROLLMENT_REQUESTED,
          entityType: AUDIT_ENTITY.TEACHING_ENROLLMENT,
          entityId: result.id,
          metadata: { courseId },
        },
      });
      return result;
    });
    await this.createNotification(
      course.instructor.userId,
      'TEACHING_ENROLLMENT_REQUEST',
      {
        courseId,
        enrollmentId: enrollment.id,
        studentId,
        studentUsername: student.username,
      },
    );
    return enrollment;
  }

  @Mutation(() => TeachingEnrollmentModel)
  async inviteStudentToTeachingCourse(
    @Args('courseId') courseId: string,
    @Args('studentId') studentId: string,
    @Context() context: TeachingContext,
  ) {
    const course = await this.requireOwnedCourse(
      courseId,
      context.req.user.sub,
    );
    await this.assertActiveUser(studentId);
    if (studentId === context.req.user.sub)
      throw new BadRequestException(
        'Vous ne pouvez pas vous inviter vous-même.',
      );
    await this.assertCapacity(course.id, course.maxStudents, course.format);
    const existing = await this.prisma.teachingEnrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (
      existing &&
      existing.status !== TeachingEnrollmentStatus.CANCELLED &&
      existing.status !== TeachingEnrollmentStatus.COMPLETED
    )
      throw new BadRequestException(
        'Une inscription ou invitation existe déjà pour cet élève.',
      );
    const enrollment = await this.prisma.$transaction(async (tx) => {
      const result = existing
        ? await tx.teachingEnrollment.update({
            where: { id: existing.id },
            data: {
              status: TeachingEnrollmentStatus.INVITED,
              invitedAt: new Date(),
              acceptedAt: null,
              endedAt: null,
              isDeleted: false,
              deletedAt: null,
            },
          })
        : await tx.teachingEnrollment.create({
            data: {
              courseId,
              studentId,
              status: TeachingEnrollmentStatus.INVITED,
              invitedAt: new Date(),
            },
          });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_ENROLLMENT_INVITED,
          entityType: AUDIT_ENTITY.TEACHING_ENROLLMENT,
          entityId: result.id,
          metadata: { courseId, studentId },
        },
      });
      return result;
    });
    await this.createNotification(studentId, 'TEACHING_COURSE_INVITATION', {
      courseId,
      enrollmentId: enrollment.id,
      instructorId: context.req.user.sub,
      instructorUsername: (
        await this.prisma.user.findUnique({
          where: { id: context.req.user.sub },
          select: { username: true },
        })
      )?.username,
    });
    return enrollment;
  }

  @Mutation(() => TeachingEnrollmentModel)
  async respondToTeachingCourseInvitation(
    @Args('enrollmentId') enrollmentId: string,
    @Args('accept') accept: boolean,
    @Context() context: TeachingContext,
  ) {
    const enrollment = await this.prisma.teachingEnrollment.findFirst({
      where: {
        id: enrollmentId,
        studentId: context.req.user.sub,
        status: TeachingEnrollmentStatus.INVITED,
        isDeleted: false,
      },
      include: { course: { include: { instructor: true } } },
    });
    if (!enrollment)
      throw new NotFoundException('Invitation introuvable ou déjà traitée.');
    if (accept)
      await this.assertCapacity(
        enrollment.courseId,
        enrollment.course.maxStudents,
        enrollment.course.format,
      );
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.teachingEnrollment.update({
        where: { id: enrollmentId },
        data: accept
          ? {
              status: TeachingEnrollmentStatus.REQUESTED,
              acceptedAt: new Date(),
            }
          : { status: TeachingEnrollmentStatus.CANCELLED, endedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_ENROLLMENT_UPDATED,
          entityType: AUDIT_ENTITY.TEACHING_ENROLLMENT,
          entityId: enrollmentId,
          metadata: { acceptedInvitation: accept },
        },
      });
      return updated;
    });
    if (accept)
      await this.createNotification(
        enrollment.course.instructor.userId,
        'TEACHING_ENROLLMENT_REQUEST',
        {
          courseId: enrollment.courseId,
          enrollmentId,
          studentId: context.req.user.sub,
        },
      );
    return result;
  }

  @Mutation(() => TeachingEnrollmentModel)
  async updateTeachingEnrollment(
    @Args('id') id: string,
    @Args('data') data: UpdateTeachingEnrollmentInput,
    @Context() context: TeachingContext,
  ) {
    const enrollment = await this.prisma.teachingEnrollment.findFirst({
      where: { id, isDeleted: false },
      include: { course: { include: { instructor: true } } },
    });
    if (!enrollment) throw new NotFoundException('Inscription introuvable.');
    if (
      enrollment.status === TeachingEnrollmentStatus.CANCELLED ||
      enrollment.status === TeachingEnrollmentStatus.COMPLETED
    )
      throw new BadRequestException('Cette inscription est terminée.');
    const isInstructor = await this.prisma.teachingCourse.count({
      where: {
        id: enrollment.courseId,
        instructor: { userId: context.req.user.sub },
      },
    });
    const isStudent = enrollment.studentId === context.req.user.sub;
    if (
      !isInstructor &&
      !(isStudent && data.status === TeachingEnrollmentStatus.CANCELLED)
    )
      throw new ForbiddenException('Action non autorisée.');
    const allowedByInstructor: TeachingEnrollmentStatus[] = [
      TeachingEnrollmentStatus.ACTIVE,
      TeachingEnrollmentStatus.PAUSED,
      TeachingEnrollmentStatus.COMPLETED,
      TeachingEnrollmentStatus.CANCELLED,
    ];
    if (isInstructor && !allowedByInstructor.includes(data.status))
      throw new BadRequestException('Transition de statut invalide.');
    if (isStudent && data.status !== TeachingEnrollmentStatus.CANCELLED)
      throw new BadRequestException(
        'Un élève peut uniquement annuler sa demande ou son inscription.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.teachingEnrollment.update({
        where: { id },
        data: {
          status: data.status,
          endedAt:
            data.status === TeachingEnrollmentStatus.CANCELLED ||
            data.status === TeachingEnrollmentStatus.COMPLETED
              ? new Date()
              : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_ENROLLMENT_UPDATED,
          entityType: AUDIT_ENTITY.TEACHING_ENROLLMENT,
          entityId: id,
          metadata: { from: enrollment.status, to: data.status },
        },
      });
      return result;
    });
    await this.createNotification(
      isInstructor ? enrollment.studentId : enrollment.course.instructor.userId,
      'TEACHING_ENROLLMENT_UPDATED',
      { courseId: enrollment.courseId, enrollmentId: id, status: data.status },
    );
    return updated;
  }

  private async assertActiveUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE, isDeleted: false },
      select: { id: true, username: true },
    });
    if (!user)
      throw new ForbiddenException('Un compte FlowFret actif est requis.');
    return user;
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

  private async assertCapacity(
    courseId: string,
    maxStudents: number,
    format: TeachingCourseFormat,
  ) {
    if (format === TeachingCourseFormat.INDIVIDUAL) {
      const occupied = await this.prisma.teachingEnrollment.count({
        where: {
          courseId,
          isDeleted: false,
          status: { in: activeEnrollmentStatuses },
        },
      });
      if (occupied > 0)
        throw new BadRequestException(
          'Ce cours individuel a déjà une demande ou une place réservée.',
        );
    } else {
      const occupied = await this.prisma.teachingEnrollment.count({
        where: {
          courseId,
          isDeleted: false,
          status: { in: activeEnrollmentStatuses },
        },
      });
      if (occupied >= maxStudents)
        throw new BadRequestException('Ce cours a atteint sa capacité.');
    }
  }

  private async createNotification(
    userId: string,
    type:
      | 'TEACHING_COURSE_INVITATION'
      | 'TEACHING_ENROLLMENT_REQUEST'
      | 'TEACHING_ENROLLMENT_UPDATED',
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

function normalizeOptionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const result = value.trim();
  return result.length ? result : null;
}

function normalizeList(values: string[] | undefined): string[] | undefined {
  if (!values) return values;
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
