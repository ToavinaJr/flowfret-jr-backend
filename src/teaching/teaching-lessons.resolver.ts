import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  Args,
  Context,
  GraphQLISODateTime,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  InstructorStatus,
  LessonAttendanceStatus,
  NotificationType,
  Prisma,
  TeachingCourseStatus,
  TeachingEnrollmentStatus,
  TeachingLessonStatus,
  TeachingMode,
  UserStatus,
} from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  LessonAttendanceInput,
  TeachingLessonInput,
  TeachingLessonModel,
} from './teaching-lesson.types';

type LessonContext = { req: { user: { sub: string } } };
const participantEnrollmentStatus = TeachingEnrollmentStatus.ACTIVE;
const lessonInclude = {
  course: { include: { instructor: { select: { userId: true } } } },
  attendances: {
    include: {
      enrollment: { include: { student: { select: { username: true } } } },
    },
    orderBy: { enrollment: { student: { username: 'asc' as const } } },
  },
} satisfies Prisma.TeachingLessonInclude;

@Resolver()
export class TeachingLessonsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [TeachingLessonModel], { name: 'myTeachingLessons' })
  async myTeachingLessons(
    @Args('from', { type: () => GraphQLISODateTime }) from: Date,
    @Args('to', { type: () => GraphQLISODateTime }) to: Date,
    @Context() context: LessonContext,
  ) {
    validateWindow(from, to);
    const userId = context.req.user.sub;
    const rows = await this.prisma.teachingLesson.findMany({
      where: {
        status: { not: TeachingLessonStatus.CANCELLED },
        startsAt: { lt: to },
        endsAt: { gt: from },
        OR: [
          { course: { instructor: { userId } } },
          {
            attendances: {
              some: {
                enrollment: {
                  studentId: userId,
                  status: participantEnrollmentStatus,
                  isDeleted: false,
                },
              },
            },
          },
        ],
      },
      include: lessonInclude,
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
    return rows.map((row) => ({
      ...row,
      courseTitle: row.course.title,
      attendances:
        row.course.instructor.userId === userId
          ? row.attendances.map((attendance) => ({
              ...attendance,
              studentUsername: attendance.enrollment.student.username,
            }))
          : row.attendances
              .filter(
                (attendance) => attendance.enrollment.studentId === userId,
              )
              .map((attendance) => ({
                ...attendance,
                studentUsername: attendance.enrollment.student.username,
              })),
    }));
  }

  @Mutation(() => TeachingLessonModel)
  async scheduleTeachingLesson(
    @Args('courseId') courseId: string,
    @Args('data') data: TeachingLessonInput,
    @Context() context: LessonContext,
  ) {
    const userId = context.req.user.sub;
    const course = await this.prisma.teachingCourse.findFirst({
      where: {
        id: courseId,
        isDeleted: false,
        status: TeachingCourseStatus.PUBLISHED,
        instructor: {
          userId,
          status: InstructorStatus.APPROVED,
          isDeleted: false,
          user: { status: UserStatus.ACTIVE, isDeleted: false },
        },
      },
      include: {
        enrollments: {
          where: { status: participantEnrollmentStatus, isDeleted: false },
        },
      },
    });
    if (!course) throw new NotFoundException('Cours publié introuvable.');
    if (!course.enrollments.length)
      throw new BadRequestException(
        'Une séance exige au moins un élève inscrit et confirmé.',
      );
    const schedule = normalizeSchedule(
      data,
      course.teachingMode,
      course.durationMinutes,
    );

    const lesson = await this.withSerializable(async (tx) => {
      await this.assertNoConflicts(
        tx,
        course.instructorId,
        course.enrollments.map(({ studentId }) => studentId),
        schedule.startsAt,
        schedule.endsAt,
      );
      const created = await tx.teachingLesson.create({
        data: {
          courseId,
          createdById: userId,
          ...schedule,
          status: TeachingLessonStatus.SCHEDULED,
          attendances: {
            create: course.enrollments.map(({ id }) => ({ enrollmentId: id })),
          },
        },
        include: lessonInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AUDIT_ACTION.TEACHING_LESSON_SCHEDULED,
          entityType: AUDIT_ENTITY.TEACHING_LESSON,
          entityId: created.id,
          metadata: {
            courseId,
            startsAt: schedule.startsAt.toISOString(),
            timeZone: schedule.timeZone,
          },
        },
      });
      return created;
    });
    await this.notifyLesson(lesson, NotificationType.TEACHING_LESSON_SCHEDULED);
    return this.present(lesson);
  }

  @Mutation(() => [TeachingLessonModel])
  async scheduleTeachingLessonSeries(
    @Args('courseId') courseId: string,
    @Args('data') data: TeachingLessonInput,
    @Args('occurrences', { type: () => Int }) occurrences: number,
    @Context() context: LessonContext,
  ) {
    if (!Number.isInteger(occurrences) || occurrences < 2 || occurrences > 24)
      throw new BadRequestException(
        'Une série doit contenir entre 2 et 24 séances.',
      );
    const userId = context.req.user.sub;
    const course = await this.prisma.teachingCourse.findFirst({
      where: {
        id: courseId,
        isDeleted: false,
        status: TeachingCourseStatus.PUBLISHED,
        instructor: {
          userId,
          status: InstructorStatus.APPROVED,
          isDeleted: false,
          user: { status: UserStatus.ACTIVE, isDeleted: false },
        },
      },
      include: {
        enrollments: {
          where: { status: participantEnrollmentStatus, isDeleted: false },
        },
      },
    });
    if (!course) throw new NotFoundException('Cours publié introuvable.');
    if (!course.enrollments.length)
      throw new BadRequestException(
        'Une série exige au moins un élève inscrit et confirmé.',
      );

    const students = course.enrollments.map(({ studentId }) => studentId);
    const schedules = Array.from({ length: occurrences }, (_, index) =>
      normalizeSchedule(
        {
          ...data,
          startsAt: new Date(
            new Date(data.startsAt).getTime() + index * 7 * 24 * 60 * 60 * 1000,
          ),
        },
        course.teachingMode,
        course.durationMinutes,
      ),
    );
    const lessons = await this.withSerializable(async (tx) => {
      const created: Array<
        Prisma.TeachingLessonGetPayload<{ include: typeof lessonInclude }>
      > = [];
      for (const schedule of schedules) {
        await this.assertNoConflicts(
          tx,
          course.instructorId,
          students,
          schedule.startsAt,
          schedule.endsAt,
        );
        created.push(
          await tx.teachingLesson.create({
            data: {
              courseId,
              createdById: userId,
              ...schedule,
              status: TeachingLessonStatus.SCHEDULED,
              attendances: {
                create: course.enrollments.map(({ id }) => ({
                  enrollmentId: id,
                })),
              },
            },
            include: lessonInclude,
          }),
        );
      }
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'TEACHING_LESSON_SERIES_SCHEDULED',
          entityType: AUDIT_ENTITY.TEACHING_LESSON,
          entityId: created[0]?.id,
          metadata: {
            courseId,
            lessonIds: created.map(({ id }) => id),
            occurrences,
            startsAt: schedules[0].startsAt.toISOString(),
          },
        },
      });
      return created;
    });
    for (const lesson of lessons)
      await this.notifyLesson(
        lesson,
        NotificationType.TEACHING_LESSON_SCHEDULED,
      );
    return lessons.map((lesson) => this.present(lesson));
  }

  @Mutation(() => TeachingLessonModel)
  async rescheduleTeachingLesson(
    @Args('id') id: string,
    @Args('data') data: TeachingLessonInput,
    @Context() context: LessonContext,
  ) {
    const lesson = await this.getOwnedLesson(id, context.req.user.sub);
    if (lesson.status !== TeachingLessonStatus.SCHEDULED)
      throw new BadRequestException(
        'Seules les séances à venir peuvent être déplacées.',
      );
    const schedule = normalizeSchedule(
      data,
      lesson.course.teachingMode,
      lesson.course.durationMinutes,
    );
    const updated = await this.withSerializable(async (tx) => {
      const studentIds = lesson.attendances
        .filter(
          ({ enrollment }) =>
            enrollment.status === participantEnrollmentStatus &&
            !enrollment.isDeleted,
        )
        .map(({ enrollment }) => enrollment.studentId);
      await this.assertNoConflicts(
        tx,
        lesson.course.instructorId,
        studentIds,
        schedule.startsAt,
        schedule.endsAt,
        id,
      );
      const result = await tx.teachingLesson.update({
        where: { id },
        data: schedule,
        include: lessonInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_LESSON_RESCHEDULED,
          entityType: AUDIT_ENTITY.TEACHING_LESSON,
          entityId: id,
          metadata: {
            startsAt: schedule.startsAt.toISOString(),
            timeZone: schedule.timeZone,
          },
        },
      });
      return result;
    });
    await this.notifyLesson(
      updated,
      NotificationType.TEACHING_LESSON_RESCHEDULED,
    );
    return this.present(updated);
  }

  @Mutation(() => TeachingLessonModel)
  async cancelTeachingLesson(
    @Args('id') id: string,
    @Args('note', { type: () => String, nullable: true })
    note: string | undefined,
    @Context() context: LessonContext,
  ) {
    const lesson = await this.getOwnedLesson(id, context.req.user.sub);
    if (lesson.status !== TeachingLessonStatus.SCHEDULED)
      throw new BadRequestException('Cette séance n’est plus annulable.');
    const cancellationNote = note?.trim() || null;
    if (cancellationNote && cancellationNote.length > 1000)
      throw new BadRequestException('Le motif d’annulation est trop long.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.teachingLesson.update({
        where: { id },
        data: { status: TeachingLessonStatus.CANCELLED, cancellationNote },
        include: lessonInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_LESSON_CANCELLED,
          entityType: AUDIT_ENTITY.TEACHING_LESSON,
          entityId: id,
          metadata: { note: cancellationNote },
        },
      });
      return result;
    });
    await this.notifyLesson(
      updated,
      NotificationType.TEACHING_LESSON_CANCELLED,
    );
    return this.present(updated);
  }

  @Mutation(() => TeachingLessonModel)
  async completeTeachingLesson(
    @Args('id') id: string,
    @Context() context: LessonContext,
  ) {
    const lesson = await this.getOwnedLesson(id, context.req.user.sub);
    if (
      lesson.status !== TeachingLessonStatus.SCHEDULED ||
      lesson.endsAt > new Date()
    )
      throw new BadRequestException(
        'Une séance ne peut être terminée qu’après son heure de fin.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.teachingLesson.update({
        where: { id },
        data: { status: TeachingLessonStatus.COMPLETED },
        include: lessonInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHING_LESSON_COMPLETED,
          entityType: AUDIT_ENTITY.TEACHING_LESSON,
          entityId: id,
          metadata: {},
        },
      });
      return result;
    });
    await this.notifyLesson(
      updated,
      NotificationType.TEACHING_LESSON_COMPLETED,
    );
    return this.present(updated);
  }

  @Mutation(() => TeachingLessonModel)
  async markLessonAttendance(
    @Args('lessonId') lessonId: string,
    @Args('enrollmentId') enrollmentId: string,
    @Args('data') data: LessonAttendanceInput,
    @Context() context: LessonContext,
  ) {
    const lesson = await this.getOwnedLesson(lessonId, context.req.user.sub);
    if (lesson.status !== TeachingLessonStatus.COMPLETED)
      throw new BadRequestException(
        'La présence se renseigne après avoir terminé la séance.',
      );
    if (data.status === LessonAttendanceStatus.EXPECTED)
      throw new BadRequestException('Choisissez présent, absent ou excusé.');
    const attendance = await this.prisma.lessonAttendance.findFirst({
      where: { lessonId, enrollmentId },
    });
    if (!attendance)
      throw new NotFoundException('Participant introuvable pour cette séance.');
    await this.prisma.$transaction(async (tx) => {
      await tx.lessonAttendance.update({
        where: { id: attendance.id },
        data: {
          status: data.status,
          note: data.note?.trim() || null,
          markedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'TEACHING_LESSON_ATTENDANCE_MARKED',
          entityType: AUDIT_ENTITY.TEACHING_LESSON,
          entityId: lessonId,
          metadata: { enrollmentId, status: data.status },
        },
      });
    });
    const refreshed = await this.prisma.teachingLesson.findUnique({
      where: { id: lessonId },
      include: lessonInclude,
    });
    if (!refreshed) throw new NotFoundException('Séance introuvable.');
    return this.present(refreshed);
  }

  private async getOwnedLesson(id: string, userId: string) {
    const lesson = await this.prisma.teachingLesson.findFirst({
      where: { id, course: { instructor: { userId } } },
      include: lessonInclude,
    });
    if (!lesson) throw new NotFoundException('Séance introuvable.');
    return lesson;
  }

  private async assertNoConflicts(
    tx: Prisma.TransactionClient,
    instructorId: string,
    studentIds: string[],
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ) {
    const conflict = await tx.teachingLesson.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        status: TeachingLessonStatus.SCHEDULED,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [
          { course: { instructorId } },
          ...(studentIds.length
            ? [
                {
                  attendances: {
                    some: {
                      enrollment: {
                        studentId: { in: studentIds },
                        status: participantEnrollmentStatus,
                        isDeleted: false,
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      },
      select: { id: true },
    });
    if (conflict)
      throw new ConflictException(
        'Le créneau chevauche une autre séance de l’enseignant ou d’un élève.',
      );
  }

  private async withSerializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const serializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!serializationConflict || attempt === 2) {
          if (serializationConflict)
            throw new ConflictException(
              'Le calendrier a changé pendant la réservation. Réessayez.',
            );
          throw error;
        }
      }
    }
    throw new ConflictException(
      'Impossible de réserver ce créneau. Réessayez.',
    );
  }

  private async notifyLesson(
    lesson: Prisma.TeachingLessonGetPayload<{ include: typeof lessonInclude }>,
    type: NotificationType,
  ) {
    const recipients = [
      ...new Set(
        lesson.attendances
          .filter(
            ({ enrollment }) =>
              enrollment.status === participantEnrollmentStatus &&
              !enrollment.isDeleted,
          )
          .map(({ enrollment }) => enrollment.studentId),
      ),
    ];
    if (!recipients.length) return;
    const disabled = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: recipients }, type, enabled: false },
      select: { userId: true },
    });
    const disabledIds = new Set(disabled.map(({ userId }) => userId));
    const enabledRecipients = recipients.filter((id) => !disabledIds.has(id));
    if (!enabledRecipients.length) return;
    await this.prisma.notification.createMany({
      data: enabledRecipients.map((userId) => ({
        userId,
        type,
        payload: {
          lessonId: lesson.id,
          courseId: lesson.courseId,
          courseTitle: lesson.course.title,
          startsAt: lesson.startsAt.toISOString(),
          timeZone: lesson.timeZone,
        },
      })),
    });
  }

  private present<
    T extends Prisma.TeachingLessonGetPayload<{
      include: typeof lessonInclude;
    }>,
  >(lesson: T) {
    return {
      ...lesson,
      courseTitle: lesson.course.title,
      attendances: lesson.attendances.map((attendance) => ({
        ...attendance,
        studentUsername: attendance.enrollment.student.username,
      })),
    };
  }
}

function validateWindow(from: Date, to: Date) {
  const width = to.getTime() - from.getTime();
  if (!Number.isFinite(width) || width <= 0 || width > 93 * 24 * 60 * 60 * 1000)
    throw new BadRequestException(
      'La période doit couvrir au maximum 93 jours.',
    );
}

function normalizeSchedule(
  data: TeachingLessonInput,
  courseMode: TeachingMode,
  durationMinutes: number,
) {
  const startsAt = new Date(data.startsAt);
  if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date())
    throw new BadRequestException('La séance doit commencer dans le futur.');
  if (startsAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000)
    throw new BadRequestException(
      'Une séance ne peut pas être planifiée à plus d’un an.',
    );
  const timeZone = data.timeZone.trim();
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(startsAt);
  } catch {
    throw new BadRequestException(
      'Le fuseau horaire doit être un identifiant IANA valide.',
    );
  }
  const teachingMode =
    data.teachingMode ??
    (courseMode === TeachingMode.HYBRID ? undefined : courseMode);
  if (!teachingMode || teachingMode === TeachingMode.HYBRID)
    throw new BadRequestException(
      'Choisissez présentiel ou en ligne pour cette séance.',
    );
  if (courseMode !== TeachingMode.HYBRID && teachingMode !== courseMode)
    throw new BadRequestException(
      'Le mode choisi ne correspond pas au format du cours.',
    );
  const location = data.location?.trim() || null;
  const meetingUrl = data.meetingUrl?.trim() || null;
  if (teachingMode === TeachingMode.IN_PERSON && !location)
    throw new BadRequestException(
      'Indiquez le lieu de la séance en présentiel.',
    );
  if (teachingMode === TeachingMode.ONLINE && !meetingUrl)
    throw new BadRequestException('Indiquez le lien de la séance en ligne.');
  if (meetingUrl) {
    try {
      if (new URL(meetingUrl).protocol !== 'https:')
        throw new Error('protocol');
    } catch {
      throw new BadRequestException(
        'Le lien de réunion doit être une URL HTTPS valide.',
      );
    }
  }
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    timeZone,
    teachingMode,
    location: teachingMode === TeachingMode.ONLINE ? null : location,
    meetingUrl: teachingMode === TeachingMode.IN_PERSON ? null : meetingUrl,
  };
}
