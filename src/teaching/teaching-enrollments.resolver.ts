import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  InstructorStatus,
  TeachingCourseStatus,
  TeachingEnrollmentStatus,
  TeachingLessonStatus,
} from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { RateLimits } from '../auth/rate-limit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingAccessPolicy } from './teaching-access.policy';
import { TeachingEnrollmentSupport } from './teaching-enrollment-support';
import {
  TeachingEnrollmentModel,
  UpdateTeachingEnrollmentInput,
} from './teaching.types';

type TeachingContext = { req: { user: { sub: string; role?: string } } };
const activeEnrollmentStatuses: TeachingEnrollmentStatus[] = [
  TeachingEnrollmentStatus.REQUESTED,
  TeachingEnrollmentStatus.INVITED,
  TeachingEnrollmentStatus.ACTIVE,
  TeachingEnrollmentStatus.PAUSED,
];

@Resolver()
@RateLimits({ limit: 120, windowSeconds: 60, failClosed: true })
export class TeachingEnrollmentsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: TeachingAccessPolicy,
    private readonly enrollmentSupport: TeachingEnrollmentSupport,
  ) {}
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

  @Query(() => [TeachingEnrollmentModel], {
    name: 'myTeachingCourseEnrollments',
  })
  async myTeachingCourseEnrollments(@Context() context: TeachingContext) {
    const rows = await this.prisma.teachingEnrollment.findMany({
      where: {
        isDeleted: false,
        status: { in: activeEnrollmentStatuses },
        course: {
          isDeleted: false,
          instructor: { userId: context.req.user.sub },
        },
      },
      include: {
        student: { select: { username: true } },
        course: { select: { title: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return rows.map((row) => ({
      ...row,
      studentUsername: row.student.username,
      courseTitle: row.course.title,
    }));
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
    const student = await this.accessPolicy.assertActiveUser(studentId);
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
    await this.enrollmentSupport.assertCapacity(
      course.id,
      course.maxStudents,
      course.format,
    );
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
      await this.enrollmentSupport.assertCapacityInTransaction(
        tx,
        course.id,
        course.maxStudents,
        course.format,
      );
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
    await this.enrollmentSupport.createNotification(
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
    await this.accessPolicy.assertActiveUser(studentId);
    if (studentId === context.req.user.sub)
      throw new BadRequestException(
        'Vous ne pouvez pas vous inviter vous-même.',
      );
    await this.enrollmentSupport.assertCapacity(
      course.id,
      course.maxStudents,
      course.format,
    );
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
      await this.enrollmentSupport.assertCapacityInTransaction(
        tx,
        course.id,
        course.maxStudents,
        course.format,
      );
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
    await this.enrollmentSupport.createNotification(
      studentId,
      'TEACHING_COURSE_INVITATION',
      {
        courseId,
        enrollmentId: enrollment.id,
        instructorId: context.req.user.sub,
        instructorUsername: (
          await this.prisma.user.findUnique({
            where: { id: context.req.user.sub },
            select: { username: true },
          })
        )?.username,
      },
    );
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
      await this.enrollmentSupport.assertCapacity(
        enrollment.courseId,
        enrollment.course.maxStudents,
        enrollment.course.format,
      );
    const result = await this.prisma.$transaction(async (tx) => {
      if (accept) {
        await this.enrollmentSupport.assertCapacityInTransaction(
          tx,
          enrollment.courseId,
          enrollment.course.maxStudents,
          enrollment.course.format,
          enrollment.id,
        );
      }
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
      await this.enrollmentSupport.createNotification(
        enrollment.course.instructor.userId,
        'TEACHING_ENROLLMENT_REQUEST',
        {
          courseId: enrollment.courseId,
          enrollmentId,
          studentId: context.req.user.sub,
        },
      );
    else
      await this.enrollmentSupport.createNotification(
        enrollment.course.instructor.userId,
        'TEACHING_ENROLLMENT_UPDATED',
        {
          courseId: enrollment.courseId,
          enrollmentId,
          studentId: context.req.user.sub,
          status: TeachingEnrollmentStatus.CANCELLED,
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
      if (data.status === TeachingEnrollmentStatus.ACTIVE) {
        await this.enrollmentSupport.assertCapacityInTransaction(
          tx,
          enrollment.courseId,
          enrollment.course.maxStudents,
          enrollment.course.format,
          enrollment.id,
        );
      }
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
      if (data.status === TeachingEnrollmentStatus.ACTIVE) {
        const upcomingLessons = await tx.teachingLesson.findMany({
          where: {
            courseId: enrollment.courseId,
            status: TeachingLessonStatus.SCHEDULED,
            endsAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (upcomingLessons.length) {
          await tx.lessonAttendance.createMany({
            data: upcomingLessons.map(({ id: lessonId }) => ({
              lessonId,
              enrollmentId: id,
            })),
            skipDuplicates: true,
          });
          await tx.lessonAttendance.updateMany({
            where: {
              enrollmentId: id,
              lessonId: {
                in: upcomingLessons.map(({ id: lessonId }) => lessonId),
              },
            },
            data: { status: 'EXPECTED', note: null, markedAt: null },
          });
        }
      }
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
    await this.enrollmentSupport.createNotification(
      isInstructor ? enrollment.studentId : enrollment.course.instructor.userId,
      'TEACHING_ENROLLMENT_UPDATED',
      { courseId: enrollment.courseId, enrollmentId: id, status: data.status },
    );
    return updated;
  }

  private async requireOwnedCourse(id: string, userId: string) {
    const course = await this.prisma.teachingCourse.findFirst({
      where: { id, isDeleted: false, instructor: { userId } },
    });
    if (!course) throw new NotFoundException('Cours introuvable.');
    return course;
  }
}
